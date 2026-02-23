# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v9 — Review Dashboard — Phase 25 Plan 01 complete

## Current Position

Phase: 25-queue-management (Plan 01 complete)
Milestone: v9 Review Dashboard (Phases 23-27)
Status: Phase 25 Plan 01 complete — Admin review queue backend (assign/unassign, batch ops, priority scoring, GET /api/admin/review/queue)
Last activity: 2026-02-23 — Phase 25 Plan 01 execution

Progress: [████████████████████░░░░░] 22/27 phases complete (v1-v8 shipped, v9 phases 23-24 done, 25 in progress)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 34
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
| v9 (24) P02 | 1 | ~4m | 4.0m |
| v9 (24) P03 | 1 | ~2m | 2.0m |
| v9 (25) P01 | 1 | ~6m | 6.0m |

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
- [Phase 23-review-foundation]: search param omitted from URL when empty string (falsy spread); server filters by name/aktenzeichen case-insensitive substring; applied after priority filter so total reflects combined filtered count

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

**v9 Plan 23-02 decisions:**
- getConfidenceColor(value) returns style object for red/yellow/green pill based on 50/80 thresholds
- highPriorityCount/avgDays computed client-side from current page (not separate API calls per CONTEXT.md discretion)
- flex-based table layout over CSS grid — simpler for 6-column proportional layout

**v9 Plan 24-02 decisions:**
- Parent-owned form state (ReviewWorkspacePage useState) so both ReviewCorrectionForm and ReviewActionBar share formValues without prop drilling
- useRef for original AI values captures prefill on creditor change, enables green border detection (user-edited) without additional Redux state
- Corrections diff on Korrigieren: only sends fields that differ from originalValues
- Skip reason panel is inline (renders above action bar) rather than a modal
- CreditorSelector expandable list auto-closes after selecting a creditor

**v9 Plan 24-03 decisions:**
- ReviewSummaryDialog calls useCompleteReviewMutation directly; parent handleComplete only handles navigation after success callback
- handleComplete does a raw fetch (not RTK Query) for fresh queue after completion to avoid stale cache
- Cleanup useEffect in ReviewWorkspacePage dispatches resetReviewState on unmount in addition to clientId-change reset
- Zusammenfassung header button provides early access to summary before completing all creditors

**v9 Plan 25-01 decisions:**
- calculatePriorityScore is a standalone pure function exported alongside factory (module.exports.calculatePriorityScore) enabling reuse without instantiating the controller
- Priority string derived from manual_priority_override first (admin override wins), then >3 days || <0.4 confidence = high thresholds matching agentReviewController
- batchConfirm saves per-client with client.save() (not updateMany) to respect Mongoose pre-save hooks

**Admin Review Queue endpoints (server/routes/admin-review.js → /api/admin/review/):**
- GET /queue — Priority-sorted queue with priority_score (number), review_assignment, pagination, priority/search filters
- POST /:clientId/assign — Assign client to agent (body: assigned_to)
- DELETE /:clientId/assign — Unassign client ($unset review_assignment)
- POST /batch/assign — Bulk assign (body: client_ids[], assigned_to)
- POST /batch/priority — Bulk set manual_priority_override (body: client_ids[], priority)
- POST /batch/confirm — Bulk confirm all needs_manual_review creditors

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
Stopped at: Completed 25-queue-management Plan 01 — Admin review queue backend (assign/unassign, batch ops, priority scoring)
Resume file: None
Next step: Execute Phase 25 Plan 02 (queue management frontend)

---
*Last updated: 2026-02-23 (Phase 25 Plan 01 complete — admin review queue backend)*
