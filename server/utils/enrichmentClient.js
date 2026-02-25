/**
 * Creditor Enrichment Client
 *
 * Handles communication with the FastAPI Creditor Enrichment Service.
 * Uses native fetch API (Node.js 18+).
 *
 * Features:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern (lightweight — enrichment is non-critical)
 * - Input & response validation
 * - Structured logging via Logger
 * - Request timing for performance monitoring
 */

const Logger = require('./logger');
const logger = new Logger('CreditorEnrichment');

// Configuration
const ENRICHMENT_URL = process.env.ENRICHMENT_SERVICE_URL || 'http://localhost:8001';
const ENRICHMENT_TIMEOUT = parseInt(process.env.ENRICHMENT_TIMEOUT) || 30000;
const ENRICHMENT_ENABLED = process.env.ENRICHMENT_ENABLED !== 'false';

// Retry configuration
const ENRICHMENT_RETRY_ATTEMPTS = parseInt(process.env.ENRICHMENT_RETRY_ATTEMPTS) || 2;
const ENRICHMENT_RETRY_DELAY_MS = parseInt(process.env.ENRICHMENT_RETRY_DELAY_MS) || 1000;
const ENRICHMENT_MAX_RETRY_DELAY_MS = parseInt(process.env.ENRICHMENT_MAX_RETRY_DELAY_MS) || 5000;

// Circuit Breaker configuration
const ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD) || 3;
const ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS = parseInt(process.env.ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS) || 30000;

// Max creditor name length
const MAX_CREDITOR_NAME_LENGTH = 200;

// Valid enrichment status values
const VALID_STATUSES = ['complete', 'partial', 'not_found'];

// ============================================
// Circuit Breaker
// ============================================

const CircuitState = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
};

let circuitBreaker = {
    state: CircuitState.CLOSED,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0,
};

function checkCircuitBreaker() {
    const now = Date.now();

    switch (circuitBreaker.state) {
        case CircuitState.CLOSED:
            return { allowed: true };

        case CircuitState.OPEN: {
            if (now >= circuitBreaker.nextAttemptTime) {
                circuitBreaker.state = CircuitState.HALF_OPEN;
                logger.info('circuit_breaker_half_open', { message: 'Allowing test request' });
                return { allowed: true, isTestRequest: true };
            }
            const waitSec = Math.ceil((circuitBreaker.nextAttemptTime - now) / 1000);
            return { allowed: false, reason: `Circuit breaker OPEN — retry in ${waitSec}s` };
        }

        case CircuitState.HALF_OPEN:
            return { allowed: false, reason: 'Circuit breaker HALF_OPEN — test request in progress' };

        default:
            return { allowed: true };
    }
}

function recordCircuitSuccess() {
    if (circuitBreaker.state === CircuitState.HALF_OPEN) {
        logger.info('circuit_breaker_closed', { message: 'Test request succeeded — service recovered' });
    }
    circuitBreaker = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
    };
}

function recordCircuitFailure() {
    const now = Date.now();
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = now;

    if (circuitBreaker.state === CircuitState.HALF_OPEN) {
        circuitBreaker.state = CircuitState.OPEN;
        circuitBreaker.nextAttemptTime = now + ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS;
        logger.warn('circuit_breaker_open_test_failed', {
            nextAttemptIn: `${ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS / 1000}s`,
        });
        return;
    }

    if (circuitBreaker.failureCount >= ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreaker.state = CircuitState.OPEN;
        circuitBreaker.nextAttemptTime = now + ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS;
        logger.warn('circuit_breaker_open', {
            failures: circuitBreaker.failureCount,
            threshold: ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD,
            blockDurationSec: ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS / 1000,
        });
    } else {
        logger.debug('circuit_breaker_failure_recorded', {
            failures: circuitBreaker.failureCount,
            threshold: ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD,
        });
    }
}

// ============================================
// Retry helpers
// ============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error, response = null) {
    const retryableMessages = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'fetch failed',
    ];

    const errorMessage = error?.message || String(error);
    if (retryableMessages.some(msg => errorMessage.toLowerCase().includes(msg.toLowerCase()))) {
        return true;
    }

    if (response) {
        const status = response.status;
        if (status === 502 || status === 503 || status === 504) return true;
        if (status >= 400 && status < 500) return false; // 4xx not retryable
    }

    return false;
}

// ============================================
// Response validation
// ============================================

function validateResponse(data) {
    if (typeof data !== 'object' || data === null) {
        logger.warn('invalid_response_type', { type: typeof data });
        return null;
    }

    if (!VALID_STATUSES.includes(data.status)) {
        logger.warn('invalid_response_status', { status: data.status, expected: VALID_STATUSES });
        return null;
    }

    if (typeof data.enriched_data !== 'object' || data.enriched_data === null) {
        logger.warn('invalid_enriched_data', { type: typeof data.enriched_data });
        return null;
    }

    return data;
}

// ============================================
// Input validation
// ============================================

function validateInput(creditorName, missingFields) {
    if (typeof creditorName !== 'string' || !creditorName.trim()) {
        logger.warn('invalid_creditor_name', { creditorName });
        return false;
    }

    if (creditorName.trim().length > MAX_CREDITOR_NAME_LENGTH) {
        logger.warn('creditor_name_too_long', { length: creditorName.trim().length, max: MAX_CREDITOR_NAME_LENGTH });
        return false;
    }

    if (!Array.isArray(missingFields) || missingFields.length === 0) {
        logger.warn('invalid_missing_fields', { missingFields });
        return false;
    }

    return true;
}

// ============================================
// Main API call
// ============================================

/**
 * Call the Creditor Enrichment Service to fill missing contact data via web sources.
 *
 * @param {string} creditorName - Name of the creditor
 * @param {object} knownData - Already known partial data (city, postal_code, website, etc.)
 * @param {string[]} missingFields - Fields to search for: 'email', 'address', 'phone', etc.
 * @param {string} caseId - Case reference for tracking
 * @returns {object|null} Enrichment result or null if service unavailable/disabled/invalid
 */
async function callEnrichmentService(creditorName, knownData, missingFields, caseId) {
    if (!ENRICHMENT_ENABLED) {
        logger.debug('enrichment_disabled');
        return null;
    }

    // Input validation
    if (!validateInput(creditorName, missingFields)) {
        return null;
    }

    const trimmedName = creditorName.trim();

    // Circuit breaker check
    const circuitCheck = checkCircuitBreaker();
    if (!circuitCheck.allowed) {
        logger.debug('circuit_breaker_rejected', { reason: circuitCheck.reason, creditor: trimmedName });
        return null;
    }

    const startTime = Date.now();

    for (let attempt = 0; attempt <= ENRICHMENT_RETRY_ATTEMPTS; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT);

            const response = await fetch(`${ENRICHMENT_URL}/api/v1/enrich-creditor`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connection': 'keep-alive',
                },
                body: JSON.stringify({
                    creditor_name: trimmedName,
                    known_data: knownData || {},
                    missing_fields: missingFields,
                    case_id: caseId || 'unknown',
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Non-retryable HTTP error
            if (!response.ok && !isRetryableError(null, response)) {
                const durationMs = Date.now() - startTime;
                logger.warn('enrichment_http_error', {
                    status: response.status,
                    creditor: trimmedName,
                    durationMs,
                });
                recordCircuitFailure();
                return null;
            }

            // Retryable HTTP error
            if (!response.ok && isRetryableError(null, response)) {
                recordCircuitFailure();
                if (attempt < ENRICHMENT_RETRY_ATTEMPTS) {
                    const delay = Math.min(
                        ENRICHMENT_RETRY_DELAY_MS * Math.pow(2, attempt),
                        ENRICHMENT_MAX_RETRY_DELAY_MS
                    );
                    logger.warn('enrichment_retry', {
                        attempt: attempt + 1,
                        maxAttempts: ENRICHMENT_RETRY_ATTEMPTS,
                        status: response.status,
                        delayMs: delay,
                        creditor: trimmedName,
                    });
                    await sleep(delay);
                    continue;
                }
                const durationMs = Date.now() - startTime;
                logger.error('enrichment_max_retries_exceeded', null, {
                    attempts: attempt + 1,
                    status: response.status,
                    creditor: trimmedName,
                    durationMs,
                });
                return null;
            }

            // Parse JSON
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                const durationMs = Date.now() - startTime;
                logger.warn('enrichment_json_parse_error', {
                    error: parseError.message,
                    creditor: trimmedName,
                    durationMs,
                });
                return null; // JSON parse errors are not retryable
            }

            // Validate response structure
            const validated = validateResponse(data);
            if (!validated) {
                const durationMs = Date.now() - startTime;
                logger.warn('enrichment_validation_failed', {
                    creditor: trimmedName,
                    durationMs,
                });
                return null;
            }

            // Success
            const durationMs = Date.now() - startTime;
            recordCircuitSuccess();

            logger.info('enrichment_success', {
                creditor: trimmedName,
                status: validated.status,
                fieldsEnriched: Object.keys(validated.enriched_data),
                durationMs,
                attempts: attempt + 1,
            });

            return validated;

        } catch (error) {
            clearTimeout?.(undefined); // safety — timeoutId is scoped inside try

            const isRetryable = isRetryableError(error);

            if (isRetryable) {
                recordCircuitFailure();
            }

            if (isRetryable && attempt < ENRICHMENT_RETRY_ATTEMPTS) {
                const delay = Math.min(
                    ENRICHMENT_RETRY_DELAY_MS * Math.pow(2, attempt),
                    ENRICHMENT_MAX_RETRY_DELAY_MS
                );
                logger.warn('enrichment_retry', {
                    attempt: attempt + 1,
                    maxAttempts: ENRICHMENT_RETRY_ATTEMPTS,
                    error: error.message,
                    delayMs: delay,
                    creditor: trimmedName,
                });
                await sleep(delay);
                continue;
            }

            // Final failure
            const durationMs = Date.now() - startTime;
            logger.error('enrichment_failed', error, {
                creditor: trimmedName,
                caseId: caseId || 'unknown',
                attempts: attempt + 1,
                retryable: isRetryable,
                durationMs,
                url: ENRICHMENT_URL,
            });
            return null;
        }
    }

    return null;
}

// ============================================
// Monitoring exports
// ============================================

function getCircuitBreakerState() {
    return {
        state: circuitBreaker.state,
        failureCount: circuitBreaker.failureCount,
        threshold: ENRICHMENT_CIRCUIT_BREAKER_THRESHOLD,
        lastFailureTime: circuitBreaker.lastFailureTime
            ? new Date(circuitBreaker.lastFailureTime).toISOString()
            : null,
        nextAttemptTime: circuitBreaker.nextAttemptTime
            ? new Date(circuitBreaker.nextAttemptTime).toISOString()
            : null,
        timeoutMs: ENRICHMENT_CIRCUIT_BREAKER_TIMEOUT_MS,
    };
}

function resetCircuitBreaker() {
    circuitBreaker = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
    };
    logger.info('circuit_breaker_reset');
}

module.exports = {
    callEnrichmentService,
    getCircuitBreakerState,
    resetCircuitBreaker,
    ENRICHMENT_URL,
};
