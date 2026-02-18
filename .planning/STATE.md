# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v8 — Phase 19: Project Foundation (COMPLETE) — next: Phase 20: Authentication

## Current Position

Phase: 19 of 22 (Project Foundation) — COMPLETE
Plan: 3 of 3 complete
Status: Phase 19 complete — ready for Phase 20
Last activity: 2026-02-18 — Plan 19-03 complete (RTK Query API layer + design system audit)

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
Stopped at: Completed 19-03-PLAN.md (RTK Query API layer + design system audit) — Phase 19 COMPLETE
Resume file: .planning/phases/20-authentication/20-01-PLAN.md
Next step: Execute plan 20-01 (Phase 20: Authentication)

---
*Last updated: 2026-02-18 (Plan 19-03 complete — Phase 19 complete)*
