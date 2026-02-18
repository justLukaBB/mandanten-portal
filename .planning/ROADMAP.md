# Roadmap: Mandanten Portal - Creditor Processing

## Milestones

- ✅ **v1 Manual Review & Payment Status Flow Fix** - Phases 1-2 (shipped 2026-01-30)
- ✅ **v2 Robust Dedup** - Phases 3-6 (shipped 2026-02-01)
- ✅ **v2.1 Aktenzeichen Display Fix** - Phase 7 (shipped 2026-02-02)
- ✅ **v3 Multi-Page PDF Support** - Phases 8-9 (shipped 2026-02-09)
- ✅ **v4 Editable Creditor Table** - Phases 10-12 (shipped 2026-02-17)
- ✅ **v5 1. Rate Bestätigung** - Phases 13-15 (shipped 2026-02-17)
- ✅ **v6 Async Creditor Confirm** - Phase 16 (shipped 2026-02-17)
- 🚧 **v7 FastAPI Webhook Field Integration** - Phases 17-18 (in progress)

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

### 🚧 v7 FastAPI Webhook Field Integration (Phases 17-18)

**Milestone Goal:** Neue Felder aus dem FastAPI Accuracy Milestone (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, Postfach-Flags) werden im Node.js Backend gespeichert und durch Dedup/Merge geleitet — ohne Frontend-Änderungen.

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
- [ ] 17-01-PLAN.md — Schema fields + address_source enrichment logic

#### Phase 18: Merge Logic for New Fields
**Goal**: When mergeCreditorLists() deduplicates creditors, aktenzeichen_glaeubigervertreter and the two Postfach-Flags are merged correctly — no data is silently dropped
**Depends on**: Phase 17
**Requirements**: MERGE-01, MERGE-02
**Success Criteria** (what must be TRUE):
  1. When two creditors are merged and both have aktenzeichen_glaeubigervertreter values, the longer non-empty string is kept on the merged creditor
  2. When two creditors are merged and one has aktenzeichen_glaeubigervertreter set and the other has it empty/null, the non-empty value is kept
  3. When two creditors are merged and either has glaeubiger_adresse_ist_postfach = true, the merged creditor has glaeubiger_adresse_ist_postfach = true
  4. When two creditors are merged and either has glaeubiger_vertreter_adresse_ist_postfach = true, the merged creditor has glaeubiger_vertreter_adresse_ist_postfach = true
**Plans**: TBD

## Phase Details

### Phase 17: Schema and Webhook Field Mapping
**Goal**: All 5 new FastAPI fields are stored in MongoDB — creditorSchema and documentSchema accept them, and the webhook controller maps them from FastAPI payloads into both collections
**Depends on**: Phase 16
**Requirements**: SCHEMA-01, SCHEMA-02, HOOK-01, HOOK-02
**Success Criteria** (what must be TRUE):
  1. A FastAPI webhook payload containing aktenzeichen_glaeubigervertreter, address_source, llm_address_original, glaeubiger_adresse_ist_postfach, and glaeubiger_vertreter_adresse_ist_postfach results in all 5 fields persisted on the creditor document in MongoDB
  2. A webhook payload containing the 5 new fields results in them also being stored on the corresponding document's extracted_data.creditor_data subdocument in MongoDB
  3. A webhook payload omitting any of the 5 new fields does not cause a validation error — fields default to null/false as appropriate
  4. When enrichDedupedCreditorFromDb replaces a creditor's address from the local DB, the creditor's address_source field is set to "local_db"
**Plans**: 1 plan

Plans:
- [ ] 17-01-PLAN.md — Schema fields + address_source enrichment logic

### Phase 18: Merge Logic for New Fields
**Goal**: When mergeCreditorLists() deduplicates creditors, aktenzeichen_glaeubigervertreter and the two Postfach-Flags are merged correctly — no data is silently dropped
**Depends on**: Phase 17
**Requirements**: MERGE-01, MERGE-02
**Success Criteria** (what must be TRUE):
  1. When two creditors are merged and both have aktenzeichen_glaeubigervertreter values, the longer non-empty string is kept on the merged creditor
  2. When two creditors are merged and one has aktenzeichen_glaeubigervertreter set and the other has it empty/null, the non-empty value is kept
  3. When two creditors are merged and either has glaeubiger_adresse_ist_postfach = true, the merged creditor has glaeubiger_adresse_ist_postfach = true
  4. When two creditors are merged and either has glaeubiger_vertreter_adresse_ist_postfach = true, the merged creditor has glaeubiger_vertreter_adresse_ist_postfach = true
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18

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
| 17. Schema and Webhook Field Mapping | v7 | Complete    | 2026-02-18 | - |
| 18. Merge Logic for New Fields | v7 | 0/? | Not started | - |

---
*Last updated: 2026-02-18*
