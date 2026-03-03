---
phase: 36-wire-document-generator
verified: 2026-03-03T10:00:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "End-to-end send-second-letter with real template files and a client in FORM_SUBMITTED state"
    expected: "POST /api/admin/clients/:id/send-second-letter returns 200 with dispatched > 0, DOCX files appear in server/generated_documents/second_round/{clientId}/, creditors receive emails with DOCX attachments, second_letter_status transitions to SENT"
    why_human: "Template files 2.Schreiben_Ratenplan.docx and 2.Schreiben_Nullplan.docx are absent from server/templates/ — acknowledged external pre-condition. Without them generateForSingleCreditor throws ENOENT, preventing any live dispatch. Code wiring is verified; runtime E2E cannot be verified programmatically."
---

# Phase 36: Wire Document Generator Verification Report

**Phase Goal:** Connect SecondLetterDocumentGenerator (Phase 32) to the send-second-letter endpoint (Phase 33) so DOCX files are generated before email dispatch — completing the E2E admin-trigger to send flow
**Verified:** 2026-03-03T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin triggers send-second-letter and DOCX files are generated for all creditors before email dispatch begins | VERIFIED | `admin-second-letter.js` lines 129-138: `generator.generateForAllCreditors(client, snapshot)` called at line 130 before `secondLetterService.dispatchSecondLetterEmails(clientId)` at line 142. Ordering confirmed. |
| 2 | SecondLetterDocumentGenerator.generateForAllCreditors() is called in the send workflow with status and snapshot guards | VERIFIED | Status guard at line 111: `second_letter_status !== 'FORM_SUBMITTED'` → 409. Snapshot guard at line 121: `!snapshot \|\| snapshot.calculation_status !== 'completed'` → 400. Generator call at line 129-138. All three in correct order. |
| 3 | Email dispatch finds DOCX files on disk at the correct path (second_round/{clientId}/{filename}) and attaches them to Resend emails | VERIFIED | `secondLetterService.js` lines 101-102: `const clientIdStr = client._id.toString(); const GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round', clientIdStr)`. Path pattern matches generator output at `secondLetterDocumentGenerator.js` line 320: `path.join(__dirname, '../generated_documents/second_round', clientId)`. Both use identical `second_round/{clientId}/{filename}` pattern. |
| 4 | Status transitions FORM_SUBMITTED to SENT after successful generation and dispatch | VERIFIED | `secondLetterService.js` lines 216-229: atomic `findOneAndUpdate` with `{ second_letter_status: 'FORM_SUBMITTED' }` filter sets `second_letter_status: 'SENT'` only when `allSucceeded === true`. |
| 5 | If document generation fails for all creditors the endpoint returns 500 without attempting email dispatch | VERIFIED | `admin-second-letter.js` lines 132-137: `if (genResult.total_generated === 0 && genResult.total_failed > 0)` returns 500 with error details before `dispatchSecondLetterEmails` is ever called at line 142. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/routes/admin-second-letter.js` | Document generation step before dispatch in send-second-letter handler; contains SecondLetterDocumentGenerator | VERIFIED | 201 lines. `SecondLetterDocumentGenerator` required at line 8, instantiated at line 129, `generateForAllCreditors` called at line 130. Substantive implementation with guards and full dispatch response handling. |
| `server/services/secondLetterService.js` | Correct path construction including clientId subdirectory; contains clientId | VERIFIED | 285 lines. `clientIdStr = client._id.toString()` at line 101; `GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round', clientIdStr)` at line 102. Path mismatch bug eliminated. |
| `server/services/secondLetterDocumentGenerator.js` | Pre-existing from Phase 32; generates DOCX with template branching | VERIFIED | 418 lines. Phase 32 VERIFICATION confirms 6/6 truths. `generateForAllCreditors` is the entry point called by the route. Template branching at line 263 (`this.templatePaths[planType]`). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/routes/admin-second-letter.js` | `server/services/secondLetterDocumentGenerator.js` | `require('../services/secondLetterDocumentGenerator')` + `new SecondLetterDocumentGenerator()` | WIRED | Line 8: require. Line 129: instantiation. Line 130: `generator.generateForAllCreditors(client, snapshot)`. Return value consumed at lines 131-138 (total_generated/total_failed check). |
| `server/routes/admin-second-letter.js` | `server/services/secondLetterService.js` | `secondLetterService.dispatchSecondLetterEmails(clientId)` | WIRED | Line 142: `await secondLetterService.dispatchSecondLetterEmails(clientId)`. Result consumed at lines 144-160 (INVALID_STATUS, NO_ELIGIBLE_CREDITORS, 207/200 response). |
| `server/services/secondLetterService.js` | `generated_documents/second_round/{clientId}/` | `path.join` with `clientIdStr` | WIRED | Lines 101-102: `clientIdStr` derived from `client._id.toString()`; included in `GENERATED_DOCS_DIR`. `fullDocPath` at line 106 appends filename. `fs.existsSync(fullDocPath)` at line 109 uses the correct path. |
| `server/services/secondLetterDocumentGenerator.js` | MongoDB (Client.final_creditor_list.$.second_letter_document_filename) | `Client.findOneAndUpdate` post-loop | WIRED | Lines 356-361: positional update `{ 'final_creditor_list.id': result.creditor_id }` sets `second_letter_document_filename`. Filter uses `creditor.id` (not `_id`) — correct for `creditorSchema { _id: false }`. The service re-loads the client after generation, picking up these persisted filenames automatically. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOC-01 | 32-01-PLAN (implemented); 36-01-PLAN (wired) | SecondLetterDocumentGenerator erstellt (spiegelt FirstRoundDocumentGenerator — docxtemplater + pizzip) | SATISFIED | `secondLetterDocumentGenerator.js` 418 lines with Docxtemplater + PizZip (lines 3-4). Phase 32 VERIFICATION scored 6/6. Phase 36 wires the call that activates this implementation. REQUIREMENTS.md traceability lists Phase 36 — implementation predates this, wiring completes the requirement end-to-end. |
| DOC-02 | 32-01-PLAN (implemented); 36-01-PLAN (wired) | Template-Branching: plan_type == RATENPLAN → Ratenplan-Template, sonst → Nullplan-Template | SATISFIED | `secondLetterDocumentGenerator.js` line 262-263: `const planType = snapshot.plan_type \|\| 'NULLPLAN'; const templatePath = this.templatePaths[planType] \|\| this.templatePaths.NULLPLAN`. Template paths configured at lines 96-99. Phase 36 triggers this code path via `generateForAllCreditors`. |
| SEND-01 | 33-01-PLAN (implemented); 36-01-PLAN (wired path fix enables it) | Resend Email pro Gläubiger mit DOCX Attachment — via creditorEmailService.sendSecondRoundEmail() | SATISFIED | `secondLetterService.js` lines 134-143: `creditorEmailService.sendSecondRoundEmail({..., attachment: { filename, path: fullDocPath }})`. Path now resolves correctly after clientId fix (lines 101-102). Phase 36 path fix is what makes this functionally reach the files on disk. |
| SEND-03 | 33-01-PLAN (implemented); 36-01-PLAN (path fix enables end-to-end reach) | Zendesk Audit-Comment pro erfolgreichem Versand an Haupt-Ticket | SATISFIED | `secondLetterService.js` lines 158-175: non-blocking `addTicketComment` with German body after `result.success === true`. Resolves `ticketId` from `client.zendesk_ticket_id \|\| creditor.main_zendesk_ticket_id`. |
| SEND-04 | 33-01-PLAN (implemented); 36-01-PLAN (status guard at route ensures pre-condition) | Status-Übergang FORM_SUBMITTED → SENT nach erfolgreichem Versand | SATISFIED | `secondLetterService.js` lines 216-229: atomic `findOneAndUpdate({ _id: client._id, second_letter_status: 'FORM_SUBMITTED' }, { $set: { second_letter_status: 'SENT', ... } })`. Phase 36 status guard at route level (line 111) ensures client is in the correct state before generation begins. |

**Note on DOC-01/DOC-02 attribution:** REQUIREMENTS.md traceability lists Phase 36 as the owning phase, but the generator was implemented and verified in Phase 32. Phase 36 provides the wiring call that activates the generator within the send workflow. Both phases together fulfill these requirements. The traceability table is not updated to reflect Phase 32 completion — this is a documentation gap, not an implementation gap.

**Orphaned requirements check:** REQUIREMENTS.md maps DOC-01, DOC-02, SEND-01, SEND-03, SEND-04 to Phase 36. All five are accounted for above. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| No anti-patterns found | — | — | — | — |

Scan of `server/routes/admin-second-letter.js` and `server/services/secondLetterService.js`: zero TODO/FIXME/PLACEHOLDER, no empty implementations, no console.log-only handlers, no stub return values.

---

### Human Verification Required

#### 1. End-to-End Send Workflow with Real Template Files

**Test:** Place `2.Schreiben_Ratenplan.docx` and `2.Schreiben_Nullplan.docx` in `server/templates/`. Select a client with `second_letter_status === 'FORM_SUBMITTED'` and a completed `second_letter_financial_snapshot`. Call `POST /api/admin/clients/:clientId/send-second-letter`.

**Expected:**
- Response status 200 (all creditors) or 207 (partial)
- `dispatched` count equals number of creditors with email + document
- DOCX files written to `server/generated_documents/second_round/{clientId}/`
- Creditors receive emails at their `sender_email` address with DOCX attached
- `second_letter_status` transitions to `SENT` in MongoDB
- `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` set on each creditor subdocument
- Zendesk audit comment appended to main ticket

**Why human:** Template files `2.Schreiben_Ratenplan.docx` and `2.Schreiben_Nullplan.docx` are absent from `server/templates/`. This is an acknowledged external pre-condition documented in Phase 32 CONTEXT.md and VERIFICATION.md. Without templates, `generateForSingleCreditor` throws ENOENT at `fs.readFile(templatePath)`, which is caught per-creditor and results in `total_generated === 0, total_failed > 0`, returning 500. The entire call chain is correctly wired — only the template files block runtime execution.

---

### Gaps Summary

No code gaps. All five must-haves are verified against the actual codebase:

1. The route handler correctly sequences: load client → status guard → snapshot guard → generateForAllCreditors → dispatchSecondLetterEmails.
2. The path mismatch bug is fixed: both the generator and the service now use `second_round/{clientId}/{filename}`.
3. All required guards are in place: FORM_SUBMITTED status guard (line 111), calculation_status === 'completed' snapshot guard (line 121), total_generated === 0 generation failure guard (line 132).
4. Atomic status transition FORM_SUBMITTED → SENT is implemented in the service (line 217).
5. Both modified files load without syntax errors.
6. Both commits (`cfc830e` feat and `e8cd824` fix) exist in the repository and match the documented changes.

The single human verification item (template files) is an acknowledged external pre-condition, not a code gap. It was documented before this phase began and is not a deliverable of Phase 36.

---

*Verified: 2026-03-03T10:00:00Z*
*Verifier: Claude (gsd-verifier)*
