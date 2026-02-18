# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v8 — Phase 21: Client List (in progress) — Plan 1 of 2 complete

## Current Position

Phase: 21 of 22 (Client List) — IN PROGRESS
Plan: 1 of 2 complete
Status: Phase 21 Plan 01 complete — ready for Plan 21-02 (client detail view)
Last activity: 2026-02-18 — Plan 21-01 complete (RTK Query clientsApi, StatusBadge/FlowBadge real data, ClientList self-fetching with 30s polling)

Progress: [████████████░░░░░░░░] 18/22 phases complete (v1-v7, v8 phase 19 in progress)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 30
- Average duration: ~2m
- Total execution time: ~0.93 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1 (1-2) | 4 | ~10m | 2.5m |
| v2 (3-6) | 7 | ~16m | 2.3m |
| v2.1 (7) | 1 | ~2m | 2.0m |
| v3 (8-9) | 5 | ~10m | 2.0m |
| v4 (10-12) | 4 | ~13m | 3.3m |
| v5 (13-15) | 4 | ~11m | 2.8m |
| v6 (16) | 1 | ~1m | 1.0m |
| v7 (17-18) | 2 | ~5m | 2.5m |
| v8 (19) | 3 | ~11m | 3.7m |

| v8 (20) P01 | 1 | ~3m | 3.0m |
| v8 (20) P02 | 1 | ~4m | 4.0m |
| v8 (21) P01 | 1 | ~5m | 5.0m |

**Recent Trend:**
- Stable at ~1-5m per plan

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**19-01 decisions:**
- Package renamed from @figma/my-make-file to rasolv-admin
- TypeScript strict=false for Figma-generated code compatibility
- Vite proxy /api/* -> localhost:3001 (VITE_API_BASE_URL empty in dev)
- tsconfig.node.json uses composite=true (required for project references)

**19-02 decisions:**
- English route paths (/clients, /dashboard, /settings) to match API endpoint naming; UI labels stay German
- Mandanten NavLink uses end=false so /clients/:id also highlights the Mandanten sidebar item
- ClientListPage and ClientDetailPage wrappers kept inline in App.tsx (thin adapters, not separate files)
- React Router v7 imports from react-router (not react-router-dom)

**19-03 decisions:**
- RTK Query baseApi with empty endpoints — Phase 21 will inject feature endpoints via injectEndpoints
- admin_token (not auth_token/portal_session_token) — admin-only app with single token key
- Google Fonts CDN for DM Sans and JetBrains Mono — no font file management in repo
- Provider wraps BrowserRouter wraps App — correct hierarchy for Redux + routing

**20-01 decisions:**
- LoginPage route added outside sidebar layout so /login renders full-screen without nav
- Cooldown via useRef+setTimeout avoids timer leaks vs setInterval
- Token extraction handles both response.data.token and response.data.admin_token shapes
- sonner Toaster uses theme=light directly — admin-only app, no dark mode needed

**20-02 decisions:**
- baseQueryWithReauth reads loginTimestamp from localStorage (not Redux) to avoid circular import between store/index.ts and baseApi.ts
- ProtectedRoute uses useEffect to dispatch logout() and show toast on session expiry — side effects outside render path
- Logout button above User Profile section, styled as muted nav item — unobtrusive but findable per user decision

**21-01 decisions:**
- workflow_status typed as string (not WorkflowStatus union) in AdminClient — unknown runtime values render gray fallback badge without crashing
- Flow badges derived client-side from workflow_status via deriveFlowBadges — backend has no separate flow field
- Flow filter applied client-side after server-paginated data loads — backend does not support flow param
- Legacy Client interface kept in types.ts for Sidebar and ClientDetail until those migrate in Phase 22
- Initials avatar with deterministic color from id hash — backend provides no avatar URLs

### v8 Context

**Migration source:** MandantenPortalDesign/ (Vite + React 18.3 + Tailwind 4 + shadcn/ui)
**Migration target:** Admin-Frontend mit Backend-Anbindung

**Design-Views vorhanden:**
- Sidebar mit Navigation
- Client-Liste (Suche, Multi-Filter, Pagination, Flow-Badges)
- Client-Detail (Tabs: Übersicht, Profil, Dokumente, Gläubiger, Aktivität)
- Phase-Timeline, Status-Badges, Flow-Badges

**Backend-Endpoints (Admin API):**
- GET /api/admin/clients (paginated, searchable, filterable)
- GET /api/admin/clients/:clientId/workflow-status
- GET /api/admin/clients/:clientId/settlement-responses
- GET /api/admin/dashboard-stats
- POST /api/admin/immediate-review/:userId
- POST /api/admin/clients/:clientId/trigger-ai-dedup

**Auth-System:**
- POST /api/admin/login → admin_token in localStorage
- Bearer token auth via Authorization header

### Pending Todos

- Test PDF processing with real documents in live environment
- Verify Gemini 2.5 Pro handles multi-page PDFs correctly in practice

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 20-02-PLAN.md (ProtectedRoute, sidebar logout, baseQuery 401 interceptor)
Resume file: .planning/phases/21-client-list/21-02-PLAN.md
Next step: Execute plan 21-02 (Phase 21: Client List — client detail view)

---
*Last updated: 2026-02-18 (Plan 20-02 complete — ProtectedRoute + Abmelden logout + baseQueryWithReauth 401 interceptor)*
