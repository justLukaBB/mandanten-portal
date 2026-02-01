---
phase: 06-path-consistency-integration
plan: 01
subsystem: deduplication
tags: [service-layer, admin-api, refactoring, code-consolidation]
requires:
  - 05-02-failure-handling-retry
provides:
  - unified-dedup-path
  - admin-atomic-guard
  - admin-retry-logic
  - dedup-source-tracking
affects:
  - future-dedup-path-additions
tech-stack:
  added: []
  patterns:
    - shared-service-layer
    - thin-http-controllers
    - atomic-guard-reuse
key-files:
  created: []
  modified:
    - server/services/aiDedupScheduler.js
    - server/controllers/adminClientCreditorController.js
key-decisions:
  - decision: Add optional source parameter to runAIRededup
    rationale: Enables tracking whether dedup was triggered by auto pipeline or admin manual action
    impact: All deduplication_history entries now include source field for auditing
  - decision: Replace entire admin dedup logic with service layer call
    rationale: Eliminates ~190 lines of duplicated logic between auto and admin paths
    impact: Admin gains retry, atomic guard, 60s timeout, and consistent enrichment/field-preservation
  - decision: Use deduplication_history instead of status_history for admin triggers
    rationale: Unified history tracking per phase 6 design
    impact: Admin dedup events tracked consistently with auto pipeline
duration: 2m 33s
completed: 2026-02-01
---

# Phase [6] Plan [1]: Path Consistency Integration Summary

**Unified auto pipeline and admin manual trigger to use the same runAIRededup service, eliminating code divergence and gaining retry/guard/timeout for admin path**

## Performance

**Duration:** 2 minutes 33 seconds
**Task velocity:** 1m 16s average per task

## Accomplishments

### 1. Service Layer Enhancement
- Added optional `options = {}` third parameter to `runAIRededup` function
- Destructured `source` field with default value `'auto'` for backward compatibility
- Existing auto pipeline callers unaffected due to default parameter

### 2. Dedup History Source Tracking
- Added `source` field to all `deduplication_history` entries
- Auto pipeline writes `source: 'auto'`
- Admin manual trigger writes `source: 'admin'`
- Enables auditing and debugging of dedup paths

### 3. Admin Controller Refactoring
- Replaced ~230 lines of duplicated dedup logic with thin HTTP wrapper (~40 lines)
- Removed inline axios import and FastAPI URL configuration
- Removed duplicate enrichment logic (service handles this)
- Removed duplicate field preservation logic (service handles this)
- Removed duplicate manual review flagging (service handles this)
- Removed status_history push (service uses deduplication_history)

### 4. Admin Gains Service Layer Features
Admin manual trigger now gets for free:
- **Retry logic:** 2 attempts with 2s delay between attempts
- **Atomic guard:** MongoDB atomic update prevents double-click race conditions
- **60s timeout:** Consistent with auto pipeline (was 300s/5min before)
- **Enrichment:** Same DB lookup logic as auto pipeline
- **Field preservation:** Same document link and review flag preservation
- **Consistent logging:** Per-attempt structured logging

### 5. HTTP 409 Conflict for Concurrent Operations
- Admin API returns HTTP 409 when dedup already in progress
- Includes `retry_after: 60` hint for client retry logic
- Clear error message for user feedback

### 6. Response Schema Preservation
Admin API response unchanged for frontend compatibility:
```json
{
  "success": true,
  "message": "AI re-deduplication completed successfully",
  "stats": {
    "original_count": 10,
    "unique_count": 8,
    "duplicates_removed": 2
  },
  "creditors": [...]
}
```

## Task Commits

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Add options parameter to runAIRededup with source tracking | 5c8858a | server/services/aiDedupScheduler.js |
| 2 | Replace admin dedup logic with shared service layer | 3b37ed1 | server/controllers/adminClientCreditorController.js |

## Files Created/Modified

### Modified
- `server/services/aiDedupScheduler.js`
  - Added `options = {}` parameter to `runAIRededup` function signature
  - Added `source` field destructuring with default `'auto'`
  - Added `source` field to `deduplication_history.push()` call

- `server/controllers/adminClientCreditorController.js`
  - Added import of `runAIRededup` from `../services/aiDedupScheduler`
  - Replaced lines 646-838 with ~40-line thin controller
  - Added HTTP 409 response for `dedup_already_in_progress`
  - Removed inline `require('axios')` and FastAPI configuration
  - Removed `enrichDedupedCreditorFromDb` call (kept function for other endpoints)
  - Removed duplicate `isMissing` helper and manual review check
  - Removed duplicate `existingMap` build and field preservation
  - Removed status_history push (service handles this)

## Decisions Made

### 1. Options Parameter Pattern
**Decision:** Use options object with destructuring instead of adding source as second parameter

**Rationale:**
- Backward compatible (existing callers pass 2 args, options defaults to {})
- Extensible (future options can be added without signature changes)
- Clear intent (destructured source with default value)

**Impact:**
- No changes required to existing callers (scheduleAIRededup)
- Future-proof for additional options

### 2. Deduplication History vs Status History
**Decision:** Use `deduplication_history` for both auto and admin triggers, remove status_history push from admin

**Rationale:**
- Per phase 6 design (CONTEXT.md): unified history tracking
- status_history was admin-specific divergence
- deduplication_history provides structured tracking with source field

**Impact:**
- Consistent history tracking across all dedup paths
- Easier auditing and debugging
- No more dual history tracking

### 3. Response Schema Preservation
**Decision:** Keep exact same response schema for admin API

**Rationale:**
- Frontend depends on existing schema
- No frontend changes required
- Schema includes full creditor array for UI refresh

**Impact:**
- Zero frontend changes needed
- Backend refactoring transparent to frontend

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None. Changes are backend-only and backward compatible.

## Next Phase Readiness

Phase 6 is now complete (1/1 plans). All success criteria met:

✓ Both auto pipeline and admin manual trigger call the same `runAIRededup` function
✓ Admin response schema unchanged: `{ success, message, stats, creditors }`
✓ Admin gets atomic guard (HTTP 409 on double-click), retry (2 attempts, 2s delay), and 60s timeout
✓ Dedup history entries include `source: 'auto'` or `source: 'admin'`
✓ ~190 lines of duplicated logic removed from admin controller
✓ No syntax errors in either modified file

**Project Status:**
- All 6 phases complete
- v2 Robust Dedup feature complete
- Ready for integration testing and deployment

**Recommended Next Steps:**
1. Integration testing: Test both auto pipeline and admin manual trigger paths
2. Verify HTTP 409 handling in frontend (if not already implemented)
3. Monitor `deduplication_history` source field in production for auditing
4. Consider adding analytics dashboard for dedup source breakdown
