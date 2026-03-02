# Roadmap: Mandanten Portal - Creditor Processing

## Milestones

- ✅ **v1 Manual Review & Payment Status Flow Fix** - Phases 1-2 (shipped 2026-01-30)
- ✅ **v2 Robust Dedup** - Phases 3-6 (shipped 2026-02-01)
- ✅ **v2.1 Aktenzeichen Display Fix** - Phase 7 (shipped 2026-02-02)
- ✅ **v3 Multi-Page PDF Support** - Phases 8-9 (shipped 2026-02-09)
- ✅ **v4 Editable Creditor Table** - Phases 10-12 (shipped 2026-02-17)
- ✅ **v5 1. Rate Bestätigung** - Phases 13-15 (shipped 2026-02-17)
- ✅ **v6 Async Creditor Confirm** - Phase 16 (shipped 2026-02-17)
- ✅ **v7 FastAPI Webhook Field Integration** - Phases 17-18 (shipped 2026-02-18)
- ✅ **v8 Admin Frontend Migration** - Phases 19-22 (shipped 2026-02-18)
- ✅ **v9 Review Dashboard** - Phases 23-27 (shipped 2026-03-02)
- 🚧 **v10 2. Anschreiben Automatisierung** - Phases 28-37 (in progress)

## Phases

<details>
<summary>✅ v1 Manual Review & Payment Status Flow Fix (Phases 1-2) - SHIPPED 2026-01-30</summary>

### Phase 1: Dedup Scheduler Refactor
**Goal**: Deduplication runs immediately after last document is processed instead of on a 30-minute timer
**Plans**: 2 plan

Plans:
- [x] 01-01: Event-driven dedup with atomic guards
- [x] 01-02: Preserve manual review flags during dedup

### Phase 2: Payment Handler Logic
**Goal**: Payment handler respects needs_manual_review flags and coordinates with dedup
**Plans**: 2 plans

Plans:
- [x] 02-01: Add dedup coordination to payment handler
- [x] 02-02: Check needs_manual_review flag in payment status logic

</details>

<details>
<summary>✅ v2 Robust Dedup (Phases 3-6) - SHIPPED 2026-02-01</summary>

#### Phase 3: LLM Prompt Optimization
**Goal**: Minimize LLM payload to avoid token limits
**Requirements**: LLM-01, LLM-02, LLM-03
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Minimal payload helpers + validation infrastructure
- [x] 03-02-PLAN.md -- Wire into live deduplicate_with_llm() method

#### Phase 4: Code-Based Merge Logic
**Goal**: Deterministic creditor merging in Python code after LLM identifies groups
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06, MERGE-07
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- TDD: Merge helper functions + unit tests
- [x] 04-02-PLAN.md -- Wire merge_creditor_group() into deduplicate_with_llm()

#### Phase 5: Failure Handling & Retry
**Goal**: Dedup failures retry once and flag cases for manual review instead of silently passing through duplicates
**Requirements**: FAIL-01, FAIL-02, FAIL-03
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md -- Retry infrastructure: schema field + retryWithDelay helper + timeout reduction
- [x] 05-02-PLAN.md -- Wire retry into dedup flow + manual review flagging on failure

#### Phase 6: Path Consistency & Integration
**Goal**: Auto pipeline and admin manual trigger use identical robust dedup logic
**Requirements**: PATH-01, PATH-02
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md -- Unify admin controller to call shared runAIRededup service + HTTP 409 guard

</details>

<details>
<summary>✅ v2.1 Aktenzeichen Display Fix (Phase 7) - SHIPPED 2026-02-02</summary>

#### Phase 7: Aktenzeichen N/A Suppression
**Goal**: First Anschreiben Word template displays empty string instead of "N/A" for missing Aktenzeichen
**Depends on**: Phase 6 (v2 shipped)
**Requirements**: TMPL-01
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md -- Apply isUsableValue filter to Aktenzeichen fallback chain + edge case verification

</details>

<details>
<summary>✅ v3 Multi-Page PDF Support (Phases 8-9) - SHIPPED 2026-02-09</summary>

#### Phase 8: FastAPI PDF Support
**Goal**: FastAPI service accepts and processes PDF files with backward compatibility for existing image uploads
**Depends on**: Phase 7 (v2.1 shipped)
**Requirements**: PDF-01, ERR-01, COMPAT-01
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md -- PDF validation + document processor extension (pypdf, _load_image_as_part, rotation skip)
- [x] 08-02-PLAN.md -- MIME type pipeline wiring + end-to-end verification

**Success Criteria:**
1. User can upload PDF document and FastAPI processes it end-to-end without errors
2. User can upload single image (JPG/PNG) and processing works identically to pre-PDF implementation
3. User uploads corrupted or password-protected PDF and receives clear error message instead of service crash
4. FastAPI creates valid Gemini Part from PDF bytes using application/pdf MIME type

#### Phase 9: Multi-Page Extraction
**Goal**: Gemini extracts all creditors from multi-page PDFs with correct page assignments
**Depends on**: Phase 8
**Requirements**: PDF-02, PDF-03, COMPAT-02
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md -- PDF page assignment prompt extension + CreditorData model + page data parsing
- [x] 09-02-PLAN.md -- Pipeline wiring (page_count threading, zero-creditor error, COMPAT-02 verification)

**Success Criteria:**
1. User uploads sammel-scan PDF with 3+ creditor letters and all creditors are extracted separately
2. User uploads multi-page single creditor letter (2-3 pages) and it's recognized as one creditor, not multiple
3. Webhook results for PDF extraction use identical data structure (`creditor_index`, `creditor_count`, `source_document_id`) as image extraction
4. Each extracted creditor includes page assignment data showing which PDF pages contain that creditor's information

</details>

<details>
<summary>✅ v4 Editable Creditor Table (Phases 10-12) - SHIPPED 2026-02-17</summary>

#### Phase 10: Backend German Field Support
**Goal**: Backend PUT /clients/:clientId/creditors/:creditorId accepts all German field names used in the Gläubiger-Tabelle
**Depends on**: Phase 9 (v3 shipped)
**Requirements**: EDIT-04
**Success Criteria** (what must be TRUE):
  1. Admin sends PUT request with `glaeubiger_name` field and it is saved to the creditor document in MongoDB
  2. Admin sends PUT request with `forderungbetrag` field and the value persists correctly
  3. All 10 German fields (glaeubiger_name, glaeubiger_adresse, glaeubigervertreter_name, glaeubigervertreter_adresse, forderungbetrag, email_glaeubiger, email_glaeubiger_vertreter, dokumenttyp, needs_manual_review, review_reasons) are accepted and saved without error
  4. Existing requests using old field names continue to work without breaking changes
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md -- Extend updateCreditor controller to accept and persist German field names

#### Phase 11: Inline Cell Editing
**Goal**: Admin can click any cell in the Gläubiger-Tabelle, edit it inline, and changes save automatically on blur with visual feedback
**Depends on**: Phase 10
**Requirements**: EDIT-01, EDIT-02, EDIT-03
**Success Criteria** (what must be TRUE):
  1. Admin clicks a cell in the Gläubiger-Tabelle and the cell becomes an editable input field
  2. Admin edits a cell value and clicks away — the value is sent to the backend and saved without any page action
  3. After a successful save, the cell shows a brief success indicator (green checkmark or similar) before returning to display mode
  4. After a failed save, the cell shows an error state and retains the unsaved value so the admin can retry
  5. All 11 data columns of the table are editable via this mechanism (2 computed columns — Anzahl Dokumente, Quell-Dokumente — remain read-only)
**Plans**: 1 plan

Plans:
- [x] 11-01-PLAN.md -- Create EditableCell component + replace Gläubiger-Tabelle static cells with inline-edit cells wired to PUT endpoint

#### Phase 12: Row Management
**Goal**: Admin can add new creditor rows and delete existing rows, with the table reflecting changes immediately
**Depends on**: Phase 11
**Requirements**: ROW-01, ROW-02, ROW-03
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Hinzufügen" button and a new empty row appears in the table ready for editing
  2. Admin fills a new row and blurs the last field — a new creditor is created via POST /clients/:clientId/add-creditor and appears in the table without a page reload
  3. Admin clicks delete on a creditor row and a confirmation dialog appears before any data is removed
  4. Admin confirms deletion — the row is removed via DELETE /clients/:clientId/creditors/:creditorId and disappears from the table immediately
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md -- Hinzufuegen button + new row inline editing + POST add-creditor with German field support
- [x] 12-02-PLAN.md -- Delete row with inline confirm/cancel + DELETE endpoint integration

</details>

<details>
<summary>✅ v5 1. Rate Bestätigung (Phases 13-15) - SHIPPED 2026-02-17</summary>

#### Phase 13: Payment Handler — No Documents Case
**Goal**: When 1. Rate is confirmed and no documents exist, the system emails the client via Resend asking for documents instead of creating a pointless Zendesk review ticket
**Depends on**: Phase 9 (v3 shipped)
**Requirements**: PAY-01, PAY-02, PAY-03
**Success Criteria** (what must be TRUE):
  1. Admin confirms 1. Rate and client has no documents — client receives a Resend email asking to upload documents
  2. Admin confirms 1. Rate and client has no documents — no Zendesk review ticket is created
  3. Admin confirms 1. Rate and client already has documents — existing flow runs unchanged (Gläubigeranalyse, Zendesk ticket, conditional auto-approval email)
  4. The "no documents" email is sent exactly once per confirmation, not on every subsequent webhook call
**Plans**: 1 plan

Plans:
- [x] 13-01-PLAN.md — Add idempotency flag + document request email method + document-existence branch to payment handler

#### Phase 14: Auto-Continuation After Document Upload
**Goal**: After a client uploads documents and AI processing completes, the full payment flow runs automatically if 1. Rate was already confirmed — no manual re-triggering needed
**Depends on**: Phase 13
**Requirements**: CONT-01, CONT-02
**Success Criteria** (what must be TRUE):
  1. Client uploads documents after 1. Rate was confirmed — payment flow (dedup wait, Gläubigeranalyse, Zendesk ticket, email) runs automatically without admin action
  2. Auto-continuation produces identical outcome to a fresh Zendesk webhook trigger — same Zendesk ticket type, same email, same creditor analysis
  3. Auto-continuation only fires when first_payment_received is true at the time documents finish processing — it does not fire for clients who haven't paid
**Plans**: 1 plan

Plans:
- [x] 14-01-PLAN.md — Add dedup wait to handleProcessingComplete + conditionCheckService no_documents_email_sent recognition

#### Phase 15: Admin Trigger Button
**Goal**: Admin can trigger the full payment handler from the Client-Detail view at any time, with a warning when the client's 1. Rate is already marked received
**Depends on**: Phase 13
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Admin opens Client-Detail view and sees the "Payment Handler auslösen" button regardless of the client's payment status
  2. Admin clicks the button when first_payment_received is false — payment handler runs without a confirmation dialog
  3. Admin clicks the button when first_payment_received is true — a warning/confirmation dialog appears before running
  4. After confirming, the admin-triggered payment handler runs identical logic to the Zendesk webhook path (Gläubigeranalyse, Zendesk ticket, email, 7-Tage-Review)
  5. The existing markPaymentReceived endpoint is replaced or extended so the button runs full handler logic, not just the flag-set
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md — Inject zendeskWebhookController into admin dashboard + add trigger-payment-handler endpoint
- [x] 15-02-PLAN.md — Add Payment Handler button to UserDetailView with conditional warning dialog

</details>

<details>
<summary>✅ v6 Async Creditor Confirm (Phase 16) - SHIPPED 2026-02-17</summary>

#### Phase 16: Async Confirmation
**Goal**: Creditor confirmation saves immediately and responds in <2s — email sending runs asynchronously in the background after the response is sent
**Depends on**: Phase 15 (v5 shipped)
**Requirements**: CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. User confirms creditors in the portal and receives a success response within 2 seconds regardless of how many creditors exist
  2. User sees the "Bestätigt" success state in the portal immediately after confirming, without any loading delay for email sending
  3. Creditor contact emails are still sent after confirmation — they just arrive asynchronously without blocking the user response
  4. The confirmation is persisted in the database before the response is returned — no data loss if email sending fails
**Plans**: 1 plan

Plans:
- [x] 16-01-PLAN.md -- Make confirmCreditors save-then-respond with fire-and-forget email sending

</details>

<details>
<summary>✅ v7 FastAPI Webhook Field Integration (Phases 17-18) - SHIPPED 2026-02-18</summary>

#### Phase 17: Schema and Webhook Field Mapping
**Goal**: All 5 new FastAPI fields are stored in MongoDB — creditorSchema and documentSchema accept them, and the webhook controller maps them from FastAPI payloads into both collections
**Depends on**: Phase 16 (v6 shipped)
**Requirements**: SCHEMA-01, SCHEMA-02, HOOK-01, HOOK-02
**Success Criteria** (what must be TRUE):
  1. A FastAPI webhook payload containing aktenzeichen_glaeubigervertreter, address_source, llm_address_original, glaeubiger_adresse_ist_postfach, and glaeubiger_vertreter_adresse_ist_postfach results in all 5 fields persisted on the creditor document in MongoDB
  2. A webhook payload containing the 5 new fields results in them also being stored on the corresponding document's extracted_data.creditor_data subdocument in MongoDB
  3. A webhook payload omitting any of the 5 new fields does not cause a validation error — fields default to null/false as appropriate
  4. When enrichDedupedCreditorFromDb replaces a creditor's address from the local DB, the creditor's address_source field is set to "local_db"
**Plans**: 1 plan

Plans:
- [x] 17-01-PLAN.md — Schema fields + address_source enrichment logic

#### Phase 18: Merge Logic for New Fields
**Goal**: When mergeCreditorLists() deduplicates creditors, aktenzeichen_glaeubigervertreter and the two Postfach-Flags are merged correctly — no data is silently dropped
**Depends on**: Phase 17
**Requirements**: MERGE-01, MERGE-02
**Success Criteria** (what must be TRUE):
  1. When two creditors are merged and both have aktenzeichen_glaeubigervertreter values, the longer non-empty string is kept on the merged creditor
  2. When two creditors are merged and one has aktenzeichen_glaeubigervertreter set and the other has it empty/null, the non-empty value is kept
  3. When two creditors are merged and either has glaeubiger_adresse_ist_postfach = true, the merged creditor has glaeubiger_adresse_ist_postfach = true
  4. When two creditors are merged and either has glaeubiger_vertreter_adresse_ist_postfach = true, the merged creditor has glaeubiger_vertreter_adresse_ist_postfach = true
**Plans**: 1 plan

Plans:
- [x] 18-01-PLAN.md — Merge logic for aktenzeichen_glaeubigervertreter (longest-wins) + Postfach flags (OR-logic) + field propagation in deduplicateCreditorsFromDocuments

</details>

### ✅ v8 Admin Frontend Migration (Phases 19-22) — SHIPPED 2026-02-18

**Milestone Goal:** Das neue Design aus MandantenPortalDesign (Vite + shadcn/ui + Tailwind 4) als Admin-Frontend aufsetzen und die bestehenden Design-Views (Client-Liste + Client-Detail) an das Node.js Backend anbinden.

## v8 Phase Details

### Phase 19: Project Foundation
**Goal**: The MandantenPortalDesign prototype runs as a properly configured Vite project with routing, API layer, and design system wired up — ready for auth and data integration
**Depends on**: Phase 18 (v7 shipped)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` starts the Vite dev server and the app loads in the browser without errors
  2. Navigating to `/clients` and `/clients/:id` renders the correct view — the Sidebar highlights the active route
  3. RTK Query base URL can be switched between dev (localhost) and prod via a single environment variable
  4. All existing shadcn/ui components, DM Sans and JetBrains Mono fonts, and Tailwind 4 theme variables render correctly
**Plans**: 3 plans

Plans:
- [ ] 19-01-PLAN.md -- Vite config, TypeScript, environment variables, proxy setup, Figma import fix
- [ ] 19-02-PLAN.md -- React Router route structure + Sidebar NavLink active-link wiring
- [ ] 19-03-PLAN.md -- RTK Query API slice + Redux store + design system audit (fonts, theme, shadcn/ui)

### Phase 20: Authentication
**Goal**: Admins can log in with email and password, stay authenticated across page reloads, and are automatically redirected to the login page when not authenticated
**Depends on**: Phase 19
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Admin navigates to the app, enters email and password on the login page, and is redirected to the client list on success
  2. Admin reloads the page while logged in — the app does not redirect to login; the token persists in localStorage and is sent as a Bearer token on all API requests
  3. Admin navigates to a protected route (e.g., `/clients`) without a valid token — the app redirects to `/login`
  4. Admin clicks logout — the token is removed from localStorage and the admin is redirected to the login page
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md -- Login page (centered card, German text, error handling, cooldown) + auth slice + RTK Query login mutation + Toaster fix
- [ ] 20-02-PLAN.md -- ProtectedRoute wrapper + route wiring + sidebar logout button + baseQuery 401 interceptor + session expiry redirect

### Phase 21: Client List
**Goal**: Admins see a paginated list of real clients from the backend, with working search, status filter, flow filter, and correctly rendered status and flow badges
**Depends on**: Phase 20
**Requirements**: LIST-01, LIST-02, LIST-03, LIST-04, LIST-05
**Success Criteria** (what must be TRUE):
  1. Admin opens the client list and sees real client records loaded from GET /api/admin/clients — not mock data
  2. Admin types a name, Fall-ID, or email into the search field and the list updates to show only matching clients
  3. Admin selects a status filter (Active, Pending, In Review, Blocked, Closed) and only clients with that status are shown
  4. Admin selects a flow filter (e.g., "Portal zugesendet", "1. Anschreiben") and the list filters correctly
  5. Each client row shows the correct Status-Badge and Flow-Badge using the same visual design as the prototype
**Plans**: 2 plans

Plans:
- [ ] 21-01-PLAN.md — RTK Query clients endpoint, updated types/badges for 10 real workflow states, ClientList wired to real data with loading/polling
- [ ] 21-02-PLAN.md — URL-synced search/status/flow filters, filter chips, configurable page size, zero-results state

### Phase 22: Client Detail
**Goal**: Admins can open any client and see real data across all tabs — overview with workflow timeline, profile with Stammdaten, documents with AI confidence scores, creditors with all fields including v7 fields, and activity log
**Depends on**: Phase 21
**Requirements**: DETAIL-01, DETAIL-02, DETAIL-03, DETAIL-04, DETAIL-05
**Success Criteria** (what must be TRUE):
  1. Admin clicks a client row and sees the Übersicht tab with real workflow status and phase timeline loaded from GET /api/admin/clients/:clientId/workflow-status
  2. Admin opens the Profil tab and sees real Stammdaten (name, email, Fall-ID, address) for that client
  3. Admin opens the Dokumente tab and sees all uploaded documents with their AI confidence scores — not mock data
  4. Admin opens the Gläubiger tab and sees all creditors including the five v7 fields (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, glaeubiger_adresse_ist_postfach, glaeubiger_vertreter_adresse_ist_postfach)
  5. Admin opens the Aktivität tab and sees the workflow event history for that client in chronological order
**Plans**: 4 plans

Plans:
- [ ] 22-01-PLAN.md -- RTK Query client detail endpoints + types + wire Übersicht and Profil tabs to real data
- [ ] 22-02-PLAN.md -- Dokumente tab wired to real document data with confidence scores and review warnings
- [ ] 22-03-PLAN.md -- Gläubiger tab wired to real creditor data including all v7 fields (13 columns)
- [ ] 22-04-PLAN.md -- Aktivität tab wired to real status_history with German labels and actor identification

### ✅ v9 Review Dashboard (Phases 23-27) — SHIPPED 2026-03-02

**Milestone Goal:** Das alte Agent-Portal Review Dashboard wird komplett neu im Admin-Portal aufgebaut — Queue-Seite, Review-Workflow mit Split-Pane, Queue-Management, Analytics und Export.

## v9 Phase Details

### Phase 23: Review Foundation
**Goal**: Review Queue page with real data from existing agent-review endpoints, accessible via admin token
**Depends on**: Phase 22 (v8 shipped)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Sidebar shows "Review" nav item between "Mandanten" and "Gläubiger-DB", clicking navigates to /review
  2. All 5 agent-review endpoints accept admin tokens (authenticateAdminOrAgent middleware)
  3. Review Queue page loads and displays clients from GET /api/agent-review/available-clients with 3 KPI cards (Offen, Hohe Priorität, Ø Alter)
  4. Admin can filter queue by priority level and search by name or Aktenzeichen
  5. Clicking a queue row navigates to /review/:clientId

**Plans:** 3/3 plans complete

Plans:
- [x] 23-01-PLAN.md — Backend auth swap + review types + RTK Query reviewApi + sidebar nav + routing
- [x] 23-02-PLAN.md — ReviewQueuePage with KPI cards, filterable queue table, pagination
- [x] 23-03-PLAN.md — Gap closure: wire search end-to-end (reviewApi + review-queue-page + backend filter)

**Key changes:**
- Backend: `server/routes/agent-review.js` — `authenticateAgent` → `authenticateAdminOrAgent` on all routes
- Backend: `server/controllers/agentReviewController.js` — search filter on name/aktenzeichen
- Frontend: sidebar.tsx (Review nav item), App.tsx (review routes), review types, reviewApi RTK Query slice, ReviewQueuePage with 3 subcomponents

### Phase 24: Core Review Flow
**Goal**: Admin can review creditors one-by-one with document viewer and correction form, complete review
**Depends on**: Phase 23
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04
**Success Criteria** (what must be TRUE):
  1. ReviewWorkspacePage shows ResizablePanelGroup with document viewer on the left and correction form on the right
  2. Admin can navigate between creditors (prev/next) and form fields are pre-filled with AI-extracted data
  3. Admin can confirm a creditor (action: confirm), correct fields and save (action: correct), or skip with a reason (action: skip)
  4. After reviewing all creditors, a ReviewSummaryDialog shows all actions taken and admin can complete the review
  5. Completing a review calls POST /complete, shows success toast, and redirects to /review queue

**Plans:** 3/3 plans complete

Plans:
- [x] 24-01-PLAN.md — Review types, RTK Query endpoints, Redux reviewUi slice, ReviewWorkspacePage shell with ResizablePanelGroup + EnhancedDocumentViewer
- [x] 24-02-PLAN.md — CreditorSelector navigation, ReviewCorrectionForm (9 fields), ReviewActionBar with confirm/correct/skip actions
- [x] 24-03-PLAN.md — ReviewSummaryDialog with action breakdown, per-creditor revision, completion + auto-load next case

**Key changes:**
- Frontend: ReviewWorkspacePage, EnhancedDocumentViewer (fetch+Blob URL), CreditorSelector, ReviewCorrectionForm, ReviewActionBar, SkipReasonForm, ReviewSummaryDialog, reviewUiSlice
- Store: reviewUi reducer added to store/index.ts

### Phase 25: Queue Management
**Goal**: Admin can manage review queue with assignments, batch operations, and auto-priority
**Depends on**: Phase 24
**Requirements**: QUEUE-01, QUEUE-02, QUEUE-03
**Success Criteria** (what must be TRUE):
  1. Admin can assign a review case to an agent and unassign it
  2. Admin can select multiple queue items and perform batch operations (bulk confirm, bulk assign, bulk priority change)
  3. Priority score is automatically calculated based on days since payment, confidence, and creditor count
  4. BatchActionBar appears as sticky bottom bar when items are selected

**Plans:** 2/2 plans complete

Plans:
- [x] 25-01-PLAN.md — Backend: admin-review routes, controller (assign/unassign/batch endpoints), review_assignment schema field, auto-priority scoring
- [x] 25-02-PLAN.md — Frontend: reviewApi mutations, multi-select in ReviewQueueTable, BatchActionBar sticky bottom bar

**Key changes:**
- Backend: NEW `server/routes/admin-review.js` + `server/controllers/adminReviewController.js` — assign, unassign, batch endpoints
- Backend: `server/server.js` — register admin-review routes
- Backend: MongoDB review_assignment field on Client
- Frontend: BatchActionBar, multi-select in ReviewQueueTable, reviewApi extended with assignment/batch mutations

### Phase 26: Enhanced Viewer & Analytics
**Goal**: PDF.js document rendering and analytics dashboard with charts
**Depends on**: Phase 25
**Requirements**: VIEW-01, VIEW-02, VIEW-03
**Success Criteria** (what must be TRUE):
  1. Documents render via PDF.js canvas instead of iframe, with zoom and pan controls
  2. Analytics page at /review/analytics shows 4 KPI cards and 4 Recharts charts (Reviews/Day, Confidence Distribution, Outcomes Pie, Agent Performance Table)
  3. Settings page at /review/settings allows configuring confidence threshold and auto-assignment toggle
  4. Settings are persisted via PUT /api/admin/review/settings

**Plans:** 3/3 plans complete

Plans:
- [x] 26-01-PLAN.md — PDF.js document viewer rewrite with zoom/pan toolbar, image support, iframe fallback
- [x] 26-02-PLAN.md — Analytics backend endpoint + ReviewAnalyticsPage with 4 KPI cards and 4 Recharts charts
- [x] 26-03-PLAN.md — Settings backend endpoints + ReviewSettingsPage with confidence threshold and auto-assignment toggle

**Key changes:**
- Install: pdfjs-dist
- Backend: NEW analytics + settings endpoints in admin-review.js, ReviewSettings model
- Frontend: EnhancedDocumentViewer upgrade (PDF.js canvas), ReviewAnalyticsPage (4 charts), ReviewSettingsPage

### Phase 27: Polish & Migration
**Goal**: Export, real-time updates, and old portal deprecation
**Depends on**: Phase 26
**Requirements**: POLISH-01, POLISH-02, POLISH-03
**Success Criteria** (what must be TRUE):
  1. Admin can export the review queue as CSV or XLSX file
  2. Queue auto-refreshes every 30 seconds and sidebar shows badge when new cases arrive
  3. Navigating to /agent/review in the old portal redirects to /review in the admin portal

**Plans:** 2/2 plans complete

Plans:
- [x] 27-01-PLAN.md — CSV/XLSX export: install xlsx, create export utility, add export button with dropdown to ReviewQueuePage
- [x] 27-02-PLAN.md — Real-time polling (30s) with new-case highlight, sidebar pending count badge, old agent portal /agent/* redirect

**Key changes:**
- Install: xlsx library for client-side export
- Frontend: Export button + client-side CSV/XLSX generation, pollingInterval on getReviewQueue, sidebar badge
- Old portal: redirect /agent/* → admin portal with notice page

## v10 Phase Details

### Phase 28: State Machine Foundation
**Goal**: Client model has all second_letter_* schema fields and creditor tracking fields — the state machine exists and is idempotent against double-triggers before any service code runs
**Depends on**: Phase 27 (v9 shipped)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Success Criteria** (what must be TRUE):
  1. Client document in MongoDB has `second_letter_status` field with enum values IDLE/PENDING/FORM_SUBMITTED/SENT and default IDLE — existing clients are initialized to IDLE via migration
  2. Client document has `second_letter_financial_snapshot` subdocument with all required financial fields (income, marital status, dependents, income source, garnishment, new creditors, plan type, garnishable amount, monthly rate)
  3. Client document has three timestamp fields: `second_letter_triggered_at`, `second_letter_form_submitted_at`, `second_letter_sent_at`
  4. Creditor subdocuments have `second_letter_sent_at`, `second_letter_email_sent_at`, and `second_letter_document_filename` fields
**Plans**: 2 plans

Plans:
- [ ] 28-01-PLAN.md — Schema extension (clientSchema + creditorSchema second_letter fields) + secondLetterService.js atomic state guard
- [ ] 28-02-PLAN.md — Migration script (init-second-letter-status.js) + deprecation comments on old second-round files

### Phase 29: Trigger, Scheduler & Client Notification
**Goal**: Admin can manually trigger the 2. Anschreiben workflow and the scheduler auto-triggers after 30 days — both paths are idempotent and notify the client via Resend
**Depends on**: Phase 28
**Requirements**: TRIG-01, TRIG-02, TRIG-03, TRIG-04, NOTIF-01, NOTIF-02, NOTIF-03
**Success Criteria** (what must be TRUE):
  1. Scheduler runs daily and transitions eligible clients (MAX(email_sent_at) + 30 days passed AND second_letter_status == IDLE) to PENDING — clients already in PENDING or beyond are not touched
  2. Admin clicks "2. Anschreiben starten" and the client transitions to PENDING — clicking again when already PENDING produces no state change and no duplicate email (idempotency guard via atomic findOneAndUpdate)
  3. After transitioning to PENDING, the client receives a Resend email containing a direct link to the portal form — the link uses a dedicated short-lived token (not the onboarding portal_token)
  4. Every trigger action (scheduler or admin) writes an audit log entry with actor identity and timestamp
**Plans**: 2 plans

Plans:
- [ ] 29-01-PLAN.md — Core trigger service (secondLetterTriggerService.js) + email notification method on emailService.js
- [ ] 29-02-PLAN.md — Admin route/controller + scheduler integration + server.js wiring

### Phase 30: Client Portal Form
**Goal**: Client can open the portal form from the notification email, review pre-filled financial data, make corrections, and submit — creating an immutable snapshot and transitioning status to FORM_SUBMITTED
**Depends on**: Phase 29
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05
**Success Criteria** (what must be TRUE):
  1. Client follows the email deep-link and sees the form pre-filled with current data from financial_data and extended_financial_data — no blank fields for data that already exists
  2. Client can edit all required fields (net income, income source, marital status, dependents count, active garnishments boolean, new creditors boolean with conditional name/amount fields) and check the correctness confirmation checkbox before submitting
  3. On submit, the backend writes an immutable second_letter_financial_snapshot to MongoDB and updates financial_data with any corrections the client made
  4. After successful submit, second_letter_status transitions from PENDING to FORM_SUBMITTED — subsequent form loads show a "bereits eingereicht" state instead of the editable form
  5. The form is only accessible (not a 404/redirect) when second_letter_status is PENDING — clients with other statuses cannot re-submit
**Plans**: 2 plans

Plans:
- [ ] 30-01-PLAN.md — Backend: authenticateSecondLetterToken middleware + GET/POST second-letter-form endpoints with pre-fill mapping, validation, snapshot write, status transition
- [ ] 30-02-PLAN.md — Frontend: SecondLetterForm.tsx standalone page with pre-fill, 7 required fields, conditional new-creditor fields, confirmation dialog, success/submitted/unavailable states + App.tsx route

### Phase 31: Financial Calculation Engine
**Goal**: After form submission, the system calculates garnishable amount, determines plan type, and computes pro-rata quota and Tilgungsangebot per creditor — all from snapshot data only
**Depends on**: Phase 30
**Requirements**: CALC-01, CALC-02, CALC-03, CALC-04
**Success Criteria** (what must be TRUE):
  1. Garnishable amount is calculated using the existing §850c ZPO logic from germanGarnishmentCalculator.js applied to snapshot income and dependents data — not live financial_data
  2. Plan type is determined as RATENPLAN when garnishable amount is greater than zero, NULLPLAN when it equals zero — stored in snapshot
  3. Pro-rata quota for each creditor is calculated as (claim_amount / total_debt) * garnishable_amount with a zero-division guard when total_debt is zero or when claim_amount is null
  4. Tilgungsangebot (monthly settlement offer) per creditor is calculated and stored in the snapshot's creditor_calculations array — all values are finite numbers (no NaN, no Infinity)
**Plans**: 2 plans

Plans:
- [ ] 31-01-PLAN.md -- Pure calculation service: secondLetterCalculationService.js with garnishable amount, plan type, per-creditor quota and Tilgungsangebot
- [ ] 31-02-PLAN.md -- Wire calculation into form-submit handler + admin recalculate endpoint

### Phase 32: DOCX Generation
**Goal**: One DOCX letter per creditor is generated using the correct template (Ratenplan or Nullplan) based on plan type, with all template variables populated from snapshot data
**Depends on**: Phase 31
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. SecondLetterDocumentGenerator produces a valid DOCX file for each creditor using docxtemplater + pizzip — the same pattern as firstRoundDocumentGenerator.js
  2. When plan_type is RATENPLAN the Ratenplan template is used; when NULLPLAN the Nullplan template is used — no other template selection logic exists
  3. Each generated DOCX contains all required variables populated: creditor data (name, address, Aktenzeichen, claim amount, quota, Auszahlung), debtor data (name, birthdate, marital status, dependents, income), plan data (plan type, monthly rate, start date, deadline), and law firm Aktenzeichen
  4. Generated files are saved to the generated_documents/second_round/ directory with one file per creditor — the filename is stored on the creditor document
**Plans**: 1 plan

Plans:
- [ ] 32-01-PLAN.md — SecondLetterDocumentGenerator class (docxtemplater + pizzip, two-template branching, snapshot-only data, per-client output, DB filename persistence)

### Phase 33: Email Dispatch & Workflow Completion
**Goal**: Admin triggers the send — each creditor receives a Resend email with the DOCX attachment, per-creditor tracking is updated, and status transitions to SENT
**Depends on**: Phase 32
**Requirements**: SEND-01, SEND-02, SEND-03, SEND-04, SEND-05, SEND-06
**Success Criteria** (what must be TRUE):
  1. Each creditor in final_creditor_list receives a Resend email with the correct DOCX attached — the same pipeline as 1. Anschreiben (creditorEmailService.sendSecondRoundEmail), with a 2-second delay between sends
  2. After each successful send, the creditor's second_letter_sent_at, second_letter_email_sent_at, and second_letter_document_filename fields are updated in MongoDB
  3. Each successful send appends an audit comment to the client's Zendesk ticket
  4. When all creditor emails have been sent without error, second_letter_status transitions from FORM_SUBMITTED to SENT and second_letter_sent_at is recorded
  5. If sending fails, the system retries up to 3 times — after 3 failures an admin alert is triggered and status remains FORM_SUBMITTED (not SENT), preventing partial-send state from being marked complete
  6. Demo mode is respected — when the client has demo mode active, all emails are directed to the test address instead of real creditor email addresses
**Plans**: 1 plan

Plans:
- [ ] 33-01-PLAN.md — SecondLetterService dispatch orchestrator + admin send-second-letter endpoint

### Phase 34: Admin UI & Tracking
**Goal**: Admin has full visibility and control of the 2. Anschreiben workflow in the admin portal — trigger button, status badges on list and detail views, TrackingCanvas 3rd column, and plan type override
**Depends on**: Phase 33
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Client Detail view shows "2. Anschreiben starten" button when status is IDLE — button is disabled (not hidden) when status is PENDING, FORM_SUBMITTED, or SENT — clicking when IDLE shows a confirmation modal before triggering
  2. Client List and Client Detail both show a second_letter_status badge: countdown display when IDLE after 1. Anschreiben was sent, "Wartet auf Formular" when PENDING, "Formular eingereicht" when FORM_SUBMITTED, "Gesendet" when SENT
  3. TrackingCanvas has a third column showing per-creditor 2. Anschreiben status — indicating whether the letter has been sent and when
  4. Admin can override the plan type (Ratenplan/Nullplan) via a select control in Client Detail before triggering the send — the override persists in the snapshot
**Plans**: 3 plans

Plans:
- [x] 34-01-PLAN.md — Types + RTK Query mutations + backend plan-type endpoint + Client List projection
- [x] 34-02-PLAN.md — Client Detail 2. Anschreiben section (trigger button, status badge, plan override, send button)
- [ ] 34-03-PLAN.md — Client List badge column + TrackingCanvas 3rd column (SecondLetterNode)

### Phase 35: Bug Fixes — URL, _id, and Field Name Mismatches
**Goal**: Fix all data-level bugs identified by milestone audit — URL mismatch in email deep-link, _id vs id in MongoDB positional updates, and field name mismatch in template data preparation
**Requirements**: NOTIF-02, SEND-02, DOC-03, DOC-04
**Gap Closure**: Closes gaps from v10 audit
**Depends on**: Phase 34
**Plans**: 1 plan

Plans:
- [ ] 35-01-PLAN.md — Fix email deep-link URL, _id→id bugs in documentGenerator + calculationService, field name fallbacks in prepareTemplateData, verify SEND-02

### Phase 36: Wire Document Generator into Send Workflow
**Goal**: Connect SecondLetterDocumentGenerator (Phase 32) to the send-second-letter endpoint (Phase 33) so DOCX files are generated before email dispatch — completing the E2E admin-trigger→send flow
**Requirements**: DOC-01, DOC-02, SEND-01, SEND-03, SEND-04
**Gap Closure**: Closes gaps from v10 audit
**Depends on**: Phase 35

Plans:
- [ ] 36-01-PLAN.md — Import + call SecondLetterDocumentGenerator in send workflow before dispatchSecondLetterEmails, E2E verification

### Phase 37: Phase 30 Verification & Requirements Cleanup
**Goal**: Formally verify Phase 30 (FORM-03 snapshot write) and update REQUIREMENTS.md checkboxes to reflect actual completion state
**Requirements**: FORM-03
**Gap Closure**: Closes gaps from v10 audit
**Depends on**: Phase 36

Plans:
- [ ] 37-01-PLAN.md — Phase 30 VERIFICATION.md + REQUIREMENTS.md checkbox and traceability updates

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 27 (v1-v9 complete) → 28 → 29 → 30 → 31 → 32 → 33 → 34

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Dedup Scheduler Refactor | v1 | 2/2 | Complete | 2026-01-30 |
| 2. Payment Handler Logic | v1 | 2/2 | Complete | 2026-01-30 |
| 3. LLM Prompt Optimization | v2 | 2/2 | Complete | 2026-01-31 |
| 4. Code-Based Merge Logic | v2 | 2/2 | Complete | 2026-02-01 |
| 5. Failure Handling & Retry | v2 | 2/2 | Complete | 2026-02-01 |
| 6. Path Consistency & Integration | v2 | 1/1 | Complete | 2026-02-01 |
| 7. Aktenzeichen N/A Suppression | v2.1 | 1/1 | Complete | 2026-02-02 |
| 8. FastAPI PDF Support | v3 | 2/2 | Complete | 2026-02-09 |
| 9. Multi-Page Extraction | v3 | 2/2 | Complete | 2026-02-09 |
| 10. Backend German Field Support | v4 | 1/1 | Complete | 2026-02-17 |
| 11. Inline Cell Editing | v4 | 1/1 | Complete | 2026-02-17 |
| 12. Row Management | v4 | 2/2 | Complete | 2026-02-17 |
| 13. Payment Handler — No Documents Case | v5 | 1/1 | Complete | 2026-02-17 |
| 14. Auto-Continuation After Document Upload | v5 | 1/1 | Complete | 2026-02-17 |
| 15. Admin Trigger Button | v5 | 2/2 | Complete | 2026-02-17 |
| 16. Async Confirmation | v6 | 1/1 | Complete | 2026-02-17 |
| 17. Schema and Webhook Field Mapping | v7 | 1/1 | Complete | 2026-02-18 |
| 18. Merge Logic for New Fields | v7 | 1/1 | Complete | 2026-02-18 |
| 19. Project Foundation | v8 | 3/3 | Complete | 2026-02-18 |
| 20. Authentication | v8 | 2/2 | Complete | 2026-02-18 |
| 21. Client List | v8 | 2/2 | Complete | 2026-02-18 |
| 22. Client Detail | v8 | 4/4 | Complete | 2026-02-18 |
| 23. Review Foundation | v9 | 3/3 | Complete | 2026-03-02 |
| 24. Core Review Flow | v9 | 3/3 | Complete | 2026-03-02 |
| 25. Queue Management | v9 | 2/2 | Complete | 2026-03-02 |
| 26. Enhanced Viewer & Analytics | v9 | 3/3 | Complete | 2026-03-02 |
| 27. Polish & Migration | v9 | 2/2 | Complete | 2026-03-02 |
| 28. State Machine Foundation | 2/2 | Complete    | 2026-03-02 | - |
| 29. Trigger, Scheduler & Client Notification | 2/2 | Complete    | 2026-03-02 | - |
| 30. Client Portal Form | 2/2 | Complete   | 2026-03-02 | - |
| 31. Financial Calculation Engine | 2/2 | Complete    | 2026-03-02 | - |
| 32. DOCX Generation | 1/1 | Complete    | 2026-03-02 | - |
| 33. Email Dispatch & Workflow Completion | 1/1 | Complete    | 2026-03-02 | - |
| 34. Admin UI & Tracking | v10 | Complete    | 2026-03-02 | - |
| 35. Bug Fixes — URL, _id, Field Names | v10 | Complete    | 2026-03-02 | — |
| 36. Wire Document Generator | v10 | Pending | — | — |
| 37. Phase 30 Verification & Cleanup | v10 | Pending | — | — |

---
*Last updated: 2026-03-02 (v10 roadmap created)*
