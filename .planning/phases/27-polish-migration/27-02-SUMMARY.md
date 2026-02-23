---
phase: 27-polish-migration
plan: 02
subsystem: ui
tags: [react, rtk-query, polling, animation, framer-motion, redirect, sidebar]

# Dependency graph
requires:
  - phase: 27-polish-migration/27-01
    provides: ReviewQueuePage with export capability, reviewApi with useGetAdminReviewQueueQuery
  - phase: 25-queue-management
    provides: ReviewQueuePage, AdminReviewQueueClient type, sidebar

provides:
  - 30s auto-polling on ReviewQueuePage with new-case highlight animation
  - Sidebar orange badge showing live pending review count
  - AgentRedirect page replacing all /agent/* routes in old portal

affects: [sidebar, review-queue-page, old-portal-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - pollingInterval option on RTK Query for auto-refresh
    - framer-motion animate array for highlight fade (backgroundColor transition)
    - useRef<Set<string>> to track previous IDs for new-item detection
    - window.location.href for cross-app navigation (separate Vite ports)

key-files:
  created:
    - src/pages/AgentRedirect.tsx
  modified:
    - MandantenPortalDesign/src/app/components/review-queue-page.tsx
    - MandantenPortalDesign/src/app/components/sidebar.tsx
    - src/App.tsx

key-decisions:
  - "pollingInterval: 30000 added to useGetAdminReviewQueueQuery in both ReviewQueuePage and Sidebar — RTK Query deduplicates concurrent queries with same args"
  - "Sidebar badge uses separate limit=1 query to minimise payload — only total field needed"
  - "New-case detection via useRef<Set<string>> prevClientIdsRef — no Redux state, no extra API calls"
  - "Highlight animation uses framer-motion animate array ['#FEF3C7','#FFFFFF'] with 2s ease-out transition — consistent with existing motion.div rows"
  - "AgentRedirect checks auth internally (not via ProtectedRoute wrapper) — redirects unauthenticated users directly to /agent/login"
  - "ADMIN_PORTAL_URL constant defaults to http://localhost:5173, configurable via VITE_ADMIN_PORTAL_URL env var"

patterns-established:
  - "pollingInterval on existing query hook — simplest RTK Query polling pattern, no extra state"
  - "prevClientIdsRef + highlightedIds pattern for detecting and animating newly arrived items"

requirements-completed: [POLISH-02, POLISH-03]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 27 Plan 02: Polling, Sidebar Badge, and Agent Redirect Summary

**30s auto-refresh with new-case highlight animation, live sidebar badge, and clean deprecation of old agent portal routes via redirect notice page**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-23T18:51:07Z
- **Completed:** 2026-02-23T18:54:52Z
- **Tasks:** 3
- **Files modified:** 4 (3 in submodule, 1 in main repo + 1 created)

## Accomplishments

### Task 1: 30s Polling and New-Case Highlight (ReviewQueuePage)
- Added `pollingInterval: 30000` to `useGetAdminReviewQueueQuery` in ReviewQueuePage
- Added `isFetching` to the destructured query result
- Added `prevClientIdsRef: useRef<Set<string>>` to track previous client IDs
- Added `highlightedIds: useState<Set<string>>` to track new rows to highlight
- useEffect detects new IDs after each background refresh and sets highlightedIds, clears after 3s
- New rows animate with framer-motion `animate={{ backgroundColor: ['#FEF3C7', '#FFFFFF'] }}` over 2s
- Subtle orange animated bar shows at top of page during background fetches (isFetching && !isLoading)
- Added `position: relative` to outer container for the absolute-positioned indicator bar

### Task 2: Sidebar Pending Count Badge
- Imported `useGetAdminReviewQueueQuery` in sidebar.tsx
- Calls with `{ limit: 1 }` and `pollingInterval: 30000` — only needs total, not client list
- `pendingCount = reviewData?.total ?? 0`
- Orange pill badge (#F97316) rendered next to "Review" nav item label
- Badge only shown when `pendingCount > 0`
- Shows "99+" when count exceeds 99
- Badge pushed to right side with `marginLeft: 'auto'`

### Task 3: Agent Portal Redirect
- Created `src/pages/AgentRedirect.tsx` with:
  - Auth check via localStorage (auth_token + active_role === 'agent')
  - Unauthenticated users: immediate redirect to /agent/login
  - Authenticated users: notice card with 3s countdown, spinner, auto-redirect
  - Path mapping: /agent/review/* -> /review, /agent/dashboard -> /dashboard, else -> /
  - `ADMIN_PORTAL_URL` constant (defaults to http://localhost:5173, configurable via VITE_ADMIN_PORTAL_URL)
  - "Jetzt zum Admin-Portal" manual link in case auto-redirect fails
- Updated `src/App.tsx`: replaced /agent/* ProtectedRoute+AgentApp with bare AgentRedirect
- Removed unused AgentApp import

## Task Commits

Each task was committed atomically:

1. **Task 1: 30s polling and new-case highlight** - `a7a8f7c` (feat, submodule)
2. **Task 2: Sidebar pending count badge** - `ac58488` (feat, submodule)
3. **Task 3: Agent portal redirect** - `0b20be2` (feat, main repo)

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/review-queue-page.tsx` — pollingInterval, isFetching, prevClientIdsRef, highlightedIds, animate prop on rows, indicator bar
- `MandantenPortalDesign/src/app/components/sidebar.tsx` — useGetAdminReviewQueueQuery import, pendingCount hook, orange badge in navItems loop
- `src/pages/AgentRedirect.tsx` — new redirect notice page
- `src/App.tsx` — replaced /agent/* route, removed AgentApp import

## Decisions Made

- Used `pollingInterval: 30000` on both ReviewQueuePage and Sidebar — RTK Query cache deduplication means no double-fetching when both components are mounted
- Sidebar uses `{ limit: 1 }` to minimise payload — only `total` field from response is used
- Highlight detection skips first load (prev set is empty) to avoid highlighting all items on initial render
- `prevClientIdsRef` updated before setting highlightedIds to handle rapid polling cycles correctly
- `AgentRedirect` handles auth internally — simpler than ProtectedRoute since it needs custom redirect logic (to external URL)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `MandantenPortalDesign/src/app/components/review-queue-page.tsx` (contains pollingInterval: 30000)
- FOUND: `MandantenPortalDesign/src/app/components/sidebar.tsx` (contains pendingCount)
- FOUND: `src/pages/AgentRedirect.tsx` (contains Redirecting/Seite verschoben text)
- FOUND: `src/App.tsx` (contains AgentRedirect)
- FOUND: commit `a7a8f7c` (Task 1 - submodule)
- FOUND: commit `ac58488` (Task 2 - submodule)
- FOUND: commit `0b20be2` (Task 3 - main repo)

---
*Phase: 27-polish-migration*
*Completed: 2026-02-23*
