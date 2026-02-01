---
phase: 05-failure-handling-retry
plan: 01
subsystem: api
tags: [retry, error-handling, mongodb, axios, node.js]

# Dependency graph
requires:
  - phase: 04-code-based-merge-logic
    provides: Deterministic creditor merging in Python after LLM identifies groups
provides:
  - Retry infrastructure: retryWithDelay() helper function with structured logging
  - Schema field for storing failure reasons: dedup_failure_reason
  - Reduced timeout (60s) to catch Vertex AI hangs
affects: [05-02, manual-review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-retry-with-native-promises, per-attempt-structured-logging]

key-files:
  created: []
  modified: [server/models/Client.js, server/services/aiDedupScheduler.js]

key-decisions:
  - "Use native Promise delays instead of external retry libraries (simple, no dependencies)"
  - "Reduce timeout from 300s to 60s to catch Vertex AI hangs"
  - "Log every attempt with attempt number and will_retry flag (FAIL-03 compliance)"

patterns-established:
  - "retryWithDelay() pattern: reusable retry wrapper with per-attempt logging"
  - "dedup_failure_reason: case-level failure tracking field in Client schema"

# Metrics
duration: 1min
completed: 2026-02-01
---

# Phase 05 Plan 01: Failure Handling & Retry Summary

**Retry infrastructure with retryWithDelay() helper, dedup_failure_reason schema field, and 60-second timeout for LLM dedup calls**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-01T15:41:42Z
- **Completed:** 2026-02-01T15:43:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added dedup_failure_reason field to Client schema for storing failure reasons
- Implemented retryWithDelay() helper function with per-attempt structured logging
- Reduced FastAPI call timeout from 300 seconds to 60 seconds to catch Vertex AI hangs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dedup_failure_reason field to Client schema** - `f88cf0a` (feat)
2. **Task 2: Add retry wrapper and reduce timeout in aiDedupScheduler** - `82fbdcd` (feat)

## Files Created/Modified
- `server/models/Client.js` - Added dedup_failure_reason String field next to dedup coordination fields
- `server/services/aiDedupScheduler.js` - Added retryWithDelay() helper and reduced timeout to 60000ms

## Decisions Made

**1. Use native Promise delays instead of external retry libraries**
- Rationale: Simple 1-retry requirement doesn't warrant dependency on async-retry or p-retry. Native `await new Promise(resolve => setTimeout(resolve, delayMs))` is clearer and sufficient.
- Impact: Zero new dependencies, easier to debug, follows existing codebase patterns.

**2. Log every attempt with structured data (FAIL-03 compliance)**
- Rationale: Per-attempt logging with attempt number, error message, status, and will_retry flag enables diagnosis of whether retry helped or failure was consistent.
- Impact: Operators can distinguish "failed immediately" from "failed after retry" scenarios.

**3. Reduce timeout from 300s to 60s**
- Rationale: Context decision identified 60-second timeout as appropriate for catching Vertex AI hangs while allowing reasonable LLM processing time.
- Impact: Faster failure detection, prevents long-running hung calls from blocking pipeline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 05-02 to wire retry logic into dedup flow and add manual review flagging on failure.

**Prerequisites delivered:**
- retryWithDelay() wrapper ready for integration
- dedup_failure_reason field ready to store failure reasons
- 60-second timeout in place

**Next steps:** Plan 05-02 will wrap the FastAPI call in retryWithDelay() and set dedup_failure_reason + needs_manual_review flag on failure after retry.

---
*Phase: 05-failure-handling-retry*
*Completed: 2026-02-01*
