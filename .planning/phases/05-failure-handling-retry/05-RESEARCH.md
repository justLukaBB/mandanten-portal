# Phase 05: Failure Handling & Retry - Research

**Researched:** 2026-02-01
**Domain:** Node.js error handling, retry patterns, LLM API resilience
**Confidence:** HIGH

## Summary

This phase implements retry logic with manual review flagging for the AI deduplication service when calling FastAPI's LLM-based deduplication endpoint. The research focused on Node.js retry patterns, error handling best practices for LLM APIs, and integration strategies for the existing codebase.

The standard approach for Node.js retry logic in 2026 uses either simple delay-based retries or exponential backoff with jitter. For LLM APIs specifically, best practices recommend 60-second timeouts (already implemented), 1-2 retries with short delays (2-5 seconds), and proper error classification to determine retry eligibility.

The existing codebase already has the foundation for this phase: axios with timeout support, manual review flags on creditors (`needs_manual_review`, `review_reasons`), and structured logging patterns. The implementation should wrap the existing FastAPI call in `aiDedupScheduler.js` with retry logic and set case-level manual review flags on failure.

**Primary recommendation:** Implement inline retry logic using native async/await with Promise delays rather than external libraries. Add 60-second timeout, 1 retry with 2-second delay, and flag cases for manual review on final failure. Keep the implementation simple and aligned with existing codebase patterns.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.10.0 | HTTP client for FastAPI calls | Already in use, supports timeout configuration, promise-based |
| Native Promise | ES2015+ | Async control flow and delay | Built-in, no dependencies, sufficient for simple retry |
| mongoose | ^8.0.0 | MongoDB ODM for case updates | Already in use for Client schema |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| async-retry | ^1.3.x | Retry wrapper with backoff | If complex retry logic needed (NOT recommended for this phase) |
| p-retry | ^6.x | Promise retry utility | Alternative if exponential backoff becomes necessary |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline retry | async-retry | Library adds dependency but provides more configuration options. Overkill for simple 1-retry logic. |
| Simple delay | Exponential backoff | Exponential backoff better for high-concurrency, but user decision is fixed 2-5 second delay for single retry. |
| Case-level flag | Creditor-level flags | Case-level simpler, matches user decision, easier UI/UX for manual review workflow. |

**Installation:**
No new dependencies required - use existing axios and native JavaScript features.

## Architecture Patterns

### Recommended Structure
```
server/services/
├── aiDedupScheduler.js      # Add retry wrapper here
├── creditorDeduplication.js # No changes needed
└── geminiServiceAdapter.js  # Reference for timeout patterns
```

### Pattern 1: Inline Retry with Timeout
**What:** Wrap the axios call in a retry loop with timeout and delay
**When to use:** Simple retry requirements (1-2 retries), clear error classification
**Example:**
```javascript
// Source: Research - adapted from Node.js best practices 2026
async function callWithRetry(fn, maxAttempts = 2, delayMs = 2000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${maxAttempts} failed:`, error.message);

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// Usage in aiDedupScheduler.js
const response = await callWithRetry(async (attempt) => {
  console.log(`[ai-dedup] Dedup attempt ${attempt}...`);
  return await axios.post(
    `${FASTAPI_URL}/api/dedup/deduplicate-all`,
    { creditors: creditorList },
    {
      timeout: 60000, // 60 seconds per context decision
      headers: { 'Content-Type': 'application/json', 'X-API-Key': FASTAPI_API_KEY }
    }
  );
}, 2, 2000); // 2 attempts, 2 second delay
```

### Pattern 2: Error Classification
**What:** Categorize errors to determine if retry is appropriate
**When to use:** Different handling for API errors vs validation errors
**Example:**
```javascript
// Source: Research - LLM API best practices
function isRetryableError(error) {
  // Retry on network/timeout/server errors
  if (error.code === 'ECONNABORTED') return true; // Timeout
  if (error.code === 'ENOTFOUND') return true; // Network
  if (!error.response) return true; // No response received

  const status = error.response?.status;
  if (status === 429) return true; // Rate limit
  if (status >= 500) return true; // Server error

  return false; // 4xx client errors - don't retry
}

// In retry logic
if (!isRetryableError(error) || attempt >= maxAttempts) {
  throw error; // Don't retry or exhausted attempts
}
```

### Pattern 3: Manual Review Flagging
**What:** Set case-level flags with failure reason when retries exhausted
**When to use:** After all retry attempts fail
**Example:**
```javascript
// Source: Existing codebase pattern - creditorDeduplication.js lines 212-224
async function flagForManualReview(client, error, creditorCount, attempts) {
  // Set case-level manual review flag (NOT individual creditors)
  client.needs_manual_review = true;
  client.dedup_failure_reason = `AI deduplication failed after ${attempts} attempts: ${error.message}`;

  // Log failure per FAIL-03 requirement
  console.error(`[ai-dedup] Manual review flagged for ${client.id}:`, {
    creditor_count: creditorCount,
    error_message: error.message,
    attempt_number: attempts,
    timestamp: new Date().toISOString()
  });

  // Creditors pass through unmerged - no dedup applied
  // (final_creditor_list remains unchanged from before dedup attempt)

  await client.save();
}
```

### Anti-Patterns to Avoid
- **Infinite retries:** Always set a maximum retry count to prevent endless loops
- **No delay between retries:** Immediate retries can overwhelm the API; always add a delay
- **Silent failures:** Always log failures and flag for manual review; never silently pass through duplicates
- **Blocking the pipeline:** Continue processing with unmerged creditors rather than blocking the entire workflow
- **Retry on validation errors:** Don't retry on 4xx client errors (bad request, validation failures) - these won't succeed on retry

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promise delays | Custom sleep implementations with callbacks | `await new Promise(resolve => setTimeout(resolve, ms))` | Standard ES6+ pattern, readable, no dependencies |
| Complex backoff | Manual exponential backoff calculations | Keep simple fixed delay (2-5 sec) | User decision is single retry with short delay, not exponential backoff |
| Retry libraries | async-retry, p-retry | Inline retry with native async/await | Simpler, no dependencies, sufficient for 1-retry requirement |
| Timeout handling | Custom timeout wrappers | axios built-in `timeout` config | Already supported and tested in codebase |

**Key insight:** For simple retry requirements (1-2 attempts), inline implementation with native async/await is clearer and easier to debug than adding external libraries. The existing codebase already demonstrates this pattern with axios timeouts in geminiServiceAdapter.js (60-second timeout) and delayedProcessingService.js (10-30 second timeouts).

## Common Pitfalls

### Pitfall 1: Retrying Non-Retryable Errors
**What goes wrong:** Retrying validation errors or malformed requests wastes time and resources
**Why it happens:** Not distinguishing between transient failures (network, timeout) and permanent failures (bad data)
**How to avoid:** Classify errors before retry - only retry network/timeout/5xx errors
**Warning signs:** Seeing the same validation error logged multiple times in a row

### Pitfall 2: Timeout Too Short for LLM Processing
**What goes wrong:** LLM calls time out before completion, triggering unnecessary retries
**Why it happens:** LLM processing time varies by creditor count and model load
**How to avoid:** Use 60-second timeout (user decision), monitor actual processing times
**Warning signs:** Timeout errors on successful processing (FastAPI completes but response times out)

### Pitfall 3: Not Clearing In-Progress Flags on Failure
**What goes wrong:** Case stuck in "dedup in progress" state, blocking future dedup attempts
**Why it happens:** Error thrown before finally block clears flag
**How to avoid:** Use try/finally pattern to always clear `dedup_in_progress` flag (already implemented in aiDedupScheduler.js lines 339-348)
**Warning signs:** Cases permanently stuck with `dedup_in_progress: true`

### Pitfall 4: Logging Only Final Outcome
**What goes wrong:** Cannot diagnose whether retry helped or failure happened on first attempt
**Why it happens:** Only logging after retry loop completes
**How to avoid:** Log each attempt with attempt number (per FAIL-03 requirement)
**Warning signs:** Unable to answer "did it fail immediately or after retry?"

### Pitfall 5: Thundering Herd on Retry
**What goes wrong:** Multiple concurrent dedup requests all retry simultaneously, overloading FastAPI
**Why it happens:** No jitter/randomness in retry delay
**How to avoid:** For this phase, atomic guard (`dedup_in_progress` flag) prevents concurrent calls. If scaling, add jitter to delay.
**Warning signs:** FastAPI 429 rate limit errors clustered in time

## Code Examples

Verified patterns from existing codebase and research:

### Timeout Configuration (Current)
```javascript
// Source: server/services/aiDedupScheduler.js lines 115-125
const response = await axios.post(
  `${FASTAPI_URL}/api/dedup/deduplicate-all`,
  { creditors: creditorList },
  {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': FASTAPI_API_KEY
    },
    timeout: 300000 // 5 minutes timeout (to be changed to 60000 per context decision)
  }
);
```

### Retry Wrapper Pattern
```javascript
// Source: Research - Node.js retry best practices 2026
async function retryWithDelay(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 2;
  const delayMs = options.delayMs || 2000;
  const shouldRetry = options.shouldRetry || (() => true);

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      return result;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= maxAttempts;
      const canRetry = shouldRetry(error);

      if (isLastAttempt || !canRetry) {
        throw error;
      }

      // Log retry (per FAIL-03)
      console.warn(`[retry] Attempt ${attempt} failed, retrying in ${delayMs}ms...`, {
        error: error.message,
        attempt_number: attempt,
        max_attempts: maxAttempts
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
```

### Error Classification Function
```javascript
// Source: Research - LLM API timeout handling best practices
function isRetryableError(error) {
  // Network errors (no response received)
  if (!error.response) return true;

  // Timeout errors
  if (error.code === 'ECONNABORTED') return true;

  // HTTP status codes
  const status = error.response.status;

  // Rate limiting - retry after delay
  if (status === 429) return true;

  // Server errors - retry
  if (status >= 500 && status < 600) return true;

  // Client errors (4xx) - don't retry (validation, auth, etc.)
  if (status >= 400 && status < 500) return false;

  // Default: don't retry unknown errors
  return false;
}
```

### Manual Review Flag Pattern (Existing)
```javascript
// Source: server/utils/creditorDeduplication.js lines 212-224
// This pattern already exists for creditor-level flags
// Adapt for case-level dedup failure:

// On dedup failure after retry:
client.needs_manual_review = true; // Case-level flag
client.dedup_failure_reason = `Deduplication failed after ${attempts} attempts: ${error.message}`;

// Creditors pass through unmerged (no changes to final_creditor_list)
// This prevents silent duplicate pass-through per requirement FAIL-02

await client.save();
```

### Logging Pattern (Existing)
```javascript
// Source: server/services/aiDedupScheduler.js lines 324-332
// Current error logging pattern - adapt to include attempt number

console.error(`[ai-dedup-scheduler] ❌ AI re-dedup failed for ${clientId}:`, error.message);

if (error.response) {
  console.error(`[ai-dedup-scheduler] FastAPI error response:`, {
    status: error.response.status,
    data: error.response.data,
    attempt_number: attempt, // ADD THIS
    creditor_count: creditorList.length // ADD THIS per FAIL-03
  });
}
```

### Complete Integration Example
```javascript
// Source: Synthesis of research + existing patterns
async function runAIRededupWithRetry(clientId, getClientFunction) {
  const client = await getClientFunction(clientId);
  const creditorList = client.final_creditor_list || [];
  const creditorCount = creditorList.length;

  // Skip LLM call if <= 1 creditor (user decision: Claude's discretion)
  if (creditorCount <= 1) {
    console.log(`[ai-dedup] Skipping dedup for ${clientId}: only ${creditorCount} creditor(s)`);
    return { success: true, skipped: true, reason: 'single_creditor' };
  }

  try {
    const response = await retryWithDelay(async (attempt) => {
      console.log(`[ai-dedup] Dedup attempt ${attempt} for ${clientId} (${creditorCount} creditors)...`);

      return await axios.post(
        `${FASTAPI_URL}/api/dedup/deduplicate-all`,
        { creditors: creditorList },
        {
          timeout: 60000, // 60 seconds per context decision
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': FASTAPI_API_KEY
          }
        }
      );
    }, {
      maxAttempts: 2, // 1 retry = 2 total attempts
      delayMs: 2000, // 2 seconds between attempts
      shouldRetry: isRetryableError
    });

    // Success - process deduplicated creditors
    const { deduplicated_creditors, stats } = response.data;
    // ... existing success logic ...

  } catch (error) {
    // Failure after retry - flag for manual review
    console.error(`[ai-dedup] ❌ Dedup failed for ${clientId} after retries:`, {
      creditor_count: creditorCount,
      error_message: error.message,
      attempt_number: 2, // Final attempt number
      timestamp: new Date().toISOString()
    });

    // Set case-level manual review flag (per FAIL-02)
    client.needs_manual_review = true;
    client.dedup_failure_reason = `AI deduplication failed after 2 attempts: ${error.message}`;

    // Creditors pass through UNMERGED - no dedup applied
    // final_creditor_list remains unchanged

    await client.save();

    return {
      success: false,
      error: error.message,
      manual_review_flagged: true
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous retry loops | async/await with Promise delays | ES2017+ | Cleaner code, easier to reason about control flow |
| Immediate retries | Delay between retries (2-5 sec) | 2020+ | Reduces API load, improves success rate |
| Silent failures | Manual review flags + structured logging | 2023+ | Better observability, no silent data corruption |
| Fixed 30s timeout | Adaptive timeouts (60s for LLM) | 2025+ | Accounts for LLM processing variability |

**Deprecated/outdated:**
- callback-based retry patterns: Use async/await instead
- No timeout configuration: Always set timeouts for external API calls
- Global error handlers only: Log errors at call site with context (creditor count, attempt number)

## Open Questions

1. **Should skip-LLM path (<=1 creditor) errors go through retry pipeline?**
   - What we know: User decision leaves this to Claude's discretion
   - What's unclear: If there's an error with <= 1 creditor (shouldn't happen in practice), should we retry?
   - Recommendation: No retry needed. Skip-LLM path has no API call, so no transient failures. Any error here is likely a bug, not a retryable condition. Raise directly.

2. **Should we log both attempts or only final outcome?**
   - What we know: User decision leaves logging strategy to Claude's discretion
   - What's unclear: Balance between log verbosity and debuggability
   - Recommendation: Log both attempts. Helps diagnose whether retry helped (first attempt failed, second succeeded) or failure was consistent. Minimal overhead (2 log lines vs 1). Include attempt number in each log per FAIL-03.

3. **What is the exact field name for failure reason storage?**
   - What we know: User decision says store failure reason alongside boolean, case-level only
   - What's unclear: Field name doesn't exist in current Client schema
   - Recommendation: Add `dedup_failure_reason: String` to clientSchema. Mirrors pattern of `status_reason` in documentSchema (line 29). Update schema and use in manual review flagging logic.

## Sources

### Primary (HIGH confidence)
- Existing codebase: server/services/aiDedupScheduler.js - Current timeout and error handling patterns
- Existing codebase: server/utils/creditorDeduplication.js - Manual review flag patterns
- Existing codebase: server/models/Client.js - Schema structure for manual review fields
- Existing codebase: server/package.json - axios version (1.10.0)

### Secondary (MEDIUM confidence)
- [Node.js Advanced Patterns: Implementing Robust Retry Logic](https://v-checha.medium.com/advanced-node-js-patterns-implementing-robust-retry-logic-656cf70f8ee9) - 2024-2025 best practices
- [Building Resilient Systems with API Retry Mechanisms in Node.js & Express](https://medium.com/@devharshgupta.com/building-resilient-systems-with-api-retry-mechanisms-in-node-js-a-guide-to-handling-failure-d6d9021b172a) - Modern retry patterns
- [Implementing Retry Mechanisms for LLM Calls](https://apxml.com/courses/prompt-engineering-llm-application-development/chapter-7-output-parsing-validation-reliability/implementing-retry-mechanisms) - LLM-specific guidance
- [Retries, fallbacks, and circuit breakers in LLM apps](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/) - LLM resilience patterns
- [How to implement an exponential backoff retry strategy in Javascript](https://advancedweb.hu/how-to-implement-an-exponential-backoff-retry-strategy-in-javascript/) - Backoff implementation

### Tertiary (LOW confidence)
- async-retry npm package - Not used, marked for reference if requirements change
- p-retry GitHub - Alternative if exponential backoff becomes necessary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - axios already in use, native Promise is ES2015+ standard
- Architecture: HIGH - Patterns adapted from existing codebase and verified Node.js best practices
- Pitfalls: HIGH - Based on real issues in distributed systems and LLM API integration

**Research date:** 2026-02-01
**Valid until:** 60 days (stable domain - retry patterns don't change rapidly)
