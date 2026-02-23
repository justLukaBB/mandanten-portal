---
phase: 26-enhanced-viewer-analytics
plan: 03
subsystem: ui, api
tags: [react, mongodb, mongoose, rtk-query, shadcn-ui, sonner, typescript]

# Dependency graph
requires:
  - phase: 26-02
    provides: analytics backend + ReviewAnalyticsPage with RTK Query patterns

provides:
  - GET /api/admin/review/settings — returns confidence_threshold and auto_assignment_enabled with defaults
  - PUT /api/admin/review/settings — persists settings via upsert pattern, validates inputs
  - ReviewSettings mongoose model with review_settings collection
  - ReviewSettingsPage component with confidence threshold input and auto-assignment toggle
  - Auto-save behavior: debounced 500ms for number input, immediate for toggle, sonner toast feedback
  - /review/settings route in App.tsx
  - Review Einstellungen sidebar link

affects: [27-csv-export-polling, future review automation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-document upsert pattern for global settings (ReviewSettings.findOneAndUpdate with upsert:true)
    - useRef debounce timer for auto-save with cleanup on unmount
    - Initialised ref flag to prevent state overwrite after first server load

key-files:
  created:
    - server/models/ReviewSettings.js
    - MandantenPortalDesign/src/app/components/review-settings-page.tsx
  modified:
    - server/controllers/adminReviewController.js
    - server/routes/admin-review.js
    - MandantenPortalDesign/src/store/api/reviewApi.ts
    - MandantenPortalDesign/src/store/api/baseApi.ts
    - MandantenPortalDesign/src/app/types.ts
    - MandantenPortalDesign/src/app/App.tsx
    - MandantenPortalDesign/src/app/components/sidebar.tsx

key-decisions:
  - "ReviewSettings uses upsert pattern (findOneAndUpdate with {}) — single document per installation, created on first PUT"
  - "Debounce timer via useRef with cleanup on unmount — no external debounce library needed"
  - "initialised ref flag prevents server data from overwriting in-flight user edits after first load"
  - "ReviewSettings tagType added to baseApi — invalidation on update triggers fresh GET"
  - "Settings page placed before /review/:clientId route to prevent param collision"

patterns-established:
  - "Global settings pattern: single-document collection with upsert, return defaults on empty findOne"
  - "Auto-save with debounce: useRef timer, 500ms for inputs, immediate for toggles"

requirements-completed: [VIEW-03]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 26 Plan 03: Review Settings Page Summary

**Review settings backend (GET/PUT /api/admin/review/settings) with ReviewSettingsPage showing confidence threshold input and auto-assignment toggle with auto-save via debounce and sonner toasts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T18:35:37Z
- **Completed:** 2026-02-23T18:38:47Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Backend settings API with ReviewSettings model (single-document upsert, defaults on empty GET)
- ReviewSettingsPage with exactly 2 fields: confidence threshold number input + auto-assignment toggle
- Auto-save: threshold debounced 500ms, toggle immediate — both show sonner toast on success/error
- /review/settings route wired in App.tsx before /review/:clientId, sidebar link added

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend settings endpoints + storage schema** - `6b6bd5e` (feat)
2. **Task 2: ReviewSettingsPage with auto-save and route wiring** - `f30bb58` (feat, submodule) + `40ce8aa` (chore, submodule ref)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `server/models/ReviewSettings.js` — Mongoose model for review_settings collection with confidence_threshold, auto_assignment_enabled
- `server/controllers/adminReviewController.js` — Added getSettings and updateSettings handlers
- `server/routes/admin-review.js` — Added GET /settings and PUT /settings routes
- `MandantenPortalDesign/src/app/types.ts` — Added ReviewSettings and ReviewSettingsResponse interfaces
- `MandantenPortalDesign/src/store/api/baseApi.ts` — Added ReviewSettings to tagTypes
- `MandantenPortalDesign/src/store/api/reviewApi.ts` — Added getReviewSettings query and updateReviewSettings mutation
- `MandantenPortalDesign/src/app/components/review-settings-page.tsx` — New page component (2 fields, auto-save, loading skeletons, error state)
- `MandantenPortalDesign/src/app/App.tsx` — Added /review/settings route
- `MandantenPortalDesign/src/app/components/sidebar.tsx` — Added Review Einstellungen nav link

## Decisions Made

- ReviewSettings uses upsert pattern (findOneAndUpdate with `{}`) — single document per installation, created on first PUT
- Debounce timer via useRef with cleanup on unmount — no external debounce library needed
- initialised ref flag prevents server data from overwriting in-flight user edits after first load
- ReviewSettings tagType added to baseApi — cache invalidation on update triggers fresh GET
- Settings page placed before /review/:clientId to prevent param collision (consistent with review/analytics pattern)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Settings API ready for future automation (auto-assignment based on confidence_threshold)
- Phase 27 (CSV/XLSX export, polling + sidebar badge, agent redirect) can proceed

## Self-Check: PASSED

- FOUND: server/models/ReviewSettings.js
- FOUND: MandantenPortalDesign/src/app/components/review-settings-page.tsx
- FOUND: .planning/phases/26-enhanced-viewer-analytics/26-03-SUMMARY.md
- FOUND commit: 6b6bd5e (feat(26-03): add review settings backend endpoints and model)
- FOUND commit: f30bb58 (feat(26-03): add ReviewSettingsPage — submodule)
- TypeScript check: PASSED
- Build: PASSED (2.29s)

---
*Phase: 26-enhanced-viewer-analytics*
*Completed: 2026-02-23*
