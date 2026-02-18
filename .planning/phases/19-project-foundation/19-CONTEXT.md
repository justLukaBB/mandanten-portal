# Phase 19: Project Foundation - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the MandantenPortalDesign Figma prototype as a properly configured admin frontend (rasolv-admin) with routing, API layer, and design system wired up — ready for auth and data integration in subsequent phases.

</domain>

<decisions>
## Implementation Decisions

### Project setup approach
- Package name: `rasolv-admin`
- Sidebar should have navigation links at the top (Dashboard/Übersicht, Mandanten, Einstellungen) plus recent cases below

### Route structure & navigation
- Three navigation items in sidebar: Dashboard (Übersicht), Mandanten (Clients), Einstellungen (Settings)
- Dashboard, Mandanten list, and Mandanten detail are the main routes
- Settings route reserved even if not built in this phase

### Dependency management
- Keep all existing Figma-generated dependencies for now — do not strip unused packages
- Add new dependencies as needed (RTK Query, React Router, Redux)

### Claude's Discretion
- **Project location**: Whether to evolve MandantenPortalDesign in-place or copy to new folder — Claude decides based on project structure
- **Serving model**: Separate Vite dev server vs served by Node backend — Claude decides based on existing backend setup
- **Dev proxy config**: Port numbers and proxy configuration — Claude figures out from backend setup
- **URL scheme**: English vs German route paths — Claude decides based on API conventions
- **Error handling pattern**: Toast vs inline vs both — Claude picks best UX for admin tool
- **TypeScript strictness**: Strict vs relaxed — Claude picks right level for Figma-generated code
- **Loading states**: Skeleton screens vs spinners — Claude decides based on complexity tradeoff
- **API typing**: Strict TypeScript interfaces vs loose typing — Claude picks right balance
- **Token expiry UX**: Graceful redirect with message vs simple redirect — Claude decides
- **React/react-dom**: Move from peerDependencies to dependencies as appropriate
- **State management**: RTK Query + React Router as indicated in roadmap, or alternative if better suited

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User deferred most implementation details to Claude's judgment, indicating trust in standard admin tool patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-project-foundation*
*Context gathered: 2026-02-18*
