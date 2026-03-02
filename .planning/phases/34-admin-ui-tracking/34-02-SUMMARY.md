---
phase: 34-admin-ui-tracking
plan: 02
subsystem: ui
tags: [typescript, rtk-query, react, second-letter, client-detail]

# Dependency graph
requires:
  - plan: 34-01
    provides: useTriggerSecondLetterMutation, useSendSecondLetterMutation, useOverrideSecondLetterPlanTypeMutation hooks + second_letter_* TypeScript types
provides:
  - SecondLetterSection inline component in client-detail.tsx overview tab
  - Trigger button with ConfirmActionDialog (always visible, disabled when not IDLE)
  - SecondLetterStatusBadge with four states: IDLE countdown, PENDING, FORM_SUBMITTED, SENT
  - Plan type override select (FORM_SUBMITTED only)
  - Send button with ConfirmActionDialog (FORM_SUBMITTED only)
  - Sent timestamp display (SENT only)
  - alreadyTriggered info toast handling
affects:
  - 34-03 (TrackingCanvas and Client List badge — independent of this plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IIFE pattern ((() => { ... })()) for self-contained inline section with local state computations in renderOverview"
    - "MAX(email_sent_at || document_sent_at) countdown calculation across final_creditor_list array"
    - "Dual ConfirmActionDialog pattern: trigger dialog + send dialog with separate open/loading state"

key-files:
  created: []
  modified:
    - MandantenPortalDesign/src/app/components/client-detail.tsx

key-decisions:
  - "IIFE pattern used for SecondLetterSection — keeps local computations (isIdle, isPending, etc.) scoped without extracting to a separate component file"
  - "SendSecondLetterResponse uses dispatched/failed/totalCreditors fields — partial failure detected via failed > 0 (not a partial boolean field)"
  - "Trigger button hover handlers guarded by isIdle check — prevents color flash when button is disabled"

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 34 Plan 02: SecondLetterSection in Client Detail Overview Summary

**SecondLetterSection inline component with trigger button, four-state status badge, plan type override select, send button, and all four confirmation/toast flows**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T22:32:56Z
- **Completed:** 2026-03-02T22:35:01Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `Send` icon import and three RTK Query mutation hooks to `ClientDetail` component
- Added `triggerDialogOpen` / `sendDialogOpen` state alongside existing dialog state
- Inserted inline `SecondLetterSection` IIFE block in `renderOverview()` between `</QuickActions>` and `<PhasePrerequisites>` with 16px bottom margin
- Status badge logic: countdown computed from MAX(email_sent_at || document_sent_at) across `final_creditor_list` for IDLE state; amber/blue/green pills for PENDING/FORM_SUBMITTED/SENT
- Trigger button always rendered, disabled (opacity 0.4, cursor not-allowed) when status is not IDLE or while loading; orange accent with hover state
- `ConfirmActionDialog` for trigger with `alreadyTriggered` → info toast, success → success toast, error → error toast
- Plan type `<select>` rendered only when `FORM_SUBMITTED` and snapshot exists; calls `overridePlanType` with success/error toast
- Green send button rendered only when `FORM_SUBMITTED`; `ConfirmActionDialog` with partial failure detection via `failed > 0`
- Sent timestamp displayed in JetBrains Mono when `SENT`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SecondLetterSection to Client Detail overview** - `d878d58` (feat) — submodule
2. **Task 1: Update submodule reference** - `ef7f099` (feat) — parent repo

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/client-detail.tsx` — Added Send import, three mutation hooks, two dialog state vars, 230-line SecondLetterSection IIFE in renderOverview()

## Decisions Made

- IIFE pattern (`(() => { ... })()`) for inline section — keeps local derived state scoped to the section without file-level extraction
- `SendSecondLetterResponse.failed > 0` used for partial failure detection (not a `partial` boolean field — field doesn't exist on the interface)
- Hover handlers on trigger button guarded with `isIdle && !isTriggeringSecondLetter` check to prevent background color mutation when disabled

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected SendSecondLetterResponse field names**
- **Found during:** Task 1 implementation
- **Issue:** Plan spec described `result.partial`, `result.sent`, `result.total` fields but `SendSecondLetterResponse` interface (added in Plan 01) uses `dispatched`, `failed`, `totalCreditors`
- **Fix:** Used `result.failed > 0` for partial detection, `result.dispatched` / `result.totalCreditors` for counts
- **Files modified:** `MandantenPortalDesign/src/app/components/client-detail.tsx`
- **Commit:** `d878d58`

## Self-Check: PASSED

- `MandantenPortalDesign/src/app/components/client-detail.tsx` — FOUND
- Submodule commit `d878d58` — FOUND (verified in submodule git log)
- Parent repo commit `ef7f099` — FOUND

---
*Phase: 34-admin-ui-tracking*
*Completed: 2026-03-02*
