---
phase: 20-authentication
plan: 01
subsystem: auth
tags: [redux-toolkit, rtk-query, localStorage, react-router, sonner, shadcn-ui]

# Dependency graph
requires:
  - phase: 19-project-foundation
    provides: RTK Query baseApi, Redux store, React Router setup, shadcn/ui components

provides:
  - authSlice with token/loginTimestamp state and localStorage persistence
  - isSessionValid helper and SESSION_DURATION_MS constant for 8-hour session tracking
  - login/logout Redux actions that sync to localStorage
  - useLoginMutation hook calling POST /api/admin/login
  - LoginPage component with German error messages, 3-attempt cooldown, spinner
  - Toaster (sonner) fixed to remove next-themes dependency

affects: [20-02, plan-21-client-list, all-authenticated-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RTK Query injectEndpoints pattern for feature-level API injection
    - localStorage initialization pattern for Redux state hydration on app load
    - Cooldown via useRef+useEffect+setTimeout (avoids interval leaks)

key-files:
  created:
    - MandantenPortalDesign/src/store/slices/authSlice.ts
    - MandantenPortalDesign/src/store/api/authApi.ts
    - MandantenPortalDesign/src/app/pages/LoginPage.tsx
  modified:
    - MandantenPortalDesign/src/store/index.ts
    - MandantenPortalDesign/src/app/components/ui/sonner.tsx
    - MandantenPortalDesign/src/main.tsx
    - MandantenPortalDesign/src/app/App.tsx

key-decisions:
  - "LoginPage route added outside sidebar layout so /login renders full-screen without nav"
  - "Cooldown implemented with useRef+setTimeout (not setInterval) to avoid repeated re-renders and timer leaks"
  - "Response token extraction handles both response.data.token and response.data.admin_token shapes"
  - "sonner Toaster uses theme=light directly — admin-only app, no dark mode needed"

patterns-established:
  - "RTK Query injectEndpoints: each feature API file injects into baseApi (see authApi.ts)"
  - "authSlice localStorage hydration: read localStorage at slice initialization, write on login/logout actions"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 20 Plan 01: Authentication - Login Page and Auth Slice Summary

**Redux auth slice with localStorage token persistence, RTK Query login mutation, and German login page with inline error messages and 3-attempt cooldown**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T21:37:38Z
- **Completed:** 2026-02-18T21:41:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Auth Redux slice with token/loginTimestamp state, localStorage hydration on init, 8-hour session expiry validation
- RTK Query login mutation injected on baseApi calling POST /api/admin/login with useLoginMutation export
- LoginPage with centered card, German labels (E-Mail, Passwort, Anmelden), specific error messages (Passwort falsch / E-Mail nicht gefunden / Server nicht erreichbar), 3-attempt cooldown for 5 seconds, loading spinner, and Passwort vergessen? toast
- Toaster (sonner) fixed to remove broken next-themes dependency — uses light theme directly

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth Redux slice and RTK Query login mutation** - `3d0b5a2` (feat)
2. **Task 2: Build login page and fix Toaster component** - `55d9166` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `MandantenPortalDesign/src/store/slices/authSlice.ts` - Auth state: token, loginTimestamp, isAuthenticated; login/logout actions with localStorage sync; SESSION_DURATION_MS and isSessionValid exports
- `MandantenPortalDesign/src/store/api/authApi.ts` - RTK Query login mutation injected on baseApi; exports useLoginMutation
- `MandantenPortalDesign/src/store/index.ts` - Added auth: authSlice.reducer to Redux store
- `MandantenPortalDesign/src/app/pages/LoginPage.tsx` - Full login form with German text, error handling, cooldown, spinner, toast
- `MandantenPortalDesign/src/app/components/ui/sonner.tsx` - Fixed: removed next-themes, uses theme="light"
- `MandantenPortalDesign/src/main.tsx` - Added global Toaster component
- `MandantenPortalDesign/src/app/App.tsx` - Added /login route outside sidebar layout

## Decisions Made

- LoginPage route added outside the sidebar layout so `/login` renders full-screen (no nav bar). Inner routes retain the sidebar wrapper.
- Cooldown implemented with `useRef` + `setTimeout` rather than `setInterval` to prevent timer leaks and avoid unnecessary re-renders on each tick.
- Token extraction handles both `response.data.token` and `response.data.admin_token` shapes to be resilient to backend response variations.
- `sonner` Toaster uses `theme="light"` directly — admin-only app, no dark mode requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added /login route to App.tsx router**

- **Found during:** Task 2 (Build LoginPage)
- **Issue:** LoginPage was created but no /login route existed in App.tsx, making the page unreachable
- **Fix:** Added `<Route path="/login" element={<LoginPage />} />` outside the sidebar layout in App.tsx
- **Files modified:** `MandantenPortalDesign/src/app/App.tsx`
- **Verification:** Route is present, LoginPage is importable, TypeScript passes
- **Committed in:** `55d9166` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical route)
**Impact on plan:** Essential — without the route, the login page would be unreachable. No scope creep.

## Issues Encountered

- `MandantenPortalDesign/` is a nested git repository, not tracked by the outer repo. All commits were made to the inner repo at `MandantenPortalDesign/.git`.

## User Setup Required

None - no external service configuration required. Backend must be running at `localhost:3001` for login API calls to succeed (configured via Vite proxy from Phase 19).

## Next Phase Readiness

- Auth foundation complete: token storage, login mutation, session validity helpers all ready
- Plan 20-02 can import `isSessionValid`, `SESSION_DURATION_MS`, `selectIsAuthenticated`, `logout` from authSlice for route protection and session expiry
- `/clients` redirect on login is wired and ready
- Toaster is globally mounted — Plan 20-02 can use `toast()` for session expiry notifications

---
*Phase: 20-authentication*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: MandantenPortalDesign/src/store/slices/authSlice.ts
- FOUND: MandantenPortalDesign/src/store/api/authApi.ts
- FOUND: MandantenPortalDesign/src/app/pages/LoginPage.tsx
- FOUND: MandantenPortalDesign/src/app/components/ui/sonner.tsx
- FOUND: commit 3d0b5a2 (feat(20-01): create auth Redux slice and RTK Query login mutation)
- FOUND: commit 55d9166 (feat(20-01): build LoginPage with error handling, cooldown, and fix Toaster)
