/**
 * FastAPI Client
 *
 * Handles communication with the FastAPI document processing server.
 * Uses native fetch API (Node.js 18+).
 *
 * Features:
 * - Retry logic with exponential backoff for connection errors
 * - 429 Rate Limit error handling with Retry-After header support
 * - Circuit breaker pattern for fault tolerance
 * - Rate limiting with token bucket algorithm (for Google AI Studio/Gemini API limits)
 * - Adaptive throttling based on 429 error rate
 * - Health check integration with caching
 * - Improved error handling and classification
 * - Keep-alive connections
 * - Comprehensive error metrics tracking
 */
// No axios import needed - using native fetch

// Configuration
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_TIMEOUT = parseInt(process.env.FASTAPI_TIMEOUT) || 1200000; // 20 minutes
const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY || ''; // API key for authentication
const { getSignedUrl } = require("../services/gcs-service");

// Retry configuration
const FASTAPI_RETRY_ATTEMPTS = parseInt(process.env.FASTAPI_RETRY_ATTEMPTS) || 3;
const FASTAPI_RETRY_DELAY_MS = parseInt(process.env.FASTAPI_RETRY_DELAY_MS) || 1000;
const FASTAPI_MAX_RETRY_DELAY_MS = parseInt(process.env.FASTAPI_MAX_RETRY_DELAY_MS) || 30000;
const FASTAPI_CONNECTION_TIMEOUT = parseInt(process.env.FASTAPI_CONNECTION_TIMEOUT) || 10000;
const FASTAPI_CONNECTION_TIMEOUT_RETRY = parseInt(process.env.FASTAPI_CONNECTION_TIMEOUT_RETRY) || 30000; // Longer timeout for retries (Cold Start)
const FASTAPI_ENABLE_HEALTH_CHECK = process.env.FASTAPI_ENABLE_HEALTH_CHECK === 'true';
const FASTAPI_HEALTH_CHECK_CACHE_MS = parseInt(process.env.FASTAPI_HEALTH_CHECK_CACHE_MS) || 30000;

// 429 Rate Limit Retry Configuration
const FASTAPI_429_RETRY_ATTEMPTS = parseInt(process.env.FASTAPI_429_RETRY_ATTEMPTS) || 5;
const FASTAPI_429_BASE_DELAY_MS = parseInt(process.env.FASTAPI_429_BASE_DELAY_MS) || 2000;
const FASTAPI_429_MAX_DELAY_MS = parseInt(process.env.FASTAPI_429_MAX_DELAY_MS) || 300000; // 5 minutes
const FASTAPI_429_RETRY_AFTER_MULTIPLIER = parseFloat(process.env.FASTAPI_429_RETRY_AFTER_MULTIPLIER) || 1.2;

// Rate Limiting Configuration (for Google AI Studio Free Tier: 15 RPM)
const FASTAPI_MAX_CONCURRENT_REQUESTS = parseInt(process.env.FASTAPI_MAX_CONCURRENT_REQUESTS) || 2;
const FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE = parseInt(process.env.FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE) || 12;
const FASTAPI_ENABLE_RATE_LIMITING = process.env.FASTAPI_ENABLE_RATE_LIMITING !== 'false'; // Enabled by default

// Adaptive Throttling Configuration
const FASTAPI_ADAPTIVE_THROTTLING_ENABLED = process.env.FASTAPI_ADAPTIVE_THROTTLING_ENABLED !== 'false'; // Enabled by default
const FASTAPI_429_ERROR_THRESHOLD = parseFloat(process.env.FASTAPI_429_ERROR_THRESHOLD) || 0.1; // 10%

// Circuit Breaker configuration
const FASTAPI_CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.FASTAPI_CIRCUIT_BREAKER_THRESHOLD) || 5;
const FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS = parseInt(process.env.FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS) || 60000;

// Circuit Breaker state
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation - requests allowed
  OPEN: 'OPEN',         // Failure threshold reached - requests blocked
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered - one request allowed
};

let circuitBreaker = {
  state: CircuitState.CLOSED,
  failureCount: 0,
  lastFailureTime: 0,
  nextAttemptTime: 0
};

// Health check cache
let healthCheckCache = {
  healthy: null,
  lastCheck: 0
};

// ============================================
// Rate Limiter Implementation
// ============================================

/**
 * Rate Limiter for FastAPI requests
 * Implements token bucket algorithm with adaptive throttling
 */
class RateLimiter {
  constructor() {
    this.requests = []; // Timestamps of recent requests
    this.currentConcurrent = 0;
    this.maxConcurrent = FASTAPI_MAX_CONCURRENT_REQUESTS;
    this.requestsPerMinute = FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE;
    this.queue = [];
    this.processing = false;
  }

  /**
   * Wait until a request slot is available
   * @returns {Promise<void>}
   */
  async acquire() {
    if (!FASTAPI_ENABLE_RATE_LIMITING) {
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
      this._processQueue();
    });
  }

  /**
   * Release a request slot
   */
  release() {
    if (!FASTAPI_ENABLE_RATE_LIMITING) {
      return;
    }

    this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
    this._processQueue();
  }

  /**
   * Process the queue of waiting requests
   */
  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Check concurrent limit
      if (this.currentConcurrent >= this.maxConcurrent) {
        break;
      }

      // Check rate limit (requests per minute)
      const now = Date.now();
      this.requests = this.requests.filter(t => t > now - 60000);

      if (this.requests.length >= this.requestsPerMinute) {
        // Calculate wait time until oldest request expires
        const oldestRequest = this.requests[0];
        const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer

        if (waitTime > 0) {
          console.log(`⏳ Rate limit reached (${this.requests.length}/${this.requestsPerMinute} RPM) - waiting ${waitTime}ms`);
          await sleep(waitTime);
          continue;
        }
      }

      // Allow request
      this.currentConcurrent++;
      this.requests.push(now);

      const resolve = this.queue.shift();
      resolve();
    }

    this.processing = false;
  }

  /**
   * Reduce rate limit (called when 429 errors occur)
   */
  reduceLimit() {
    if (!FASTAPI_ADAPTIVE_THROTTLING_ENABLED) {
      return;
    }

    const oldLimit = this.requestsPerMinute;
    this.requestsPerMinute = Math.max(1, Math.floor(this.requestsPerMinute * 0.7));
    this.maxConcurrent = Math.max(1, this.maxConcurrent - 1);

    console.log(`\n🔽 ================================`);
    console.log(`🔽 ADAPTIVE THROTTLING: REDUCING RATE`);
    console.log(`🔽 ================================`);
    console.log(`📉 RPM: ${oldLimit} → ${this.requestsPerMinute}`);
    console.log(`📉 Max Concurrent: ${this.maxConcurrent + 1} → ${this.maxConcurrent}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  }

  /**
   * Increase rate limit (called after successful requests)
   */
  increaseLimit() {
    if (!FASTAPI_ADAPTIVE_THROTTLING_ENABLED) {
      return;
    }

    const targetRpm = FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE;
    const targetConcurrent = FASTAPI_MAX_CONCURRENT_REQUESTS;

    if (this.requestsPerMinute < targetRpm) {
      this.requestsPerMinute = Math.min(targetRpm, this.requestsPerMinute + 1);
    }
    if (this.maxConcurrent < targetConcurrent) {
      this.maxConcurrent = Math.min(targetConcurrent, this.maxConcurrent + 1);
    }
  }

  /**
   * Get current rate limiter state (for monitoring)
   * @returns {Object}
   */
  getState() {
    return {
      enabled: FASTAPI_ENABLE_RATE_LIMITING,
      currentConcurrent: this.currentConcurrent,
      maxConcurrent: this.maxConcurrent,
      requestsInLastMinute: this.requests.length,
      requestsPerMinuteLimit: this.requestsPerMinute,
      queueLength: this.queue.length,
      adaptiveThrottlingEnabled: FASTAPI_ADAPTIVE_THROTTLING_ENABLED
    };
  }

  /**
   * Reset rate limiter to default configuration
   */
  reset() {
    this.requests = [];
    this.currentConcurrent = 0;
    this.maxConcurrent = FASTAPI_MAX_CONCURRENT_REQUESTS;
    this.requestsPerMinute = FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE;
    this.queue = [];
    this.processing = false;
    console.log('🔄 Rate limiter reset to defaults');
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// ============================================
// 429 Error Metrics Tracking
// ============================================

let errorMetrics = {
  total429Errors: 0,
  totalRequests: 0,
  retryAttempts: 0,
  successfulRetries: 0,
  averageRetryDelay: 0,
  lastErrorTime: null,
  windowStart: Date.now()
};

/**
 * Record a 429 error for metrics
 */
function record429Error() {
  errorMetrics.total429Errors++;
  errorMetrics.lastErrorTime = Date.now();
  rateLimiter.reduceLimit();
}

/**
 * Record a successful request for metrics
 */
function recordSuccess() {
  errorMetrics.totalRequests++;
  // Slowly increase rate limit after successful requests
  if (errorMetrics.totalRequests % 10 === 0) {
    rateLimiter.increaseLimit();
  }
}

/**
 * Get 429 error rate
 * @returns {number} - Error rate between 0 and 1
 */
function get429ErrorRate() {
  if (errorMetrics.totalRequests === 0) {
    return 0;
  }
  return errorMetrics.total429Errors / errorMetrics.totalRequests;
}

/**
 * Get error metrics (for monitoring)
 * @returns {Object}
 */
function getErrorMetrics() {
  return {
    ...errorMetrics,
    errorRate: get429ErrorRate(),
    rateLimiterState: rateLimiter.getState()
  };
}

/**
 * Reset error metrics
 */
function resetErrorMetrics() {
  errorMetrics = {
    total429Errors: 0,
    totalRequests: 0,
    retryAttempts: 0,
    successfulRetries: 0,
    averageRetryDelay: 0,
    lastErrorTime: null,
    windowStart: Date.now()
  };
  console.log('🔄 Error metrics reset');
}

// Production warning
if (process.env.NODE_ENV === 'production' && FASTAPI_URL.includes('localhost')) {
  console.warn('⚠️  WARNING: FASTAPI_URL not set in production environment - using localhost:8000');
  console.warn('⚠️  Please set FASTAPI_URL environment variable to your production FastAPI service URL');
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (connection-level errors)
 * @param {Error} error - The error to check
 * @param {Response} [response] - Optional HTTP response to check status code
 * @returns {boolean} - True if the error is retryable
 */
function isRetryableError(error, response = null) {
  // Connection-level errors (existing logic)
  const retryableMessages = [
    'fetch failed',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'socket hang up',
    'network',
    'Connection timeout'
  ];

  const errorMessage = error?.message || String(error);
  if (retryableMessages.some(msg =>
    errorMessage.toLowerCase().includes(msg.toLowerCase())
  )) {
    return true;
  }

  // HTTP status code errors
  if (response) {
    const status = response.status;
    // Retryable status codes: 429 (Rate Limit), 502, 503, 504 (Server errors)
    if (status === 429 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    // Non-retryable client errors (except 429)
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }

  return false;
}

/**
 * Check if HTTP status code indicates a rate limit error
 * @param {number} status - HTTP status code
 * @returns {boolean} - True if rate limit error
 */
function isRateLimitError(status) {
  return status === 429;
}

/**
 * Parse Retry-After header value
 * @param {string} retryAfterHeader - Retry-After header value (seconds or HTTP date)
 * @returns {number|null} - Delay in milliseconds, or null if invalid
 */
function parseRetryAfterHeader(retryAfterHeader) {
  if (!retryAfterHeader) {
    return null;
  }

  // Try to parse as seconds
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try to parse as HTTP date
  const retryDate = new Date(retryAfterHeader);
  if (!isNaN(retryDate.getTime())) {
    const delayMs = Math.max(0, retryDate.getTime() - Date.now());
    return delayMs;
  }

  return null;
}

/**
 * Calculate retry delay for 429 errors with exponential backoff
 * @param {number} retryAttempt - Current retry attempt (0-based)
 * @param {string} [retryAfterHeader] - Optional Retry-After header value
 * @returns {number} - Delay in milliseconds
 */
function calculateRetryDelay(retryAttempt, retryAfterHeader = null) {
  const baseDelay = FASTAPI_429_BASE_DELAY_MS;
  const maxDelay = FASTAPI_429_MAX_DELAY_MS;

  // Use Retry-After header if provided
  const retryAfterDelay = parseRetryAfterHeader(retryAfterHeader);
  if (retryAfterDelay !== null && retryAfterDelay > 0) {
    // Apply multiplier for safety margin
    const delay = retryAfterDelay * FASTAPI_429_RETRY_AFTER_MULTIPLIER;
    const clampedDelay = Math.min(delay, maxDelay);
    console.log(`📊 Using Retry-After header: ${retryAfterHeader} → ${Math.round(clampedDelay)}ms`);
    return Math.round(clampedDelay);
  }

  // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
  const delay = Math.min(baseDelay * Math.pow(2, retryAttempt), maxDelay);

  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  const finalDelay = Math.round(delay + jitter);

  console.log(`📊 Using exponential backoff: attempt ${retryAttempt + 1} → ${finalDelay}ms`);
  return finalDelay;
}

/**
 * Classify error type for better logging
 * @param {Error} error - The error to classify
 * @returns {string} - Error type classification
 */
function classifyError(error) {
  const message = error.message || String(error);

  if (message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
  if (message.includes('ETIMEDOUT')) return 'CONNECTION_TIMEOUT';
  if (message.includes('ENOTFOUND')) return 'DNS_ERROR';
  if (message.includes('ECONNRESET')) return 'CONNECTION_RESET';
  if (message.includes('fetch failed')) return 'FETCH_FAILED';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('abort')) return 'ABORTED';
  if (message.match(/returned \d+/)) return 'HTTP_ERROR';

  return 'UNKNOWN_ERROR';
}

/**
 * Check if health check should be performed
 * @returns {boolean}
 */
function shouldCheckHealth() {
  if (!FASTAPI_ENABLE_HEALTH_CHECK) return false;

  const now = Date.now();
  const cacheExpired = (now - healthCheckCache.lastCheck) > FASTAPI_HEALTH_CHECK_CACHE_MS;

  return cacheExpired || healthCheckCache.healthy === null;
}

/**
 * Check if FastAPI is healthy (with caching)
 * @returns {Promise<boolean>}
 */
async function isFastApiHealthy() {
  if (!shouldCheckHealth() && healthCheckCache.healthy !== null) {
    return healthCheckCache.healthy;
  }

  const healthy = await checkHealth();
  healthCheckCache = {
    healthy,
    lastCheck: Date.now()
  };

  return healthy;
}

// ============================================
// Circuit Breaker Implementation
// ============================================

/**
 * Check if circuit breaker allows the request
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
function checkCircuitBreaker() {
  const now = Date.now();

  switch (circuitBreaker.state) {
    case CircuitState.CLOSED:
      // Normal operation - allow request
      return { allowed: true };

    case CircuitState.OPEN:
      // Check if timeout has passed
      if (now >= circuitBreaker.nextAttemptTime) {
        // Transition to HALF_OPEN - allow one test request
        circuitBreaker.state = CircuitState.HALF_OPEN;
        console.log(`\n🔌 ================================`);
        console.log(`🔌 CIRCUIT BREAKER: HALF-OPEN`);
        console.log(`🔌 ================================`);
        console.log(`🧪 Allowing test request to check if FastAPI recovered`);
        console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
        return { allowed: true, isTestRequest: true };
      }
      // Still in timeout period - block request
      const waitTime = Math.ceil((circuitBreaker.nextAttemptTime - now) / 1000);
      return {
        allowed: false,
        reason: `Circuit breaker OPEN - FastAPI unavailable. Retry in ${waitTime}s`
      };

    case CircuitState.HALF_OPEN:
      // Only one request allowed in HALF_OPEN - block others
      return {
        allowed: false,
        reason: 'Circuit breaker HALF-OPEN - test request in progress'
      };

    default:
      return { allowed: true };
  }
}

/**
 * Record a successful request - reset circuit breaker
 */
function recordCircuitSuccess() {
  if (circuitBreaker.state === CircuitState.HALF_OPEN) {
    console.log(`\n✅ ================================`);
    console.log(`✅ CIRCUIT BREAKER: CLOSED`);
    console.log(`✅ ================================`);
    console.log(`🎉 Test request succeeded - FastAPI recovered`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  }

  // Reset on success
  circuitBreaker = {
    state: CircuitState.CLOSED,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };
}

/**
 * Record a failed request - potentially trip circuit breaker
 */
function recordCircuitFailure() {
  const now = Date.now();
  circuitBreaker.failureCount++;
  circuitBreaker.lastFailureTime = now;

  if (circuitBreaker.state === CircuitState.HALF_OPEN) {
    // Test request failed - go back to OPEN
    circuitBreaker.state = CircuitState.OPEN;
    circuitBreaker.nextAttemptTime = now + FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS;

    console.log(`\n🔴 ================================`);
    console.log(`🔴 CIRCUIT BREAKER: OPEN (Test Failed)`);
    console.log(`🔴 ================================`);
    console.log(`💥 Test request failed - FastAPI still unavailable`);
    console.log(`⏳ Next attempt in ${FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS / 1000}s`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    return;
  }

  // Check if threshold reached
  if (circuitBreaker.failureCount >= FASTAPI_CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.state = CircuitState.OPEN;
    circuitBreaker.nextAttemptTime = now + FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS;

    console.log(`\n🔴 ================================`);
    console.log(`🔴 CIRCUIT BREAKER: OPEN`);
    console.log(`🔴 ================================`);
    console.log(`💥 Failure threshold reached (${FASTAPI_CIRCUIT_BREAKER_THRESHOLD} consecutive failures)`);
    console.log(`🚫 Blocking requests for ${FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS / 1000}s`);
    console.log(`⏳ Next attempt at: ${new Date(circuitBreaker.nextAttemptTime).toISOString()}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  } else {
    console.log(`⚠️  Circuit breaker: ${circuitBreaker.failureCount}/${FASTAPI_CIRCUIT_BREAKER_THRESHOLD} failures`);
  }
}

/**
 * Get current circuit breaker state (for monitoring/debugging)
 * @returns {Object}
 */
function getCircuitBreakerState() {
  return {
    state: circuitBreaker.state,
    failureCount: circuitBreaker.failureCount,
    threshold: FASTAPI_CIRCUIT_BREAKER_THRESHOLD,
    lastFailureTime: circuitBreaker.lastFailureTime ? new Date(circuitBreaker.lastFailureTime).toISOString() : null,
    nextAttemptTime: circuitBreaker.nextAttemptTime ? new Date(circuitBreaker.nextAttemptTime).toISOString() : null,
    timeoutMs: FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS
  };
}

/**
 * Reset circuit breaker (for testing or manual recovery)
 */
function resetCircuitBreaker() {
  circuitBreaker = {
    state: CircuitState.CLOSED,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };
  console.log('🔄 Circuit breaker reset to CLOSED state');
}

/**
 * Helper function to create a fetch request with timeout
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(url, options = {}, timeout = FASTAPI_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Add keep-alive header for connection reuse
    const headers = {
      ...options.headers,
      'Connection': 'keep-alive'
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic, exponential backoff, circuit breaker, and 429 handling
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} retryAttempt - Current retry attempt for connection errors (internal use)
 * @param {number} rateLimitRetryAttempt - Current retry attempt for 429 errors (internal use)
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url, options = {}, timeout = FASTAPI_TIMEOUT, retryAttempt = 0, rateLimitRetryAttempt = 0) {
  const maxRetries = FASTAPI_RETRY_ATTEMPTS;
  const max429Retries = FASTAPI_429_RETRY_ATTEMPTS;
  const baseDelay = FASTAPI_RETRY_DELAY_MS;
  const maxDelay = FASTAPI_MAX_RETRY_DELAY_MS;

  // Check circuit breaker first
  const circuitCheck = checkCircuitBreaker();
  if (!circuitCheck.allowed) {
    const error = new Error(circuitCheck.reason);
    error.circuitBreakerOpen = true;
    throw error;
  }

  // Use longer timeout for retries (Cold Start scenario)
  const effectiveTimeout = retryAttempt > 0 ? FASTAPI_CONNECTION_TIMEOUT_RETRY : timeout;

  // Acquire rate limiter slot
  await rateLimiter.acquire();

  try {
    // Optional health check before making request (only on first attempt)
    if (FASTAPI_ENABLE_HEALTH_CHECK && retryAttempt === 0 && rateLimitRetryAttempt === 0) {
      const healthy = await isFastApiHealthy();
      if (!healthy) {
        console.warn('⚠️  FastAPI server health check failed - attempting request anyway');
      }
    }

    // Log timeout info for retries
    if (retryAttempt > 0) {
      console.log(`⏱️  Using extended timeout: ${effectiveTimeout}ms (Cold Start mode)`);
    }

    // Attempt fetch with timeout
    const response = await fetchWithTimeout(url, options, effectiveTimeout);

    // Check for HTTP errors that should be retried
    if (!response.ok) {
      const status = response.status;

      // Handle 429 Rate Limit errors
      if (isRateLimitError(status) && rateLimitRetryAttempt < max429Retries) {
        // Record 429 error for metrics and adaptive throttling
        record429Error();
        errorMetrics.retryAttempts++;

        // Extract Retry-After header
        const retryAfterHeader = response.headers.get('Retry-After');
        const delay = calculateRetryDelay(rateLimitRetryAttempt, retryAfterHeader);

        console.log(`\n🚦 ================================`);
        console.log(`🚦 429 RATE LIMIT ERROR`);
        console.log(`🚦 ================================`);
        console.log(`💥 Status: ${status} - Too Many Requests`);
        console.log(`📊 Retry-After Header: ${retryAfterHeader || 'not provided'}`);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        console.log(`🔄 Attempt ${rateLimitRetryAttempt + 1}/${max429Retries}`);
        console.log(`📈 Total 429 Errors: ${errorMetrics.total429Errors}`);
        console.log(`📉 Current Rate Limit: ${rateLimiter.requestsPerMinute} RPM`);
        console.log(`🔗 URL: ${url}`);
        console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

        // Release rate limiter slot before waiting
        rateLimiter.release();

        // Update average retry delay metric
        errorMetrics.averageRetryDelay =
          (errorMetrics.averageRetryDelay * (errorMetrics.retryAttempts - 1) + delay) /
          errorMetrics.retryAttempts;

        await sleep(delay);

        console.log(`🔄 Retrying after 429 error...`);
        return fetchWithRetry(url, options, timeout, retryAttempt, rateLimitRetryAttempt + 1);
      }

      // Handle other retryable HTTP errors (502, 503, 504)
      if (isRetryableError(null, response) && retryAttempt < maxRetries) {
        recordCircuitFailure();

        const delay = Math.min(baseDelay * Math.pow(2, retryAttempt), maxDelay);

        console.log(`\n🔄 ================================`);
        console.log(`🔄 RETRYABLE HTTP ERROR`);
        console.log(`🔄 ================================`);
        console.log(`💥 Status: ${status}`);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        console.log(`🔄 Attempt ${retryAttempt + 1}/${maxRetries}`);
        console.log(`🔗 URL: ${url}`);
        console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

        // Release rate limiter slot before waiting
        rateLimiter.release();

        await sleep(delay);

        console.log(`🔄 Retrying request now...`);
        return fetchWithRetry(url, options, timeout, retryAttempt + 1, rateLimitRetryAttempt);
      }
    }

    // Success - reset circuit breaker and record success
    recordCircuitSuccess();
    recordSuccess();

    if (rateLimitRetryAttempt > 0) {
      errorMetrics.successfulRetries++;
      console.log(`✅ Request succeeded after ${rateLimitRetryAttempt} rate limit retries`);
    }

    // Release rate limiter slot
    rateLimiter.release();

    return response;

  } catch (error) {
    // Release rate limiter slot on error
    rateLimiter.release();

    const errorType = classifyError(error);

    // Record failure for circuit breaker (only for connection-level errors)
    if (isRetryableError(error)) {
      recordCircuitFailure();
    }

    // Check if error is retryable and we haven't exceeded max retries
    if (isRetryableError(error) && retryAttempt < maxRetries) {
      // Check circuit breaker again before retry
      const retryCircuitCheck = checkCircuitBreaker();
      if (!retryCircuitCheck.allowed) {
        console.log(`🔴 Circuit breaker prevented retry: ${retryCircuitCheck.reason}`);
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, retryAttempt), maxDelay);

      console.log(`\n🔄 ================================`);
      console.log(`🔄 RETRY ATTEMPT ${retryAttempt + 1}/${maxRetries}`);
      console.log(`🔄 ================================`);
      console.log(`💥 Error Type: ${errorType}`);
      console.log(`💥 Error Message: ${error.message}`);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      console.log(`⏱️  Next attempt will use timeout: ${FASTAPI_CONNECTION_TIMEOUT_RETRY}ms`);
      console.log(`🔗 URL: ${url}`);
      console.log(`🔌 Circuit Breaker: ${circuitBreaker.failureCount}/${FASTAPI_CIRCUIT_BREAKER_THRESHOLD} failures`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

      await sleep(delay);

      console.log(`🔄 Retrying request now...`);
      return fetchWithRetry(url, options, timeout, retryAttempt + 1, rateLimitRetryAttempt);
    }

    // Not retryable or max retries exceeded
    if (retryAttempt >= maxRetries) {
      console.log(`\n❌ ================================`);
      console.log(`❌ MAX RETRIES EXCEEDED (${maxRetries})`);
      console.log(`❌ ================================`);
      console.log(`💥 Error Type: ${errorType}`);
      console.log(`💥 Final Error: ${error.message}`);
      console.log(`🔗 URL: ${url}`);
      console.log(`🔌 Circuit Breaker State: ${circuitBreaker.state}`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    }

    throw error;
  }
}

/**
 * Create a processing job in FastAPI
 * 
 * @param {Object} params - Job parameters
 * @param {string} params.clientId - Client ID from MongoDB
 * @param {Array} params.files - Array of file objects with gcs_path, filename, etc.
 * @param {string} params.webhookUrl - URL for FastAPI to send results
 * @param {string} [params.apiKey] - Optional Gemini API key
 * @returns {Promise<Object>} - Job creation response with job_id
 */
async function createProcessingJob({ clientId, clientName, files, webhookUrl, apiKey = null }) {
  console.log(`\n🚀 ================================`);
  console.log(`🚀 CALLING FASTAPI PROCESSING`);
  console.log(`🚀 ================================`);
  console.log(`🔗 FastAPI URL: ${FASTAPI_URL}`);
  console.log(`👤 Client ID: ${clientId}`);
  console.log(`👤 Client Name: ${clientName || 'N/A'}`);
  console.log(`📄 Files: ${files.length}`);
  console.log(`🔔 Webhook URL: ${webhookUrl}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

  // Log files being sent
  console.log(`\n📋 FILES TO PROCESS:`);
  files.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.filename} (${file.document_id || 'NO_DOC_ID'})`);
    console.log(`      GCS: ${file.gcs_path}`);
    console.log(`      Type: ${file.mime_type}`);
  });

  try {

    const requestBody = {
      client_id: clientId,
      client_name: clientName || null,
      files: await Promise.all(files.map(async (f) => {
        let gcsPath = f.gcs_path;
        // Only attempt to get signed URL if no local path is provided and no gcs path exists
        if (!f.local_path && !gcsPath) {
          try {
            gcsPath = await getSignedUrl(f.filename);
          } catch (e) {
            console.warn("⚠️ Failed to get signed URL for", f.filename, e.message);
          }
        }

        return {
          filename: f.filename,            // blob name
          gcs_path: gcsPath,               // signed URL
          local_path: f.local_path,        // local path for testing/local-dev
          mime_type: f.mime_type || 'image/png',
          size: f.size || 0,
          document_id: f.document_id || f.id,
        };
      })),
      webhook_url: webhookUrl,
    };

    // Add API key if provided
    if (apiKey) {
      requestBody.api_key = apiKey;
    }

    console.log(`\n📤 Sending request to FastAPI...`);

    // Prepare headers with API key authentication
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    // Add API key if configured
    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    } else {
      console.warn(`⚠️  WARNING: FASTAPI_API_KEY not set - request may be rejected`);
    }



    console.log("=====================requestBody========================", requestBody)

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs`,
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      },
      FASTAPI_TIMEOUT
    );

    // Try to parse as JSON, but handle HTML error pages
    let data;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Not JSON - likely HTML error page
      const text = await response.text();
      console.error(`❌ FastAPI returned non-JSON response (${response.status}):`);
      console.error(`📄 Content-Type: ${contentType}`);
      console.error(`📄 Response preview: ${text.substring(0, 500)}`);
      throw new Error(`FastAPI returned ${response.status} with HTML instead of JSON. Server may be down or endpoint doesn't exist.`);
    }

    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}: ${data.detail || JSON.stringify(data)}`);
    }

    console.log(`\n✅ ================================`);
    console.log(`✅ FASTAPI JOB CREATED`);
    console.log(`✅ ================================`);
    console.log(`🔑 Job ID: ${data.job_id}`);
    console.log(`📊 Status: ${data.status}`);
    console.log(`💬 Message: ${data.message}`);
    console.log(`⏰ Created at: ${new Date().toISOString()}`);
    console.log(`\n`);

    return {
      success: true,
      jobId: data.job_id,
      status: data.status,
      message: data.message
    };

  } catch (error) {
    const errorType = classifyError(error);

    console.log(`\n❌ ================================`);
    console.log(`❌ FASTAPI REQUEST FAILED`);
    console.log(`❌ ================================`);
    console.log(`💥 Error Type: ${errorType}`);
    console.log(`💥 Error Message: ${error.message}`);

    // Try to extract status code and details from error
    let statusCode = null;
    let details = null;

    if (error.message.includes('returned')) {
      const match = error.message.match(/returned (\d+)/);
      if (match) {
        statusCode = parseInt(match[1]);
      }
    }

    console.log(`📊 Status Code: ${statusCode || 'N/A'}`);
    console.log(`🔄 Retryable: ${isRetryableError(error)}`);
    if (details) {
      console.log(`📝 Response: ${JSON.stringify(details)}`);
    }

    console.log(`⏰ Failed at: ${new Date().toISOString()}`);
    console.log(`\n`);

    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: statusCode,
      details: details,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Get job status from FastAPI (fallback/debug)
 *
 * @param {string} jobId - Job ID to check
 * @returns {Promise<Object>} - Job status
 */
async function getJobStatus(jobId) {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs/${jobId}/status`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_TIMEOUT
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`FastAPI returned ${response.status}: ${errorData.detail || 'Unknown error'}`);
    }

    const data = await response.json();

    return {
      success: true,
      ...data
    };

  } catch (error) {
    const errorType = classifyError(error);
    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Get job results from FastAPI (fallback/debug)
 *
 * @param {string} jobId - Job ID to get results for
 * @returns {Promise<Object>} - Full job results
 */
async function getJobResults(jobId) {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs/${jobId}/results`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_TIMEOUT
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`FastAPI returned ${response.status}: ${errorData.detail || 'Unknown error'}`);
    }

    const data = await response.json();

    return {
      success: true,
      ...data
    };

  } catch (error) {
    const errorType = classifyError(error);
    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Health check for FastAPI server
 *
 * @returns {Promise<boolean>} - True if FastAPI is healthy
 */
async function checkHealth() {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0',
      'Connection': 'keep-alive'
    };

    // Health check may not require API key, but include it if available
    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    // Use shorter timeout for health check (no retry)
    const response = await fetchWithTimeout(
      `${FASTAPI_URL}/health`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_CONNECTION_TIMEOUT // Use connection timeout for health check
    );

    if (!response.ok) {
      console.warn(`⚠️  FastAPI health check returned status ${response.status}`);
      return false;
    }

    const data = await response.json();
    const isHealthy = data.status === 'healthy';

    if (isHealthy) {
      console.log(`✅ FastAPI health check passed`);
    } else {
      console.warn(`⚠️  FastAPI health check failed: status = ${data.status}`);
    }

    return isHealthy;

  } catch (error) {
    const errorType = classifyError(error);
    console.error(`❌ FastAPI health check failed: ${errorType} - ${error.message}`);
    return false;
  }
}

/**
 * Reset health check cache (useful for testing or manual refresh)
 */
function resetHealthCheckCache() {
  healthCheckCache = {
    healthy: null,
    lastCheck: 0
  };
  console.log('🔄 Health check cache reset');
}

/**
 * Get current retry configuration (for debugging/monitoring)
 * @returns {Object} - Current retry configuration
 */
function getRetryConfig() {
  return {
    maxRetries: FASTAPI_RETRY_ATTEMPTS,
    baseDelayMs: FASTAPI_RETRY_DELAY_MS,
    maxRetryDelayMs: FASTAPI_MAX_RETRY_DELAY_MS,
    connectionTimeoutMs: FASTAPI_CONNECTION_TIMEOUT,
    connectionTimeoutRetryMs: FASTAPI_CONNECTION_TIMEOUT_RETRY,
    healthCheckEnabled: FASTAPI_ENABLE_HEALTH_CHECK,
    healthCheckCacheMs: FASTAPI_HEALTH_CHECK_CACHE_MS,
    requestTimeoutMs: FASTAPI_TIMEOUT,
    circuitBreaker: {
      threshold: FASTAPI_CIRCUIT_BREAKER_THRESHOLD,
      timeoutMs: FASTAPI_CIRCUIT_BREAKER_TIMEOUT_MS
    },
    rateLimitRetry: {
      maxRetries: FASTAPI_429_RETRY_ATTEMPTS,
      baseDelayMs: FASTAPI_429_BASE_DELAY_MS,
      maxDelayMs: FASTAPI_429_MAX_DELAY_MS,
      retryAfterMultiplier: FASTAPI_429_RETRY_AFTER_MULTIPLIER
    },
    rateLimiting: {
      enabled: FASTAPI_ENABLE_RATE_LIMITING,
      maxConcurrentRequests: FASTAPI_MAX_CONCURRENT_REQUESTS,
      requestsPerMinute: FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE,
      adaptiveThrottlingEnabled: FASTAPI_ADAPTIVE_THROTTLING_ENABLED,
      errorThreshold: FASTAPI_429_ERROR_THRESHOLD
    }
  };
}

module.exports = {
  createProcessingJob,
  getJobStatus,
  getJobResults,
  checkHealth,
  resetHealthCheckCache,
  getRetryConfig,
  // Circuit Breaker exports
  getCircuitBreakerState,
  resetCircuitBreaker,
  // Rate Limiter exports
  getRateLimiterState: () => rateLimiter.getState(),
  resetRateLimiter: () => rateLimiter.reset(),
  // Error Metrics exports
  getErrorMetrics,
  resetErrorMetrics,
  get429ErrorRate,
  FASTAPI_URL
};
