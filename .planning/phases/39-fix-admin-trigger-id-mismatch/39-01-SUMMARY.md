---
phase: 39-fix-admin-trigger-id-mismatch
plan: 01
subsystem: api
tags: [mongodb, mongoose, secondletter, trigger, bugfix]

# Dependency graph
requires:
  - phase: 29-trigger-scheduler-client-notification
    provides: SecondLetterTriggerService with IDLE→PENDING atomic state transition
  - phase: 34-admin-ui-tracking
    provides: Admin trigger button calling adminSecondLetterController with req.params.clientId (_id)
provides:
  - Fixed triggerForClient accepting MongoDB _id (ObjectId string) from both admin and scheduler
  - All 34 v10 2. Anschreiben requirements now Complete
affects: [v10-integration-testing, end-to-end-admin-trigger]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - server/services/secondLetterTriggerService.js
    - .planning/REQUIREMENTS.md

key-decisions:
  - "triggerForClient now accepts MongoDB _id string from both admin route (req.params.clientId) and scheduler (client._id.toString()) — UUID id field is no longer used in query filters"
  - "Phase 39 closes last open v10 requirement: TRIG-02 complete, 34/34 v10 requirements satisfied"

patterns-established: []

requirements-completed: [TRIG-02]

# Metrics
duration: 1min
completed: 2026-03-03
---

# Phase 39 Plan 01: Fix Admin Trigger id/_id Mismatch Summary

**Two-line fix in secondLetterTriggerService.js: changed `{ id: clientId }` to `{ _id: clientId }` in both Mongoose query filters so admin manual trigger correctly matches MongoDB ObjectId instead of UUID field — closes last open v10 requirement TRIG-02.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-03T11:37:27Z
- **Completed:** 2026-03-03T11:38:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed atomic findOneAndUpdate filter: `{ id: clientId }` → `{ _id: clientId }` (line 56)
- Fixed fallback findOne filter: `{ id: clientId }` → `{ _id: clientId }` (line 83)
- Fixed scheduler call: `client.id` → `client._id.toString()` (line 163) to stay consistent
- Dropped `id` from `.select()` projection in scheduler query (not needed, `_id` included by default)
- Updated JSDoc to document `_id` parameter contract
- Marked TRIG-02 complete in REQUIREMENTS.md — all 34 v10 requirements now Complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix id/_id in secondLetterTriggerService.js** - `b547f66` (fix)
2. **Task 2: Mark TRIG-02 complete in REQUIREMENTS.md** - `0748c27` (feat)

## Files Created/Modified

- `server/services/secondLetterTriggerService.js` - Two query filters and scheduler call updated to use `_id` instead of `id`
- `.planning/REQUIREMENTS.md` - TRIG-02 checked complete, traceability row updated, footer updated to 34/34

## Root Cause

The admin route (`adminSecondLetterController.js`) passes `req.params.clientId` which is the MongoDB `_id` (ObjectId string) from the URL. The service queried with `{ id: clientId }` — the UUID `id` field — so `findOneAndUpdate` matched no document and returned null. Null return is interpreted as "alreadyTriggered", so no state transition happened, no email was sent, and the admin saw silent failure on every click.

## Decisions Made

- triggerForClient now accepts `_id` from both callers — admin (ObjectId string from URL param) and scheduler (client._id.toString()). The UUID `id` field is no longer used in query filters.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- v10 2. Anschreiben Automatisierung is fully satisfied: all 34 requirements Complete
- Ready for end-to-end integration testing: put client in IDLE, click admin trigger, verify PENDING transition + notification email
- No code blockers remain

---
*Phase: 39-fix-admin-trigger-id-mismatch*
*Completed: 2026-03-03*
