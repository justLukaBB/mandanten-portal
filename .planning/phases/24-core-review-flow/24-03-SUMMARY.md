---
phase: 24-core-review-flow
plan: 03
subsystem: ui
tags: [react, redux, rtk-query, typescript, dialog, shadcn]

# Dependency graph
requires:
  - phase: 24-core-review-flow
    plan: 02
    provides: reviewUiSlice (selectReviewActions, resetReviewState, recordReviewAction), useCompleteReviewMutation, ReviewWorkspacePage with handleActionComplete placeholder, ReviewCreditorWithDocs types

provides:
  - ReviewSummaryDialog: action breakdown stat cards (Bestätigt/Korrigiert/Übersprungen/Ausstehend) + per-creditor clickable list + Abschliessen button calling POST /complete
  - ReviewWorkspacePage updated: opens summary after last creditor, Zusammenfassung header button, handleReviseCreditor, handleComplete with auto-navigate to next queue case

affects:
  - 24-04 (if any) — review flow is now complete end-to-end

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ReviewSummaryDialog: Dialog modal over workspace with action breakdown + per-creditor list; onReviseCreditor closes dialog and sets index
    - handleComplete: fetch fresh queue after POST /complete, navigate to next case or /review if empty
    - Cleanup useEffect: dispatches resetReviewState on workspace unmount to prevent stale Redux state

key-files:
  created:
    - MandantenPortalDesign/src/app/components/review-summary-dialog.tsx
  modified:
    - MandantenPortalDesign/src/app/components/review-workspace-page.tsx

key-decisions:
  - "ReviewSummaryDialog calls POST /complete itself via useCompleteReviewMutation; parent handleComplete only handles navigation after success"
  - "handleComplete does a raw fetch of queue (not RTK Query) to avoid stale cache — after completion the cache may still show old data"
  - "Cleanup useEffect in ReviewWorkspacePage dispatches resetReviewState on unmount in addition to clientId-change reset"
  - "Zusammenfassung header button lets admin open summary any time (not only after last creditor)"

patterns-established:
  - "Dialog + fetch on complete: dismiss dialog after successful mutation, delegate navigation to parent callback"
  - "Stat card layout: 3 equal-width flex cards with colored bg, bold count, small label, icon"

requirements-completed: [FLOW-04]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 24 Plan 03: Core Review Flow - Summary Dialog & Completion Summary

**ReviewSummaryDialog with 3-stat action breakdown, per-creditor clickable revision list, and Abschliessen that calls POST /complete and auto-navigates to the next queue case**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T17:33:59Z
- **Completed:** 2026-02-23T17:36:50Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 updated)

## Accomplishments

- ReviewSummaryDialog built with 3 colored stat cards (Bestätigt green, Korrigiert blue, Übersprungen amber), pending warning banner, scrollable per-creditor list with status icon + action label + skip reason, and Abschliessen (orange CTA) / Zurück buttons
- Each creditor row in summary is clickable and calls onReviseCreditor(index) to close dialog and jump back to that creditor for revision
- Abschliessen calls useCompleteReviewMutation, shows success toast with next_step message, dispatches resetReviewState, then calls onComplete callback
- ReviewWorkspacePage updated: handleActionComplete opens summary dialog after last creditor instead of toast; Zusammenfassung header button for early manual access; handleReviseCreditor wired; handleComplete fetches fresh queue and navigates to next case or /review queue; cleanup useEffect resets Redux state on unmount

## Task Commits

Each task was committed atomically (in MandantenPortalDesign submodule):

1. **Task 1: ReviewSummaryDialog component** - `e1b131c` (feat)
2. **Task 2: Wire ReviewSummaryDialog into ReviewWorkspacePage + auto-load next case** - `ab7b734` (feat)

**Plan metadata:** committed in final docs commit

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/review-summary-dialog.tsx` (NEW, 427 lines) - Dialog with stat cards, per-creditor list, completion mutation
- `MandantenPortalDesign/src/app/components/review-workspace-page.tsx` (UPDATED) - Summary dialog integration, Zusammenfassung header button, auto-navigation on completion, cleanup useEffect

## Decisions Made

- ReviewSummaryDialog directly calls useCompleteReviewMutation; parent handleComplete only handles navigation post-success callback — keeps mutation logic co-located with the UI that triggers it
- handleComplete uses a raw fetch (not RTK Query) to get the fresh queue after completion, since the RTK Query cache may not have invalidated yet when the callback fires
- Added a second cleanup useEffect (on unmount) in ReviewWorkspacePage in addition to the clientId-change reset, so navigating away via browser back also clears review state
- Zusammenfassung header button provides early access to summary before completing all creditors — consistent with CONTEXT.md "Creditor list should show review status per creditor so admin has overview of progress"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 24 review flow is now fully end-to-end: queue → workspace (creditor review with correction form) → summary dialog → completion → auto-navigate to next case
- Phase 25 (or next phase) can build on this foundation; the review loop is complete
- All three action types (confirm/correct/skip) flow correctly through Redux to the summary

## Self-Check: PASSED

- FOUND: MandantenPortalDesign/src/app/components/review-summary-dialog.tsx (427 lines)
- FOUND: MandantenPortalDesign/src/app/components/review-workspace-page.tsx (ReviewSummaryDialog import + render verified)
- Commits e1b131c and ab7b734 verified in git log
- TypeScript: exit code 0 (no errors)

---
*Phase: 24-core-review-flow*
*Completed: 2026-02-23*
