---
phase: 25-queue-management
plan: 02
subsystem: frontend
tags: [rtk-query, react, multi-select, batch-operations, review-queue, framer-motion]

# Dependency graph
requires:
  - phase: 25-queue-management
    plan: 01
    provides: Admin review queue backend endpoints (assign, batch, priority, GET /api/admin/review/queue)
provides:
  - RTK Query mutations for assign, unassign, batchAssign, batchConfirm, batchUpdatePriority
  - getAdminReviewQueue query (GET /api/admin/review/queue with pagination/filters)
  - BatchActionBar sticky bottom bar for bulk operations on selected queue items
  - ReviewQueueTable with multi-select checkboxes, priority_score column, assigned-to column, overflow menu
affects: [25-queue-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RTK Query injectEndpoints — 5 new mutations + 1 new query added to existing reviewApi
    - AnimatePresence motion.div for BatchActionBar slide-up entrance (y: 100 -> 0, 150ms)
    - CSS class-based hover show/hide for overflow menu button (opacity: 0 -> 1 on group hover)
    - window.confirm for batchConfirm destructive action (simple, no extra Dialog dep)

key-files:
  created:
    - MandantenPortalDesign/src/app/components/batch-action-bar.tsx
  modified:
    - MandantenPortalDesign/src/store/api/reviewApi.ts
    - MandantenPortalDesign/src/app/components/review-queue-page.tsx

key-decisions:
  - "Switched ReviewQueuePage from useGetReviewQueueQuery (agent endpoint) to useGetAdminReviewQueueQuery (admin endpoint /api/admin/review/queue) — returns priority_score and review_assignment data needed by this plan"
  - "BatchActionBar placed as flat component at src/app/components/ (not review/ subdirectory) consistent with existing review-action-bar.tsx, review-queue-page.tsx naming convention"
  - "RowOverflowMenu uses CSS class overflow-menu-btn + JS opacity toggle on row hover rather than CSS :hover pseudo-class since motion.div rows complicate pure-CSS approach"
  - "AssignDropdown keeps open on submit attempt with empty name (button disabled) — prevents accidental close"
  - "window.confirm for batchConfirm — plan specified 'simple Dialog' and this avoids adding another Dialog component dependency"

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 25 Plan 02: Queue Management Frontend Summary

**Multi-select ReviewQueueTable with BatchActionBar — RTK Query mutations for all 5 admin assignment/batch endpoints, sticky slide-up action bar with Zuweisen/Priorität/Bestätigen bulk ops**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T18:19:25Z
- **Completed:** 2026-02-23T18:23:47Z
- **Tasks:** 2
- **Files modified:** 3 (1 created)

## Accomplishments

- Extended `reviewApi.ts` with `getAdminReviewQueue` query and 5 mutations: `assignReview`, `unassignReview`, `batchAssign`, `batchUpdatePriority`, `batchConfirm` — all invalidating `ReviewQueue` tag
- Added `AdminReviewQueueClient`, `AdminReviewQueueResponse`, `ReviewQueueParams` type definitions to reviewApi
- Created `BatchActionBar` component with framer-motion slide-up entrance (position: fixed, left: 220px for sidebar offset), `AssignDropdown` with inline agent name input, `PriorityDropdown` with 3 priority options, orange CTA Bestätigen button with `window.confirm`
- Updated `ReviewQueuePage` to use admin queue endpoint, added `selectedIds` state, select-all with indeterminate state, per-row checkboxes (leftmost, 16px), `RowOverflowMenu` (rightmost, hover-visible), `priority_score` column, `review_assignment.assigned_to` column
- Selection auto-clears on page/limit change and after each successful batch operation

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend reviewApi with assignment and batch mutations** — `5d6c470` (feat)
2. **Task 2: Add multi-select to ReviewQueueTable and create BatchActionBar** — `e3c0324` (feat)

## Files Created/Modified

- `MandantenPortalDesign/src/store/api/reviewApi.ts` — Added getAdminReviewQueue query, 5 batch/assign mutations, 3 new TypeScript interfaces (AdminReviewQueueClient, AdminReviewQueueResponse, ReviewQueueParams)
- `MandantenPortalDesign/src/app/components/batch-action-bar.tsx` — New BatchActionBar with AssignDropdown, PriorityDropdown, Bestätigen CTA — all using RTK Query mutations + sonner toasts
- `MandantenPortalDesign/src/app/components/review-queue-page.tsx` — Multi-select checkboxes, select-all indeterminate, priority_score column, assigned-to column, RowOverflowMenu, switched to admin endpoint, BatchActionBar rendered with AnimatePresence

## Decisions Made

- `ReviewQueuePage` now calls `useGetAdminReviewQueueQuery` (admin endpoint returning `priority_score` and `review_assignment`) instead of agent review queue — the admin portal needs admin-specific queue data
- `BatchActionBar` at flat `components/` level (not `components/review/` subdirectory) — consistent with `review-action-bar.tsx`, `review-queue-page.tsx` established naming
- `window.confirm` for batch confirm destructive action — plan allowed "simple Dialog" and this avoids unnecessary Dialog dependency for a simple yes/no confirmation
- `RowOverflowMenu` opacity managed via JS hover handlers (not CSS `:hover`) because framer-motion `motion.div` rows with `onMouseEnter`/`onMouseLeave` already control row background — consistent approach throughout

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Minor implementation notes (not deviations):**
- Plan referenced `ReviewQueueTable.tsx` in `components/review/` subdirectory but this project stores all review components flat at `components/` level (established in Phases 23-24). Applied existing convention.
- `AdminReviewQueueClient` type added to `reviewApi.ts` (as new exported type), while the `ReviewQueueClient` in `types.ts` is kept for backward compatibility with the agent review flow.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Admin can select multiple queue items and perform bulk operations from BatchActionBar
- All 5 admin endpoints consumed via RTK Query with proper cache invalidation
- Phase 26 (Enhanced Viewer Analytics) can build on the existing review queue infrastructure

## Self-Check: PASSED

All files exist and both commits verified in git log.

---
*Phase: 25-queue-management*
*Completed: 2026-02-23*
