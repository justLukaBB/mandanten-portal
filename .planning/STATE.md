# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v9 — Review Dashboard — Phase 24 Plan 01 complete

## Current Position

Phase: 24-core-review-flow (Plan 01 complete, Plan 02 next)
Milestone: v9 Review Dashboard (Phases 23-27)
Status: Phase 24 Plan 01 complete — review data layer, RTK Query endpoints, reviewUiSlice, ReviewWorkspacePage with ResizablePanelGroup 60/40, EnhancedDocumentViewer
Last activity: 2026-02-23 — Phase 24 Plan 01 execution

Progress: [████████████████████░░░░░] 22/27 phases complete (v1-v8 shipped, v9 phase 23 in progress)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 33
- Average duration: ~2m
- Total execution time: ~0.96 hours

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
| v8 (21) P02 | 1 | ~3m | 3.0m |
| v8 (22) P01 | 1 | ~5m | 5.0m |
| v8 (22) P02 | 1 | ~6m | 6.0m |
| v8 (22) P03 | 1 | ~5m | 5.0m |
| v8 (22) P04 | 1 | ~2m | 2.0m |
| v9 (23) P01 | 1 | ~8m | 8.0m |
| v9 (23) P02 | 1 | ~4m | 4.0m |
| v9 (24) P01 | 1 | ~4m | 4.0m |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**v8 Key Decisions (carried forward):**
- Package: rasolv-admin (Vite + React 18.3 + Tailwind 4 + shadcn/ui)
- TypeScript strict=false for Figma-generated code compatibility
- Vite proxy /api/* -> localhost:3001 (VITE_API_BASE_URL empty in dev)
- English route paths (/clients, /dashboard) to match API; UI labels stay German
- RTK Query baseApi with injectEndpoints pattern per feature slice
- admin_token in localStorage, Bearer auth via Authorization header
- baseQueryWithReauth reads loginTimestamp from localStorage (not Redux)
- useSearchParams for URL-based filter state (single source of truth)
- workflow_status typed as string — unknown values render gray fallback badge
- Flow badges derived client-side via deriveFlowBadges
- Confidence stored as 0-1 decimal — multiply by 100 for display
- Initials avatar with deterministic color from id hash
- React Router v7 imports from react-router (not react-router-dom)
- sonner Toaster with theme=light (no dark mode)

### v9 Context

**Review Dashboard rebuild from old Agent Portal into admin portal.**

**Existing agent-review endpoints (server/routes/agent-review.js):**
- GET /api/agent-review/available-clients — Queue with pagination, priority sort
- GET /api/agent-review/:clientId — Full review data (client, docs, creditors, diffs)
- POST /api/agent-review/:clientId/correct — Save corrections (confirm/correct/skip)
- POST /api/agent-review/:clientId/complete — Complete review, send email
- GET /api/agent-review/:clientId/document/:fileIdOrName — Stream document

**Auth change needed:** Complete (done in Plan 01)

**v9 Plan 24-01 decisions:**
- fetch+Blob URL for document viewer (Phase 26 upgrades to PDF.js)
- doc.id || doc.name || doc.filename priority for streaming endpoint identifier
- needing_review_with_docs list used if non-empty, else with_documents (handles summary-phase reviews)
- resetReviewState dispatched on clientId change to prevent stale index

**v9 Plan 02 decisions:**
- getConfidenceColor(value) returns style object for red/yellow/green pill based on 50/80 thresholds
- highPriorityCount/avgDays computed client-side from current page (not separate API calls per CONTEXT.md discretion)
- flex-based table layout over CSS grid — simpler for 6-column proportional layout

**Available UI components:** ResizablePanelGroup, Table, Form, Dialog, Skeleton, Badge, Pagination, Progress, Slider, Tabs, Calendar, Tooltip, DropdownMenu

**Animation patterns:** pageVariants, staggerContainer, kpiStaggerContainer, kpiCardVariants, fadeInVariants, slideUpVariants, tabContentVariants, useCountUp

**Design guidelines:** BG #FAFAFA, white cards with 1px #E5E7EB border + 12px radius, no shadows, pill badges (outlined+tinted), max 1 orange CTA per section, DM Sans + JetBrains Mono

### Pending Todos

- Test PDF processing with real documents in live environment
- Verify Gemini 2.5 Pro handles multi-page PDFs correctly in practice

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 24-core-review-flow Plan 01 — ReviewWorkspacePage data layer, layout, EnhancedDocumentViewer
Resume file: None
Next step: Execute Phase 24 Plan 02 (Correction Form)

---
*Last updated: 2026-02-23 (v9 milestone setup — Review Dashboard)*
