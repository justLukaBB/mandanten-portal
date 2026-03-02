---
phase: 34-admin-ui-tracking
plan: 01
subsystem: ui
tags: [typescript, rtk-query, react, express, mongodb, second-letter]

# Dependency graph
requires:
  - phase: 33-email-dispatch-workflow-completion
    provides: send-second-letter endpoint and SecondLetterService dispatch orchestrator
provides:
  - second_letter_* fields on ClientDetailData, ClientDetailCreditor, AdminClient TypeScript types
  - useTriggerSecondLetterMutation, useSendSecondLetterMutation, useOverrideSecondLetterPlanTypeMutation RTK Query hooks
  - PATCH /api/admin/clients/:clientId/second-letter-plan-type endpoint with status and snapshot guards
  - second_letter_status field in Client List API response (getClients aggregation $project)
affects:
  - 34-02 (trigger button + status badge UI depends on these types and mutation hooks)
  - 34-03 (TrackingCanvas 3rd column and Client List badge depend on these types and API field)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RTK Query mutation with dual-tag invalidation (Client + WorkflowStatus) for state-machine endpoints"
    - "TypeScript optional fields for second_letter_* state machine data on existing interfaces"
    - "Express route guard pattern: check status SENT + snapshot exists before mutation"

key-files:
  created: []
  modified:
    - MandantenPortalDesign/src/app/types.ts
    - MandantenPortalDesign/src/store/api/clientDetailApi.ts
    - server/routes/admin-second-letter.js
    - server/controllers/adminDashboardController.js

key-decisions:
  - "Three mutation hooks mirror existing confirmFirstPayment pattern: POST body-less for trigger/send, PATCH with body for plan-type override"
  - "overrideSecondLetterPlanType invalidates only Client tag (not WorkflowStatus) — plan_type is snapshot data, not workflow-level state"
  - "second_letter_status added to getClients $project at line 1170 — one-line addition, no pipeline restructuring needed"

patterns-established:
  - "second_letter_* type fields added as optional on existing interfaces — no breaking changes to consumers"
  - "SENT guard and no-snapshot guard in plan-type override endpoint — prevents mutation of immutable post-dispatch data"

requirements-completed: [UI-01, UI-02, UI-03, UI-04]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 34 Plan 01: Types + RTK Query Mutations + Backend Plan-Type Endpoint Summary

**TypeScript second_letter_* types on three interfaces, three RTK Query mutation hooks, PATCH plan-type override endpoint with SENT/snapshot guards, and second_letter_status in Client List projection**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T22:26:34Z
- **Completed:** 2026-03-02T22:28:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended ClientDetailData, ClientDetailCreditor, AdminClient TypeScript interfaces with all second_letter_* fields needed by plans 02 and 03
- Added TriggerSecondLetterResponse and SendSecondLetterResponse interfaces; wired three RTK Query mutations with correct cache invalidation
- Created PATCH /api/admin/clients/:clientId/second-letter-plan-type with SENT guard and no-snapshot guard
- Added second_letter_status: 1 to getClients aggregation $project so Client List API returns the field to AdminClient consumers

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend TypeScript types and add RTK Query mutations** - `fb04f5c` (feat) — submodule
2. **Task 1: Submodule reference update** - `b1fafcb` (feat) — parent repo
3. **Task 2: Backend plan-type override endpoint and Client List projection** - `33bac06` (feat)

## Files Created/Modified
- `MandantenPortalDesign/src/app/types.ts` - Added second_letter_* fields to ClientDetailData (state machine + snapshot), ClientDetailCreditor (tracking), AdminClient (status); added TriggerSecondLetterResponse and SendSecondLetterResponse interfaces
- `MandantenPortalDesign/src/store/api/clientDetailApi.ts` - Imported new response types; added triggerSecondLetter, sendSecondLetter, overrideSecondLetterPlanType mutations; exported three new hooks
- `server/routes/admin-second-letter.js` - Added PATCH /clients/:clientId/second-letter-plan-type with validation, SENT guard, snapshot guard
- `server/controllers/adminDashboardController.js` - Added second_letter_status: 1 to getClients aggregation $project (line 1170)

## Decisions Made
- `overrideSecondLetterPlanType` invalidates only `{ type: 'Client', id: clientId }` — not WorkflowStatus — because plan_type lives in the snapshot subdocument, not the main workflow state
- SENT guard returns 400 (not 409) for plan-type override — the conflict is a validation failure, not an idempotency scenario
- `second_letter_status` field added to AdminClient as `string` (not union) — consistent with how `workflow_status` is typed on AdminClient (unknown values must not break runtime)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- MandantenPortalDesign is a git submodule — required committing inside submodule first, then updating the parent repo reference. Both commits made in correct order.

## Next Phase Readiness
- All TypeScript types and RTK Query hooks ready for Phase 34 Plan 02 (trigger button + status badge + plan override UI)
- Client List API now returns second_letter_status for Phase 34 Plan 03 (Client List badge + TrackingCanvas 3rd column)
- No blockers for Plan 02 or Plan 03

---
*Phase: 34-admin-ui-tracking*
*Completed: 2026-03-02*
