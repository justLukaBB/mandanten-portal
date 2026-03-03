# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v10 — 2. Anschreiben Automatisierung

## Current Position

Phase: 37 — Phase 30 Verification & Requirements Cleanup
Milestone: v10 2. Anschreiben Automatisierung
Status: Plan 01 complete
Last activity: 2026-03-03 — Phase 37 Plan 01 complete: 30-VERIFICATION.md created with FORM-03 6/6 truths verified; REQUIREMENTS.md FORM-03 checkbox flipped to [x] and traceability updated to Complete

Progress: [███████████████████████████░░░░░] 29/34 phases complete (v1-v9 shipped, v10 pending)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 37
- Average duration: ~2m
- Total execution time: ~1.10 hours

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
| v9 (25) P02 | 1 | ~4m | 4.0m |
| v9 (26) P01 | 1 | ~3m | 3.0m |
| v9 (26) P02 | 1 | ~4m | 4.0m |
| v9 (26) P03 | 1 | ~3m | 3.0m |
| v9 (27) P01 | 1 | ~4m | 4.0m |
| v9 (27) P02 | 1 | ~4m | 4.0m |
| v10 (28) P01 | 1 | ~2m | 2.0m |
| Phase 28 P02 | 2 | 2 tasks | 3 files |
| Phase 29-trigger-scheduler-client-notification P01 | 2 | 2 tasks | 2 files |
| Phase 29 P02 | 2m | 2 tasks | 4 files |
| Phase 30-client-portal-form P01 | 2 | 2 tasks | 3 files |
| Phase 30 P02 | 3m | 1 tasks | 2 files |
| Phase 31-financial-calculation-engine P01 | 5 | 1 tasks | 1 files |
| Phase 31 P02 | 3 | 2 tasks | 4 files |
| Phase 32-docx-generation P01 | 3 | 2 tasks | 1 files |
| Phase 33-email-dispatch-workflow-completion P01 | 122 | 2 tasks | 2 files |
| Phase 34-admin-ui-tracking P01 | 2 | 2 tasks | 4 files |
| Phase 34-admin-ui-tracking P02 | 2 | 1 tasks | 1 files |
| Phase 34-admin-ui-tracking P03 | 3 | 2 tasks | 4 files |
| Phase 35-bug-fixes-url-id-field-names P01 | 2 | 2 tasks | 3 files |
| Phase 36-wire-document-generator P01 | 5 | 2 tasks | 2 files |
| Phase 37-phase30-verification-cleanup P01 | 2m | 2 tasks | 2 files |
| Phase 37-phase30-verification-cleanup P01 | 2m | 2 tasks | 2 files |

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
- [Phase 26-enhanced-viewer-analytics]: pdfjs-dist v5 uses canvas (HTMLCanvasElement) in RenderParameters, not canvasContext; ArrayBuffer stored for PDF to enable re-render on zoom without refetch
- [Phase 26-enhanced-viewer-analytics]: ReviewSettings single-document upsert pattern; debounce via useRef; initialised ref prevents state overwrite after first load
- [Phase 27-polish-migration]: useLazyGetAdminReviewQueueQuery with limit=9999 fetches full queue on export — no filters applied
- [Phase 27-polish-migration]: Single Export dropdown button (DropdownMenu trigger) for both CSV and XLSX — simpler UI
- [Phase 27-polish-migration]: pollingInterval: 30000 on both ReviewQueuePage and Sidebar — RTK Query deduplication prevents double-fetching
- [Phase 27-polish-migration]: AgentRedirect handles auth internally (not ProtectedRoute) — needs custom cross-app redirect logic via window.location.href

**v10 Phase 28 Decisions:**
- UPPERCASE enum for second_letter_status (IDLE/PENDING/FORM_SUBMITTED/SENT) — differentiated from existing lowercase status fields
- UPPERCASE plan_type in snapshot (RATENPLAN/NULLPLAN) — not lowercase quotenplan/nullplan from financial_data
- new_creditors as simple array [{name, amount}] — multiple new creditors per client supported
- Uses id field (not _id) in service findOneAndUpdate filters — consistent with Client model convention
- Atomic state guard via findOneAndUpdate with status filter — null return = guard blocked, no error thrown

**v10 Key Decisions (established at roadmap creation):**
- State machine: 4 states IDLE/PENDING/FORM_SUBMITTED/SENT — no IN_REVIEW gate in v10 (deferred to v2+)
- Idempotency: atomic findOneAndUpdate with { second_letter_status: 'IDLE' } filter on all trigger entry points
- Snapshot-first: second_letter_financial_snapshot written at form submission; DOCX generation reads exclusively from snapshot (not live data)
- Token: dedicated second_letter_form_token (short-lived, 14 days) — NOT the onboarding portal_token
- Scheduler: setInterval in scheduler.js (no node-cron) — consistent with existing scheduler patterns
- Plan type: RATENPLAN when garnishable_amount > 0, NULLPLAN when == 0 — calculated from snapshot
- Document generator: SecondLetterDocumentGenerator mirrors firstRoundDocumentGenerator class structure (docxtemplater + pizzip)
- Email: reuse creditorEmailService.sendSecondRoundEmail() without modification (already implemented with demo mode, CC, matcher sync)
- Portal form: in /src/ (CRA) — NOT new Vite portal (separate milestone per PROJECT.md)
- Old second-round routes (second-round-api.js, secondRoundManager.js): deprecate with comment — not the pattern for new work
- [Phase 28]: Uses $or [$exists:false, null] to catch both missing and explicitly-null second_letter_status fields — per RESEARCH.md Pitfall 1
- [Phase 28]: Migration script uses single updateMany (not per-doc loop) — single DB round-trip, consistent with backfill-contact-status.js pattern
- [Phase 29]: SecondLetterTriggerService exported as CLASS (not singleton) for emailService dependency injection from server.js
- [Phase 29]: Two-step 30-day eligibility: DB elemMatch pre-filter + JS MAX(email_sent_at) — avoids complex aggregation pipeline
- [Phase 29]: Sequential for-loop in checkAndTriggerEligible (not Promise.all) for Resend rate limit safety
- [Phase 29]: EmailService is a singleton (module.exports = new EmailService()) — used directly via require in server.js, not re-instantiated
- [Phase 29]: alreadyTriggered admin endpoint returns 200 (not 409) — idempotent by design, matching research pitfall #5
- [Phase 30]: UUID token lookup: authenticateSecondLetterToken validates by DB lookup not JWT — matches Phase 29 which uses uuidv4()
- [Phase 30]: Bypass api.ts interceptor: use plain axios with explicit Authorization header for second-letter-form calls (interceptor would attach wrong stored session token)
- [Phase 30]: CSS max-height transition for conditional new creditors reveal: maxHeight 0px/600px with overflow-hidden, no JS height measurement
- [Phase 31-financial-calculation-engine]: Use calculator.calculate() not calculateGarnishableAmount() — the latter does not exist (latent bug in adminFinancialController)
- [Phase 31-financial-calculation-engine]: NULLPLAN creditors get tilgungsangebot = 0 explicitly — uniform data structure for Phase 32 template
- [Phase 31]: Recalculate endpoint placed in admin-second-letter.js — semantically correct, Client passed via DI
- [Phase 31]: Fixed snapshot field name mismatch in secondLetterCalculationService: marital_status/number_of_dependents fallback to familienstand/anzahl_unterhaltsberechtigte
- [Phase 32-docx-generation]: formatEuro uses toLocaleString('de-DE') not toFixed — avoids rounding bugs, produces correct German thousand separator + comma decimal format
- [Phase 32-docx-generation]: SecondLetterDocumentGenerator DB persistence happens post-loop not inside generateForSingleCreditor — file write confirmed before MongoDB update (Pitfall 5)
- [Phase 33-email-dispatch-workflow-completion]: SecondLetterService class replaces Phase 28 stub; route endpoint added to existing admin-second-letter.js factory; creditorEmailService required locally not injected; 409/422/207/200 HTTP response codes for status/eligibility/partial/full outcomes
- [Phase 34-admin-ui-tracking]: [Phase 34-01]: overrideSecondLetterPlanType invalidates only Client tag (not WorkflowStatus) — plan_type is snapshot data; SENT guard returns 400 for plan-type override; second_letter_status typed as string on AdminClient for runtime safety
- [Phase 34-admin-ui-tracking]: [Phase 34-02]: IIFE pattern for SecondLetterSection keeps local derived state scoped in renderOverview(); SendSecondLetterResponse.failed > 0 used for partial failure detection (not a boolean partial field)
- [Phase 34-admin-ui-tracking]: [Phase 34-03]: SecondLetterNode dashed border for not-sent — mirrors ResponseNode waiting pattern; x-clamp minX = -(3 * COL_WIDTH * v.zoom) for 3-column reach; secondLetterStatus renders plain dash for IDLE (no badge when no workflow started)
- [Phase 35-bug-fixes-url-id-field-names]: [Phase 35-01]: creditorSchema { _id: false } — use creditor.id throughout (never creditor._id); final_creditor_list.id filter key for positional updates; ?? for number_of_dependents fallback; SEND-02 already correct in secondLetterService.js
- [Phase 36-wire-document-generator]: [Phase 36-01]: Route handler loads client and applies all guards (status + snapshot) before calling generator — fail-fast before expensive file I/O; dispatchSecondLetterEmails() re-loads client internally so persisted filenames are picked up automatically; both route and service retain FORM_SUBMITTED guards (defense in depth); GENERATED_DOCS_DIR includes clientId from client._id.toString() — matches SecondLetterDocumentGenerator output path second_round/{clientId}/
- [Phase 37-phase30-verification-cleanup]: FORM-03 verification uses status: passed — backend snapshot write fully verifiable by static code inspection, no runtime test needed
- [Phase 37-phase30-verification-cleanup]: Traceability row uses Phase 30 (verified Phase 37) to accurately record implementation history — code written Phase 30, documentation formalized Phase 37

### v9 Context

**Review Dashboard rebuild from old Agent Portal into admin portal.**

**Existing agent-review endpoints (server/routes/agent-review.js):**
- GET /api/agent-review/available-clients — Queue with pagination, priority sort
- GET /api/agent-review/:clientId — Full review data (client, docs, creditors, diffs)
- POST /api/agent-review/:clientId/correct — Save corrections (confirm/correct/skip)
- POST /api/agent-review/:clientId/complete — Complete review, send email
- GET /api/agent-review/:clientId/document/:fileIdOrName — Stream document

**Auth change needed:** Complete (done in Plan 01)

**Admin Review Queue endpoints (server/routes/admin-review.js → /api/admin/review/):**
- GET /settings — Returns confidence_threshold and auto_assignment_enabled (defaults if no doc)
- PUT /settings — Persists settings via upsert, validates inputs
- GET /analytics — KPI and chart analytics with dateRange param (7/30/90/all)
- GET /queue — Priority-sorted queue with priority_score (number), review_assignment, pagination, priority/search filters
- POST /:clientId/assign — Assign client to agent (body: assigned_to)
- DELETE /:clientId/assign — Unassign client ($unset review_assignment)
- POST /batch/assign — Bulk assign (body: client_ids[], assigned_to)
- POST /batch/priority — Bulk set manual_priority_override (body: client_ids[], priority)
- POST /batch/confirm — Bulk confirm all needs_manual_review creditors

**Available UI components:** ResizablePanelGroup, Table, Form, Dialog, Skeleton, Badge, Pagination, Progress, Slider, Tabs, Calendar, Tooltip, DropdownMenu

**Animation patterns:** pageVariants, staggerContainer, kpiStaggerContainer, kpiCardVariants, fadeInVariants, slideUpVariants, tabContentVariants, useCountUp

**Design guidelines:** BG #FAFAFA, white cards with 1px #E5E7EB border + 12px radius, no shadows, pill badges (outlined+tinted), max 1 orange CTA per section, DM Sans + JetBrains Mono

### v10 Context

**2. Anschreiben Automatisierung — End-to-End second creditor letter workflow.**

**Existing services to reuse (confirmed by research):**
- `server/services/firstRoundDocumentGenerator.js` — Mirror class structure for SecondLetterDocumentGenerator
- `server/services/creditorEmailService.js` — sendSecondRoundEmail() already implemented, reuse without modification
- `server/services/germanGarnishmentCalculator.js` — §850c ZPO, use for Phase 31 calculation
- `server/services/creditorContactService.js` — Orchestrator pattern to follow for secondLetterService.js
- `server/scheduler.js` — Add 30-day scheduler check using existing setInterval pattern

**Files NOT to use as pattern:**
- `server/services/secondRoundManager.js` — Zendesk-centric, architecturally incompatible
- `server/routes/second-round-api.js` — Deprecated; add comment, do not extend

**Client model fields to add (Phase 28):**
- `second_letter_status`: enum ['IDLE','PENDING','FORM_SUBMITTED','SENT'], default 'IDLE'
- `second_letter_financial_snapshot`: subdocument with financial fields
- `second_letter_triggered_at`: Date
- `second_letter_form_submitted_at`: Date
- `second_letter_sent_at`: Date
- Per-creditor: `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename`

**State machine transitions:**
- IDLE → PENDING: scheduler or admin trigger (atomic findOneAndUpdate)
- PENDING → FORM_SUBMITTED: client form submit (snapshot written)
- FORM_SUBMITTED → SENT: admin triggers send (all creditor emails dispatched)

**Portal form (Phase 30):** In /src/ (CRA) — uses axios, Redux/RTK Query, FinancialDataForm patterns. Token: second_letter_form_token (new dedicated field on Client model, 14-day expiry).

**DOCX templates (Phase 32):** User supplies two template files (Ratenplan + Nullplan). Extract {VariableName} placeholders programmatically before writing generator. Enable errorLogging: true in dev.

**Critical pitfalls:**
- Double-send prevention: atomic findOneAndUpdate with status guard MUST be first operation in any trigger path
- Schema must exist before any service code (Phase 28 is strict prerequisite)
- NaN/Infinity guard in quota calculation: check totalDebt === 0, filter null claim_amounts, use Math.round() not toFixed()
- Snapshot-only generation: DOCX reads from second_letter_snapshot, never live financial_data

### Pending Todos

- Test PDF processing with real documents in live environment
- Verify Gemini 2.5 Pro handles multi-page PDFs correctly in practice
- Receive DOCX template files from user before Phase 32 can begin (hard blocker)
- Confirm second_letter_form_token design against existing authenticateClient middleware before Phase 30

### Blockers/Concerns

**Phase 32 blocker:** DOCX template files (Ratenplan + Nullplan) must be received from user before generator code can be written. Template variable names define the entire data contract. Do not start Phase 32 without templates in hand.

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 37-01-PLAN.md — Phase 30 VERIFICATION.md created, FORM-03 checkbox and traceability updated to Complete
Resume file: None
Next step: Phase 37 complete — FORM-03 documentation gap closed. v10 audit cleanup done. Ready for integration testing with real DOCX templates and a client in FORM_SUBMITTED state.

---
*Last updated: 2026-03-03 (Phase 37 Plan 01 complete)*
