---
phase: 19-project-foundation
plan: 03
subsystem: api
tags: [redux, rtk-query, react-redux, fonts, design-system, tailwind]

# Dependency graph
requires:
  - phase: 19-01
    provides: RTK Query packages (@reduxjs/toolkit, react-redux) installed, Vite project configured
  - phase: 19-02
    provides: BrowserRouter already added to main.tsx
provides:
  - Redux store with RTK Query middleware mounted via Provider in main.tsx
  - RTK Query baseApi with VITE_API_BASE_URL and Bearer token auth from admin_token localStorage
  - Typed useAppDispatch and useAppSelector hooks
  - DM Sans and JetBrains Mono fonts loaded via Google Fonts CDN
  - Body default font set to DM Sans
affects: [20-authentication, 21-data-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RTK Query baseApi pattern: createApi with empty endpoints, inject endpoints per feature slice"
    - "Bearer token from admin_token localStorage attached via prepareHeaders"
    - "VITE_API_BASE_URL empty in dev (Vite proxy handles routing), set to prod URL in production"
    - "Google Fonts CDN for DM Sans and JetBrains Mono (no local font files)"

key-files:
  created:
    - MandantenPortalDesign/src/store/api/baseApi.ts
    - MandantenPortalDesign/src/store/index.ts
    - MandantenPortalDesign/src/store/hooks.ts
  modified:
    - MandantenPortalDesign/src/main.tsx
    - MandantenPortalDesign/src/styles/fonts.css

key-decisions:
  - "RTK Query baseApi with empty endpoints — Phase 21 will inject feature endpoints via injectEndpoints"
  - "admin_token (not auth_token/portal_session_token) — admin-only app with single token key"
  - "Google Fonts CDN for font loading — simplest approach, no font file management"
  - "Provider wraps BrowserRouter wraps App — correct hierarchy for Redux + routing"

patterns-established:
  - "Store pattern: baseApi.reducerPath as key, baseApi.middleware concatenated"
  - "Typed hooks: useDispatch.withTypes<AppDispatch>() and useSelector.withTypes<RootState>()"

requirements-completed: [SETUP-03, SETUP-04]

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 19 Plan 03: RTK Query API Layer and Design System Audit Summary

**RTK Query baseApi with environment-configurable VITE_API_BASE_URL and Bearer token auth, Redux store mounted, DM Sans and JetBrains Mono fonts loaded via Google Fonts CDN**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-18T21:24:41Z
- **Completed:** 2026-02-18T21:26:54Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Redux store configured with RTK Query middleware; Provider wraps BrowserRouter in main.tsx
- RTK Query baseApi reads VITE_API_BASE_URL env var (empty in dev, full URL in prod) and attaches Bearer token from admin_token localStorage
- DM Sans and JetBrains Mono fonts load via Google Fonts CDN; body default set to DM Sans
- Design system audit confirmed: no figma: imports, all shadcn/ui components use correct relative ./utils import, all --rasolv-* theme variables present, tailwind.css has source directive

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Redux store with RTK Query API layer** - `7808f8e` (feat)
2. **Task 2: Audit and fix design system (fonts, theme, components)** - `bc7c942` (feat)

## Files Created/Modified
- `MandantenPortalDesign/src/store/api/baseApi.ts` - RTK Query createApi with fetchBaseQuery, VITE_API_BASE_URL base, admin_token Bearer auth, tag types
- `MandantenPortalDesign/src/store/index.ts` - Redux configureStore with RTK Query middleware, RootState and AppDispatch types
- `MandantenPortalDesign/src/store/hooks.ts` - Typed useAppDispatch and useAppSelector hooks
- `MandantenPortalDesign/src/main.tsx` - Added Provider wrapping BrowserRouter (which was added by 19-02)
- `MandantenPortalDesign/src/styles/fonts.css` - Google Fonts import for DM Sans and JetBrains Mono, body font-family

## Decisions Made
- RTK Query baseApi uses empty `endpoints: () => ({})` — feature endpoints will be injected in Phase 21+ via `injectEndpoints`
- Token key is `admin_token` (not auth_token or portal_session_token) since this is an admin-only frontend
- Google Fonts CDN chosen over self-hosted fonts — no font file management overhead in the repo
- Provider hierarchy: Provider > BrowserRouter > App — correct for Redux to be available in all route components

## Deviations from Plan

None - plan executed exactly as written.

Notes:
- Plan 19-02 had already run and added BrowserRouter to main.tsx before this plan executed. The plan correctly anticipated this and instructed reading the current state first. Provider was wrapped around the existing BrowserRouter as specified.
- ImageWithFallback.tsx was clean with no figma: imports (already fixed in 19-01)
- All shadcn/ui components import from `./utils` (relative path) — no @/lib/utils issue found

## Issues Encountered
None — plan executed cleanly. TypeScript check passed with zero errors after all changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Redux store ready for Phase 20 (authentication): add auth slice, login endpoint, reauth wrapper
- RTK Query baseApi ready for Phase 21 (data layer): inject client, document, creditor endpoints
- Fonts and design system confirmed working: DM Sans for UI text, JetBrains Mono for case IDs/timestamps
- No blockers for Phase 20 or Phase 21

---
*Phase: 19-project-foundation*
*Completed: 2026-02-18*

## Self-Check: PASSED

All key files confirmed present:
- MandantenPortalDesign/src/store/api/baseApi.ts: FOUND
- MandantenPortalDesign/src/store/index.ts: FOUND
- MandantenPortalDesign/src/store/hooks.ts: FOUND
- MandantenPortalDesign/src/styles/fonts.css: FOUND
- .planning/phases/19-project-foundation/19-03-SUMMARY.md: FOUND

All task commits confirmed in nested repo git log:
- 7808f8e feat(19-03): create Redux store with RTK Query API layer
- bc7c942 feat(19-03): audit and fix design system fonts and components
