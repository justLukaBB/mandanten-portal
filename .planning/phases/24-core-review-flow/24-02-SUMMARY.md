---
phase: 24-core-review-flow
plan: 02
subsystem: ui
tags: [react, redux, rtk-query, typescript, form, correction-form]

# Dependency graph
requires:
  - phase: 24-core-review-flow
    plan: 01
    provides: reviewUiSlice (setCurrentCreditorIndex, recordReviewAction, selectReviewActions, selectSkipReasonsEnabled), useSaveReviewCorrectionMutation, ReviewWorkspacePage shell with right-panel placeholder, ReviewDataResponse types, ClientDetailCreditor types

provides:
  - CreditorSelector: prev/next navigation with expandable creditor list showing per-creditor review status icons
  - ReviewCorrectionForm: 9-field form in 2 sections (Glaeubiger + Glaeubigervertreter) with AI-prefill color-coded left borders
  - ReviewActionBar: fixed bottom bar with Bestaetigen/Korrigieren/Ueberspringen actions + inline skip reason panel
  - ReviewWorkspacePage updated: form state management + all three subcomponents wired together

affects:
  - 24-03 (summary dialog — handleActionComplete already shows toast on last creditor; Plan 03 replaces with ReviewSummaryDialog)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Parent-owned form state pattern: ReviewWorkspacePage owns formValues via useState, passes to child form and action bar
    - useRef for original AI values: originalValuesRef captures initial prefill on creditor change for diff detection
    - Inline skip reason panel: slide-up div below action bar with predefined categories, controlled by showSkipPanel state
    - Corrections diff: ReviewActionBar builds corrections object from only fields that differ from originalValues

key-files:
  created:
    - MandantenPortalDesign/src/app/components/creditor-selector.tsx
    - MandantenPortalDesign/src/app/components/review-correction-form.tsx
    - MandantenPortalDesign/src/app/components/review-action-bar.tsx
  modified:
    - MandantenPortalDesign/src/app/components/review-workspace-page.tsx

key-decisions:
  - "Parent-owned form state (ReviewWorkspacePage useState) so both ReviewCorrectionForm and ReviewActionBar share same formValues without prop drilling through intermediary"
  - "useRef for original values captures AI prefill on creditor change; allows green border detection without additional Redux state"
  - "Corrections diff on Korrigieren: only sends fields that differ from originalValues, reducing payload size"
  - "Skip reason panel is inline (renders above action bar) rather than a modal — keeps user in context"
  - "CreditorSelector expandable list auto-closes after clicking a creditor for cleaner UX"

patterns-established:
  - "AI-prefill border: blue (3px solid #3B82F6) = AI-extracted, amber (#F59E0B) = empty, green (#10B981) = user-edited"
  - "Action bar buttons layout: flex row, each button flex:1 for equal width, loading spinner during mutation"
  - "Skip reason categories: SKIP_REASONS constant array, Sonstiges has free-text input"

requirements-completed: [FLOW-02, FLOW-03]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 24 Plan 02: Core Review Flow - Correction Form Summary

**CreditorSelector + ReviewCorrectionForm (9 AI-prefill fields with color-coded borders) + ReviewActionBar (Bestaetigen/Korrigieren/Ueberspringen with inline skip reasons) wired into ReviewWorkspacePage**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-23T17:24:23Z
- **Completed:** 2026-02-23T17:29:12Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 updated)

## Accomplishments

- CreditorSelector renders prev/next navigation bar with expandable creditor list; each item shows review status icon (CheckCircle=confirmed, PencilLine=corrected, SkipForward=skipped, Circle=pending) with color-coded background
- ReviewCorrectionForm renders 9 editable fields in 2 sections: Glaeubiger (Name, Aktenzeichen, Adresse textarea, Forderungsbetrag with Euro prefix, Email) and Glaeubigervertreter (Name, Adresse textarea, AZ, Email) — all with AI-prefill left border color logic
- ReviewActionBar renders 3 action buttons (green/blue/orange) all calling useSaveReviewCorrectionMutation; skip reason inline panel with 5 predefined categories, Sonstiges text input, and toggle to disable reason requirement; Korrigieren sends only diff'd fields
- ReviewWorkspacePage fully updated: owns form state, initializes formValues from creditor data on creditor change, wires all three components in right panel replacing the Plan 01 placeholder

## Task Commits

Each task was committed atomically (in MandantenPortalDesign submodule):

1. **Task 1: CreditorSelector + ReviewCorrectionForm components** - `d764b43` (feat)
2. **Task 2: ReviewActionBar + ReviewWorkspacePage wiring** - `fbc988d` (feat)

**Plan metadata:** committed in final docs commit

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/creditor-selector.tsx` (NEW, 315 lines) - Prev/next navigation with expandable creditor list and per-creditor review status icons
- `MandantenPortalDesign/src/app/components/review-correction-form.tsx` (NEW, 306 lines) - 9-field correction form with AI-prefill color-coded left borders, review reasons banner, field indicator legend
- `MandantenPortalDesign/src/app/components/review-action-bar.tsx` (NEW, 464 lines) - Fixed bottom bar with 3 action buttons, inline skip reason panel with predefined categories and toggle
- `MandantenPortalDesign/src/app/components/review-workspace-page.tsx` (UPDATED) - Replaced right-panel placeholder with CreditorSelector + ReviewCorrectionForm + ReviewActionBar; added form state management

## Decisions Made

- Used parent-owned form state (ReviewWorkspacePage useState) so both ReviewCorrectionForm and ReviewActionBar share same formValues without prop drilling through intermediary
- useRef for original values: captures AI prefill on creditor change, enables green border detection (user-edited) without additional Redux state
- Corrections diff on Korrigieren: only sends fields that differ from originalValues to reduce payload size and make diffs semantically meaningful
- Skip reason panel is inline (renders above action bar, not modal) — keeps user in review context
- CreditorSelector expandable list auto-closes after clicking a creditor for cleaner UX

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate `title` attribute on skip toggle button**
- **Found during:** Task 2 (ReviewActionBar)
- **Issue:** Button had two `title` attributes causing TypeScript error TS17001
- **Fix:** Removed the duplicate attribute
- **Files modified:** MandantenPortalDesign/src/app/components/review-action-bar.tsx
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** fbc988d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix, no scope change.

## Issues Encountered

None beyond the duplicate attribute bug caught by TypeScript.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 complete; Plan 03 can now implement ReviewSummaryDialog by importing from reviewUiSlice (`selectReviewActions`) and using `useCompleteReviewMutation`
- `handleActionComplete` in ReviewWorkspacePage shows a toast on last creditor — Plan 03 replaces this with ReviewSummaryDialog trigger
- All 3 action types (confirm/correct/skip) dispatch to Redux via recordReviewAction; summary dialog can read the full actions map

## Self-Check: PASSED

- FOUND: MandantenPortalDesign/src/app/components/creditor-selector.tsx (315 lines)
- FOUND: MandantenPortalDesign/src/app/components/review-correction-form.tsx (306 lines)
- FOUND: MandantenPortalDesign/src/app/components/review-action-bar.tsx (464 lines)
- FOUND: .planning/phases/24-core-review-flow/24-02-SUMMARY.md
- Commits d764b43 and fbc988d verified in git log
- TypeScript: exit code 0 (no errors)

---
*Phase: 24-core-review-flow*
*Completed: 2026-02-23*
