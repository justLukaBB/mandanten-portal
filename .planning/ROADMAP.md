# Roadmap: Mandanten Portal - Creditor Processing

## Milestones

- ✅ **v1 Manual Review & Payment Status Flow Fix** - Phases 1-2 (shipped 2026-01-30)
- ✅ **v2 Robust Dedup** - Phases 3-6 (shipped 2026-02-01)
- ✅ **v2.1 Aktenzeichen Display Fix** - Phase 7 (shipped 2026-02-02)
- ✅ **v3 Multi-Page PDF Support** - Phases 8-9 (shipped 2026-02-09)
- 🚧 **v4 Editable Creditor Table** - Phases 10-12 (in progress)

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

### 🚧 v4 Editable Creditor Table (Phases 10-12)

**Milestone Goal:** Admin can fully edit, add, and delete creditors inline in the Gläubiger-Tabelle — no page reload, instant auto-save.

#### Phase 10: Backend German Field Support
**Goal**: Backend PUT /clients/:clientId/creditors/:creditorId accepts all German field names used in the Gläubiger-Tabelle
**Depends on**: Phase 9 (v3 shipped)
**Requirements**: EDIT-04
**Success Criteria** (what must be TRUE):
  1. Admin sends PUT request with `glaeubiger_name` field and it is saved to the creditor document in MongoDB
  2. Admin sends PUT request with `forderungbetrag` field and the value persists correctly
  3. All 10 German fields (glaeubiger_name, glaeubiger_adresse, glaeubigervertreter_name, glaeubigervertreter_adresse, forderungbetrag, email_glaeubiger, email_glaeubiger_vertreter, dokumenttyp, needs_manual_review, review_reasons) are accepted and saved without error
  4. Existing requests using old field names continue to work without breaking changes
**Plans**: TBD

Plans:
- [ ] 10-01: Extend updateCreditor controller to map and persist German field names

#### Phase 11: Inline Cell Editing
**Goal**: Admin can click any cell in the Gläubiger-Tabelle, edit it inline, and changes save automatically on blur with visual feedback
**Depends on**: Phase 10
**Requirements**: EDIT-01, EDIT-02, EDIT-03
**Success Criteria** (what must be TRUE):
  1. Admin clicks a cell in the Gläubiger-Tabelle and the cell becomes an editable input field
  2. Admin edits a cell value and clicks away — the value is sent to the backend and saved without any page action
  3. After a successful save, the cell shows a brief success indicator (green checkmark or similar) before returning to display mode
  4. After a failed save, the cell shows an error state and retains the unsaved value so the admin can retry
  5. All 13 columns of the table are editable via this mechanism
**Plans**: TBD

Plans:
- [ ] 11-01: Convert Gläubiger-Tabelle HTML cells to inline-edit components
- [ ] 11-02: Wire blur-triggered auto-save to PUT endpoint with success/error feedback

#### Phase 12: Row Management
**Goal**: Admin can add new creditor rows and delete existing rows, with the table reflecting changes immediately
**Depends on**: Phase 11
**Requirements**: ROW-01, ROW-02, ROW-03
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Hinzufügen" button and a new empty row appears in the table ready for editing
  2. Admin fills a new row and blurs the last field — a new creditor is created via POST /clients/:clientId/add-creditor and appears in the table without a page reload
  3. Admin clicks delete on a creditor row and a confirmation dialog appears before any data is removed
  4. Admin confirms deletion — the row is removed via DELETE /clients/:clientId/creditors/:creditorId and disappears from the table immediately
**Plans**: TBD

Plans:
- [ ] 12-01: Add new row button wired to POST add-creditor endpoint
- [ ] 12-02: Delete row with confirmation dialog wired to DELETE endpoint

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

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
| 10. Backend German Field Support | v4 | 0/TBD | Not started | - |
| 11. Inline Cell Editing | v4 | 0/TBD | Not started | - |
| 12. Row Management | v4 | 0/TBD | Not started | - |

---
*Last updated: 2026-02-17*
