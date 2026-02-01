---
phase: 05-failure-handling-retry
plan: 02
subsystem: api
tags: [retry, error-handling, mongodb, axios, node.js, manual-review]

# Dependency graph
requires:
  - phase: 05-01
    provides: Retry infrastructure (retryWithDelay helper, dedup_failure_reason field, 60s timeout)
provides:
  - Integrated retry logic in live dedup flow (FastAPI call wrapped in retryWithDelay)
  - Manual review flagging on failure (dedup_failure_reason set via atomic update)
  - Creditors pass through unmerged on failure (no silent duplicate pass-through)
affects: [06-path-consistency, manual-review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [retry-wrapped-api-calls, atomic-failure-flagging, unmerged-pass-through]

key-files:
  created: []
  modified: [server/services/aiDedupScheduler.js]

key-decisions:
  - "Wrap FastAPI call in retryWithDelay with 2 attempts and 2-second delay"
  - "Set dedup_failure_reason via atomic Client.updateOne to avoid race conditions"
  - "Creditors pass through unmerged on failure - pipeline continues, no blocking"
  - "Return manual_review_flagged: true in error result for caller visibility"

patterns-established:
  - "Retry-wrapped external API calls: retryWithDelay wraps axios.post with per-attempt logging"
  - "Atomic failure flagging: Client.updateOne for case-level flags to prevent race conditions"
  - "Fail-safe pipeline: return error result instead of throwing, allowing pipeline to continue"

# Metrics
duration: 2min
completed: 2026-02-01
---

# Phase 05 Plan 02: Failure Handling & Retry Summary

**Retry-wrapped FastAPI dedup call with atomic manual review flagging on failure after 2 attempts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-01T15:48:49Z
- **Completed:** 2026-02-01T15:51:08Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Wrapped FastAPI axios.post call in retryWithDelay (2 attempts, 2-second delay between attempts)
- Implemented manual review flagging on failure via atomic Client.updateOne setting dedup_failure_reason
- Creditors pass through unmerged on failure (no silent duplicate pass-through)
- Structured logging includes creditor count, error message, and attempt number per FAIL-03 requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap FastAPI call in retryWithDelay and add manual review flagging** - `b655aa0` (feat)

_Note: Task 2 was a read-verify task with no code changes, so it was not committed separately._

## Files Created/Modified
- `server/services/aiDedupScheduler.js` - Wrapped FastAPI call in retryWithDelay, added manual review flagging in catch block

## Decisions Made

**1. Wrap FastAPI call in retryWithDelay with 2 attempts and 2-second delay**
- Rationale: Per context decision, single retry (2 total attempts) with short delay (2 seconds) balances resilience against transient failures while avoiding long delays in pipeline.
- Impact: Dedup retries once on any failure before falling back to manual review flagging.

**2. Set dedup_failure_reason via atomic Client.updateOne**
- Rationale: Matches existing dedup guard pattern (dedup_in_progress flag). Atomic update prevents race conditions with other operations that may modify client record.
- Impact: Failure flagging is safe in concurrent scenarios.

**3. Creditors pass through unmerged on failure**
- Rationale: Per context decision, pipeline should not block on dedup failure. Creditors proceed as-is with manual review flag set at case level.
- Impact: Pipeline continues flowing. Admin can review case and manually deduplicate later.

**4. Return manual_review_flagged: true in error result**
- Rationale: Caller visibility into whether failure was just logged or also flagged for review. Enables different handling in callers if needed.
- Impact: Clear API contract for error scenarios.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Phase 6 (Path Consistency & Integration) to ensure both auto pipeline and admin manual trigger use identical robust dedup logic.

**Prerequisites delivered:**
- Retry logic fully integrated in runAIRededup()
- Manual review flagging working via dedup_failure_reason field
- Creditors pass through unmerged on failure (pipeline continues)
- All three FAIL requirements satisfied:
  - FAIL-01: Dedup retries once on LLM failure before falling back ✓
  - FAIL-02: Cases flag for manual review if retry fails (no silent pass-through) ✓
  - FAIL-03: Failures logged with creditor count, error message, and attempt number ✓

**Next steps:** Phase 6 will verify admin manual trigger uses same dedup logic and ensure response schema to Node.js backend remains unchanged (backward compatible).

---
*Phase: 05-failure-handling-retry*
*Completed: 2026-02-01*
