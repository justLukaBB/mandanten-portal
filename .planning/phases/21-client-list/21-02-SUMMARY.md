---
phase: 21-client-list
plan: 02
subsystem: ui
tags: [react, typescript, react-router, rtk-query, tailwind, url-params]

# Dependency graph
requires:
  - phase: 21-client-list-01
    provides: ClientList self-fetching via RTK Query, useGetClientsQuery, AdminClient type, filter state in local useState

provides:
  - URL-synced filter state via useSearchParams (search, status, flow, page, limit)
  - Removable filter chips above client table for active filters
  - Page size dropdown (25/50/100) in pagination area
  - Zero-results state with SearchX icon, hint text, and "Filter zurücksetzen" button
  - 300ms debounced search synced to URL param; local searchInput for immediate feedback
  - Clean URL: default values (page=1, limit=25, status=all, search='') omitted from URL
  - App.tsx with no mock data imports; Sidebar receives empty recentCases array

affects:
  - Phase 22 (client detail — will wire Sidebar recentCases and ClientDetail real API)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useSearchParams from react-router for URL-synced filter state — all filter state in URL, not local useState
    - setParam helper omits default values from URL for clean bookmarkable URLs
    - resetAllFilters sets setSearchParams(new URLSearchParams()) to clear all params at once
    - Local searchInput state for immediate typing feedback; 300ms debounce writes to URL

key-files:
  created: []
  modified:
    - MandantenPortalDesign/src/app/components/client-list.tsx
    - MandantenPortalDesign/src/app/App.tsx

key-decisions:
  - "useSearchParams replaces all local useState filter state — URL is the single source of truth for filter/pagination"
  - "setParam helper omits defaults from URL (page=1, limit=25, status=all) for clean bookmarkable URLs"
  - "App.tsx ClientDetailPage shows placeholder until Phase 22 wires useGetClientQuery — mockClients.find() removed entirely"
  - "Sidebar recentCases={[]} for now — real recent cases data wired in Phase 22"

patterns-established:
  - "Pattern: URL params as filter state source of truth — useSearchParams(prev => ...) for atomic URL updates"
  - "Pattern: Local input state (searchInput) + debounce -> URL param for search UX without URL thrash"

requirements-completed: [LIST-02, LIST-03, LIST-04]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 21 Plan 02: Client List URL-Synced Filters Summary

**URL-synced search, status filter, flow filter with removable chips, configurable page size (25/50/100), and zero-results state with reset button replacing local useState filter state**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T21:46:42Z
- **Completed:** 2026-02-18T21:50:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced all local useState filter state with useSearchParams — search, status, flow, page, limit all stored in URL
- Added removable filter chips row showing active filters (status, flow, search) with individual X buttons
- Added page size dropdown (25/50/100) in pagination area; changing size resets to page 1
- Zero-results state upgraded with SearchX icon, muted hint text, and "Filter zurücksetzen" button that calls setSearchParams(new URLSearchParams())
- App.tsx fully migrated off mock data — no mock imports remain, Sidebar gets empty array

## Task Commits

Each task was committed atomically:

1. **Task 1: Sync all filters to URL params, add filter chips, page size selector, and zero-results state** - `4925eed` (feat)
2. **Task 2: Update App.tsx to remove mock data dependency and pass AdminClient type** - `71b8b89` (feat)

**Plan metadata:** `(docs commit follows)`

## Files Created/Modified
- `MandantenPortalDesign/src/app/components/client-list.tsx` - Full rewrite: useSearchParams replaces all local useState filter state; setParam helper; 300ms debounced searchInput; filteredClients via useMemo; filter chips; page size dropdown; upgraded zero-results state
- `MandantenPortalDesign/src/app/App.tsx` - Removed mockClients import; ClientDetailPage shows placeholder (Phase 22 wires real API); Sidebar recentCases={[]}

## Decisions Made
- `useSearchParams` replaces all local `useState` filter state — URL is the single source of truth, making filter state bookmarkable and surviving page reloads
- `setParam` helper omits default values from URL (page=1, limit=25, status/flow=all, search='') so URLs stay clean
- App.tsx `ClientDetailPage` no longer uses `mockClients.find()` — shows placeholder shape until Phase 22 wires `useGetClientQuery(id)`
- `recentCases={[]}` passed to Sidebar — real recent cases data is Phase 22 scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `flows: [] as const` type error in App.tsx placeholder**
- **Found during:** Task 2 (App.tsx mock data removal)
- **Issue:** `flows: [] as const` creates `readonly []` type, incompatible with mutable `FlowBadge[]` expected by `Client` interface
- **Fix:** Changed to `flows: [] as FlowBadge[]`; added `FlowBadge` to import from `./types`
- **Files modified:** MandantenPortalDesign/src/app/App.tsx
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `71b8b89` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type error)
**Impact on plan:** Minimal — single type annotation fix for TypeScript correctness. No scope creep.

## Issues Encountered
- None beyond the auto-fixed type error above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ClientList is fully interactive with bookmarkable URL state
- All filter state survives page reload and browser back/forward navigation
- App.tsx uses AdminClient type throughout; no mock data remains
- Phase 22 can now wire ClientDetail real API (useGetClientQuery) and update Sidebar recentCases

## Self-Check: PASSED

- `MandantenPortalDesign/src/app/components/client-list.tsx` — FOUND
- `MandantenPortalDesign/src/app/App.tsx` — FOUND
- `4925eed` (Task 1 commit) — FOUND
- `71b8b89` (Task 2 commit) — FOUND

---
*Phase: 21-client-list*
*Completed: 2026-02-18*
