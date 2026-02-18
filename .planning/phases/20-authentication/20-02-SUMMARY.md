---
phase: 20-authentication
plan: 02
subsystem: auth
tags: [react-router, redux-toolkit, rtk-query, sonner, lucide-react]

# Dependency graph
requires:
  - phase: 20-authentication
    plan: 01
    provides: authSlice with token/loginTimestamp/isAuthenticated, isSessionValid helper, logout action, sonner Toaster mounted globally

provides:
  - ProtectedRoute component wrapping content routes with auth and session validity checks
  - RootRedirect component for / that routes to /clients or /login based on auth state
  - App.tsx route structure with /login outside sidebar layout and all content routes protected
  - Sidebar logout button ("Abmelden") dispatching logout() and navigating to /login
  - baseQueryWithReauth wrapper checking session validity pre-request and auto-logging out on 401

affects: [21-client-list, 22-client-detail, all-authenticated-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ProtectedRoute pattern for wrapping React Router routes with auth guards
    - baseQueryWithReauth wrapping rawBaseQuery for pre-request session checks and 401 auto-logout

key-files:
  created:
    - MandantenPortalDesign/src/app/components/ProtectedRoute.tsx
  modified:
    - MandantenPortalDesign/src/app/App.tsx
    - MandantenPortalDesign/src/app/components/sidebar.tsx
    - MandantenPortalDesign/src/store/api/baseApi.ts

key-decisions:
  - "baseQueryWithReauth reads loginTimestamp from localStorage (not Redux) to avoid circular import between store/index.ts and baseApi.ts"
  - "ProtectedRoute uses useEffect for toast and dispatch on session expiry — avoid dispatching inside render by separating side effects"
  - "Logout button above User Profile section, styled as muted nav item — unobtrusive but findable per user decision"

patterns-established:
  - "Route protection pattern: wrap each Route element in <ProtectedRoute> — check auth + session on every navigation"
  - "401 auto-logout in baseQueryWithReauth — any API 401 triggers logout() dispatch automatically"

requirements-completed: [AUTH-03]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 20 Plan 02: Authentication - Route Protection and Logout Summary

**ProtectedRoute wrapper guarding all content routes with 8-hour session expiry toast, sidebar "Abmelden" logout button, and RTK Query 401 interceptor for automatic session invalidation**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-18T21:45:56Z
- **Completed:** 2026-02-18T21:50:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- ProtectedRoute component checking auth state and session validity on every navigation — shows "Sitzung abgelaufen" toast and redirects on expired sessions
- RootRedirect at / routes authenticated users to /clients and unauthenticated users to /login
- App.tsx restructured with /login outside the sidebar layout; all content routes (/dashboard, /clients, /clients/:id, /settings) wrapped in ProtectedRoute
- Sidebar "Abmelden" logout button using LogOut icon, dispatches logout() and navigates to /login immediately without confirmation
- baseQueryWithReauth wraps fetchBaseQuery to check session validity before each request and auto-dispatch logout() on 401 backend responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ProtectedRoute wrapper and wire routes in App.tsx** - `7399f25` (feat)
2. **Task 2: Add sidebar logout button and baseQuery 401 interceptor** - `7aae0cf` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/ProtectedRoute.tsx` - Route wrapper: reads isAuthenticated + loginTimestamp from Redux, redirects to /login if unauthenticated or session expired, shows "Sitzung abgelaufen" toast on expiry
- `MandantenPortalDesign/src/app/App.tsx` - Added ProtectedRoute import, RootRedirect component for /, /login route outside sidebar, all content routes wrapped in ProtectedRoute inside sidebar layout
- `MandantenPortalDesign/src/app/components/sidebar.tsx` - Added LogOut icon import, useAppDispatch, logout action, handleLogout function, "Abmelden" button above User Profile section
- `MandantenPortalDesign/src/store/api/baseApi.ts` - Replaced raw fetchBaseQuery with baseQueryWithReauth — pre-request session check and 401 auto-logout

## Decisions Made

- `baseQueryWithReauth` reads `loginTimestamp` from localStorage (not Redux state) to avoid a circular import: `store/index.ts` imports `baseApi`, so `baseApi` cannot import from `store/index.ts`. The authSlice is still the source of truth — localStorage and Redux are kept in sync by the login/logout reducers.
- ProtectedRoute uses `useEffect` to dispatch `logout()` and show the toast when session expires, keeping side effects out of the render path. The JSX branch handles the redirect immediately.
- Logout button placed above the User Profile footer, styled with `var(--rasolv-text-muted)` — matches "unobtrusive but findable" per user decision.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Backend must be running at `localhost:3001` for API requests. Token is stored in localStorage as `admin_token`.

## Next Phase Readiness

- Full auth cycle complete: login → protected routes → session expiry → logout
- Plan 21-02 (client detail) can proceed — all routes are protected and the auth flow is stable
- Any RTK Query endpoint will automatically include the Bearer token and handle 401 responses

---
*Phase: 20-authentication*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: MandantenPortalDesign/src/app/components/ProtectedRoute.tsx
- FOUND: MandantenPortalDesign/src/app/App.tsx
- FOUND: MandantenPortalDesign/src/app/components/sidebar.tsx
- FOUND: MandantenPortalDesign/src/store/api/baseApi.ts
- FOUND: .planning/phases/20-authentication/20-02-SUMMARY.md
- FOUND: commit 7399f25 (feat(20-02): create ProtectedRoute wrapper and wire routes in App.tsx)
- FOUND: commit 7aae0cf (feat(20-02): add sidebar logout button and baseQuery 401 interceptor)
