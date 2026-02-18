---
phase: 19-project-foundation
plan: 02
subsystem: ui
tags: [react-router, navlink, browserrouter, react, typescript, vite]

# Dependency graph
requires:
  - phase: 19-01
    provides: Vite project scaffold with React 18, TypeScript, Tailwind 4, and existing mock ClientList/ClientDetail components
provides:
  - URL-based routing with BrowserRouter wrapping the app
  - Route structure: / -> /clients, /dashboard, /clients/:id, /settings
  - Sidebar with NavLink-based active highlighting tied to current URL
  - DashboardPage and SettingsPage placeholder components
affects:
  - 19-03
  - 20-backend-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React Router v7 imported from react-router (not react-router-dom)"
    - "NavLink with isActive callback for URL-based sidebar highlighting"
    - "Page wrapper components (ClientListPage, ClientDetailPage) in App.tsx handle route params and navigation"
    - "BrowserRouter in main.tsx wraps the entire app"

key-files:
  created:
    - MandantenPortalDesign/src/app/pages/DashboardPage.tsx
    - MandantenPortalDesign/src/app/pages/SettingsPage.tsx
  modified:
    - MandantenPortalDesign/src/main.tsx
    - MandantenPortalDesign/src/app/App.tsx
    - MandantenPortalDesign/src/app/components/sidebar.tsx

key-decisions:
  - "English route paths (/clients, /dashboard, /settings) with German UI labels to match API endpoint naming conventions"
  - "Mandanten NavLink uses end=false so /clients/:id also highlights the Mandanten nav item"
  - "ClientListPage and ClientDetailPage wrappers inline in App.tsx (not separate files) since they are thin adapter components"

patterns-established:
  - "Route wrapper pattern: thin page-level components in App.tsx that bridge router params to existing UI components"
  - "Sidebar nav items defined as static array; NavLink handles active state automatically via isActive"

requirements-completed:
  - SETUP-02

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 19 Plan 02: React Router Setup Summary

**React Router v7 wired up with URL-based routing and NavLink sidebar — / redirects to /clients, /clients/:id deep links work, Sidebar highlights active route**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T21:24:46Z
- **Completed:** 2026-02-18T21:27:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced useState-based view switching with React Router v7 Routes in App.tsx
- BrowserRouter wraps the app in main.tsx; browser back/forward buttons now work
- Sidebar refactored to use NavLink with isActive callbacks — active item highlighted based on current URL
- Nav items trimmed from 6 Figma placeholders to 3 correct items: Übersicht (/dashboard), Mandanten (/clients), Einstellungen (/settings)
- DashboardPage and SettingsPage placeholder components created

## Task Commits

Each task was committed atomically:

1. **Task 1: Set up React Router routes and refactor App.tsx** - `74cc687` (feat)
2. **Task 2: Refactor Sidebar with NavLink active highlighting and correct nav items** - `2781b8c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `MandantenPortalDesign/src/main.tsx` - Added BrowserRouter wrapping App
- `MandantenPortalDesign/src/app/App.tsx` - Routes with ClientListPage and ClientDetailPage wrappers; removed useState view switching
- `MandantenPortalDesign/src/app/components/sidebar.tsx` - NavLink for active highlighting, 3 nav items, useNavigate for recent cases
- `MandantenPortalDesign/src/app/pages/DashboardPage.tsx` - Placeholder with "Kommt in Phase 22" subtitle
- `MandantenPortalDesign/src/app/pages/SettingsPage.tsx` - Placeholder for future settings

## Decisions Made
- English route paths (/clients, /dashboard, /settings) match the backend API naming while UI labels remain German
- Mandanten NavLink uses `end=false` so navigating to /clients/:id keeps "Mandanten" highlighted in the sidebar
- ClientListPage and ClientDetailPage kept inline in App.tsx as thin adapter components rather than separate files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Routing foundation is complete; deep linking and browser navigation work
- Ready for Phase 19-03 (if any) or backend integration in Phase 20
- All existing UI components (ClientList, ClientDetail) are preserved and function correctly through router wrappers

---
*Phase: 19-project-foundation*
*Completed: 2026-02-18*
