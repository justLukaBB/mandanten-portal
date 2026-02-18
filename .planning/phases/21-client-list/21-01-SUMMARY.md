---
phase: 21-client-list
plan: 01
subsystem: ui
tags: [rtk-query, react, typescript, tailwind, sonner, polling]

# Dependency graph
requires:
  - phase: 19-project-foundation
    provides: RTK Query baseApi, Redux store, React Router, Vite proxy config
provides:
  - RTK Query clientsApi with useGetClientsQuery for GET /api/admin/clients
  - WorkflowStatus type union with 10 real backend states
  - AdminClient interface matching real API response shape
  - WORKFLOW_STATUS_LABELS constant for German labels
  - deriveFlowBadges helper mapping workflow_status to flow badges
  - StatusBadge component handling all 10 workflow states with color coding
  - FlowBadge component with gray fallback for unknown values
  - ClientList component self-fetching real data with 30s polling
affects:
  - 21-02 (client detail)
  - Phase 22 (sidebar, client detail real data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RTK Query injectEndpoints pattern for feature API slices injecting into baseApi
    - "string not WorkflowStatus union for runtime safety — unknown values render gray fallback"
    - Deterministic avatar color from client id hash (no backend avatar URLs)
    - Client-side flow filter applied after server-side paginated data load
    - 30s RTK Query pollingInterval for background auto-refresh

key-files:
  created:
    - MandantenPortalDesign/src/store/api/clientsApi.ts
  modified:
    - MandantenPortalDesign/src/app/types.ts
    - MandantenPortalDesign/src/app/components/status-badge.tsx
    - MandantenPortalDesign/src/app/components/flow-badge.tsx
    - MandantenPortalDesign/src/app/components/client-list.tsx
    - MandantenPortalDesign/src/app/App.tsx
    - MandantenPortalDesign/src/store/api/baseApi.ts

key-decisions:
  - "workflow_status typed as string (not WorkflowStatus union) in AdminClient — unknown runtime values render gray fallback badge without crashing"
  - "Flow badges derived client-side from workflow_status in deriveFlowBadges helper — backend has no separate flow field"
  - "Flow filter applied client-side after server paginated data loads — backend does not support flow param"
  - "Legacy Client interface kept in types.ts for Sidebar and ClientDetail until those components migrate in Phase 22"
  - "Initials avatar with deterministic color from id hash — backend provides no avatar URLs"

patterns-established:
  - "Pattern 1: baseApi.injectEndpoints for feature API slices — keeps RTK Query setup modular"
  - "Pattern 2: string type for status fields from backend — guard against unknown values at component boundary, not type level"
  - "Pattern 3: pollingInterval: 30000 on RTK Query hooks for silent auto-refresh"

requirements-completed: [LIST-01, LIST-05]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase 21 Plan 01: Client List API and Badge Components Summary

**RTK Query GET /api/admin/clients endpoint with 30s polling, 10-state German-labeled StatusBadge, and self-fetching ClientList replacing mock data**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18T21:38:41Z
- **Completed:** 2026-02-18T21:43:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created clientsApi.ts with useGetClientsQuery, pagination, search, status filter, and providesTags: ['Clients']
- Updated types.ts with WorkflowStatus union, AdminClient interface, WORKFLOW_STATUS_LABELS, and deriveFlowBadges helper
- Rewrote StatusBadge to render all 10 real workflow states with distinct colors and German labels; gray fallback for unknown values
- Updated FlowBadge to accept string type with gray fallback for unknown flows
- Rewrote ClientList to self-fetch via RTK Query with 30s polling, skeleton loading, error toasts, client-side flow filter, and server-side pagination

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RTK Query clients endpoint and update type definitions** - `f01f463` (feat)
2. **Task 2: Update badge components and wire ClientList to real data** - `b300320` (feat)

**Plan metadata:** `(docs commit follows)`

## Files Created/Modified
- `MandantenPortalDesign/src/store/api/clientsApi.ts` - RTK Query endpoint for GET /api/admin/clients with pagination, search, status filter params
- `MandantenPortalDesign/src/app/types.ts` - WorkflowStatus union, AdminClient interface, WORKFLOW_STATUS_LABELS constant, deriveFlowBadges function
- `MandantenPortalDesign/src/app/components/status-badge.tsx` - Handles all 10 workflow states with color map; German labels from WORKFLOW_STATUS_LABELS; gray fallback
- `MandantenPortalDesign/src/app/components/flow-badge.tsx` - String prop type; gray fallback (color: #9CA3AF) for unknown flows
- `MandantenPortalDesign/src/app/components/client-list.tsx` - Self-fetching via useGetClientsQuery; 30s polling; skeleton loading; error toast; server-side pagination; client-side flow filter; initials avatar
- `MandantenPortalDesign/src/app/App.tsx` - Removed clients prop from ClientListPage; added AdminClient type for onClientClick
- `MandantenPortalDesign/src/store/api/baseApi.ts` - Added 'Clients' tag type

## Decisions Made
- `workflow_status` kept as `string` (not `WorkflowStatus` union) in AdminClient to prevent runtime crashes from unexpected backend values — unknown values render gray fallback badges
- Flow badges derived client-side from workflow_status via `deriveFlowBadges` because backend has no separate flow field
- Flow filter applied client-side after server-paginated data loads (acceptable because page data is already fetched)
- Legacy `Client` interface kept for Sidebar and ClientDetail components — those will migrate in Phase 22
- Deterministic avatar color generated from client id hash — backend provides no avatar URLs

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- MandantenPortalDesign/ has its own embedded git repo — committed directly into MandantenPortalDesign's git history instead of parent repo (consistent with previous phases 19-03, 20-01)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ClientList fetches and renders real data from GET /api/admin/clients
- useGetClientsQuery hook ready for use in any component needing the client list
- StatusBadge and FlowBadge components ready for client detail views (Phase 22)
- AdminClient type available for downstream components

## Self-Check: PASSED

- `MandantenPortalDesign/src/store/api/clientsApi.ts` — FOUND
- `MandantenPortalDesign/src/app/types.ts` — FOUND
- `MandantenPortalDesign/src/app/components/status-badge.tsx` — FOUND
- `MandantenPortalDesign/src/app/components/flow-badge.tsx` — FOUND
- `MandantenPortalDesign/src/app/components/client-list.tsx` — FOUND
- `f01f463` (Task 1 commit) — FOUND
- `b300320` (Task 2 commit) — FOUND

---
*Phase: 21-client-list*
*Completed: 2026-02-18*
