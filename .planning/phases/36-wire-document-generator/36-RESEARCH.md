# Phase 36: Wire Document Generator into Send Workflow — Research

**Researched:** 2026-03-03
**Domain:** Node.js service integration — wiring SecondLetterDocumentGenerator into SecondLetterService send flow
**Confidence:** HIGH — all findings from direct codebase inspection, no external library research required

---

## Summary

Phase 36 is a pure integration phase. The two components are already fully implemented:
- **SecondLetterDocumentGenerator** (Phase 32): generates DOCX files per creditor from snapshot data
- **SecondLetterService.dispatchSecondLetterEmails()** (Phase 33): sends emails with pre-generated DOCX attachments

The gap is that neither file wires them together. Currently the `send-second-letter` endpoint calls `dispatchSecondLetterEmails()`, which checks for `creditor.second_letter_document_filename` on each creditor — but nothing ever calls `generateForAllCreditors()` first to populate that field. A client in FORM_SUBMITTED status will always receive `NO_ELIGIBLE_CREDITORS` (422) from the send endpoint because no documents exist.

**Primary recommendation:** Add `SecondLetterDocumentGenerator.generateForAllCreditors(client, snapshot)` as a step in the `send-second-letter` endpoint handler in `server/routes/admin-second-letter.js`, before calling `secondLetterService.dispatchSecondLetterEmails(clientId)`. Also fix the document path mismatch described in the Pitfalls section.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOC-01 | SecondLetterDocumentGenerator erstellt (spiegelt FirstRoundDocumentGenerator — docxtemplater + pizzip) | Already implemented in Phase 32. Phase 36 wires it into the send flow — no new implementation needed. |
| DOC-02 | Template-Branching: plan_type == RATENPLAN → Ratenplan-Template, sonst → Nullplan-Template | Already implemented in Phase 32 (secondLetterDocumentGenerator.js line 262-263). Wiring call triggers this automatically. |
| SEND-01 | Resend Email pro Gläubiger mit DOCX Attachment — via creditorEmailService.sendSecondRoundEmail() | Already implemented in Phase 33. Works when documents exist on disk. |
| SEND-03 | Zendesk Audit-Comment pro erfolgreichem Versand an Haupt-Ticket | Already implemented in Phase 33 (secondLetterService.js lines 158-175). |
| SEND-04 | Status-Übergang FORM_SUBMITTED → SENT nach erfolgreichem Versand aller Gläubiger-Emails | Already implemented in Phase 33 (secondLetterService.js lines 215-228). |

**Key finding:** All five requirements are implemented. Phase 36 satisfies them by wiring the call sequence so they execute together end-to-end.
</phase_requirements>

---

## Standard Stack

No new libraries or dependencies required. All existing:

| Library | Purpose | File |
|---------|---------|------|
| docxtemplater + pizzip | DOCX generation | secondLetterDocumentGenerator.js (Phase 32) |
| creditorEmailService | Resend email dispatch | secondLetterService.js (Phase 33) |
| fs (Node built-in) | File existence check | secondLetterService.js line 108 |
| path (Node built-in) | Path construction | Both services |

**Installation:** None needed.

---

## Architecture Patterns

### Current Flow (Broken)

```
POST /api/admin/clients/:clientId/send-second-letter
  → secondLetterService.dispatchSecondLetterEmails(clientId)
    → checks creditor.second_letter_document_filename (always null)
    → returns NO_ELIGIBLE_CREDITORS (422)
```

### Target Flow (Phase 36)

```
POST /api/admin/clients/:clientId/send-second-letter
  → [NEW] SecondLetterDocumentGenerator.generateForAllCreditors(client, snapshot)
    → generates DOCX per creditor → writes to disk → updates MongoDB
  → secondLetterService.dispatchSecondLetterEmails(clientId)
    → finds creditor.second_letter_document_filename (now set)
    → sends Resend emails with DOCX attachments
    → transitions status FORM_SUBMITTED → SENT
```

### Pattern: Inline Generation Before Dispatch (Established in Phase 1 First Round)

The first-round equivalent in `creditorContactService.js` (lines 154-179) does exactly this — document generation is called inline as Step 6 before sending emails in Step 8:

```javascript
// Step 6: Generate individual DOCX documents for each creditor
const FirstRoundDocumentGenerator = require('./firstRoundDocumentGenerator');
const documentGenerator = new FirstRoundDocumentGenerator();
const documentResults = await documentGenerator.generateCreditorDocuments(clientData, creditors, client);
if (!documentResults.success) {
  throw new Error(`Document generation failed: ${documentResults.error}`);
}

// Step 8: Send emails with document attachments via Resend
const sideConversationResults = await this.sendFirstRoundEmailsWithDocuments(...);
```

The second-letter equivalent should follow the same pattern: generate first, then dispatch.

### Integration Point

The best integration point is the route handler in `server/routes/admin-second-letter.js` at the `send-second-letter` POST handler (lines 98-127). The route handler already loads the client from DB (via `secondLetterService.dispatchSecondLetterEmails` which fetches client at line 48), but generation needs access to the client BEFORE dispatch. The approach is:

1. Load client explicitly in the route handler before calling generate+dispatch
2. Call `generateForAllCreditors(client, snapshot)` inline
3. Then call `dispatchSecondLetterEmails(clientId)`

Alternatively, add generation as a pre-step inside `dispatchSecondLetterEmails()` itself in `secondLetterService.js`. Either works. The route handler approach is more visible and follows the same pattern the first round uses (generation in the orchestrating layer, not inside the email service).

---

## Critical Bug: Document Path Mismatch

This is the most important finding and MUST be addressed in Phase 36.

### The Problem

**SecondLetterDocumentGenerator** saves files to:
```
generated_documents/second_round/{clientId}/{filename}
```
(Source: `secondLetterDocumentGenerator.js` line 320: `path.join(__dirname, '../generated_documents/second_round', clientId)`)

**SecondLetterService** looks for files at:
```
generated_documents/second_round/{filename}
```
(Source: `secondLetterService.js` line 101-105:
```javascript
const GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round');
const fullDocPath = path.join(GENERATED_DOCS_DIR, creditor.second_letter_document_filename);
```

The `second_letter_document_filename` stored on the creditor subdocument is ONLY the filename (e.g., `Mueller_AZ-12345_Ratenplan.docx`), not the subdirectory path. So `secondLetterService` constructs:
```
second_round/Mueller_AZ-12345_Ratenplan.docx   ← WRONG (file not here)
```
But the file actually lives at:
```
second_round/{clientId}/Mueller_AZ-12345_Ratenplan.docx   ← CORRECT
```

The `fs.existsSync(fullDocPath)` check at line 108 will always return `false`, triggering the admin alert and skip path — even when documents were successfully generated.

### The Fix Options

**Option A:** Change `secondLetterService` to include the clientId subdirectory:
```javascript
const fullDocPath = path.join(GENERATED_DOCS_DIR, clientId, creditor.second_letter_document_filename);
```
This requires passing `clientId` to the path construction. `clientId` is already available as the function parameter (line 42).

**Option B:** Change `secondLetterDocumentGenerator` to store the relative path (with clientId) in `second_letter_document_filename`:
```
filename: `${clientId}/${filename}`
```
This stores the relative path in MongoDB, and `secondLetterService` path joins work correctly.

**Recommendation: Option A** — cleaner, the filename field stays as a bare filename (consistent with what the field name implies), and the service constructs the full path using the clientId it already has. This mirrors first-round behavior where files are stored in a flat directory and the service knows the base dir.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| DOCX generation | Custom file writing | SecondLetterDocumentGenerator (already exists) |
| Email with attachment | Custom SMTP | creditorEmailService.sendSecondRoundEmail() (already exists) |
| Status guard | Optimistic update | Atomic findOneAndUpdate with status filter (already in Phase 33) |

---

## Common Pitfalls

### Pitfall 1: Document Path Mismatch (CONFIRMED BUG)
**What goes wrong:** `secondLetterService` constructs `second_round/{filename}` but files are at `second_round/{clientId}/{filename}`. Every send attempt skips all creditors.
**Why it happens:** Two separate phases built the generator and the service independently — path convention not coordinated.
**How to avoid:** Fix path construction in `secondLetterService.dispatchSecondLetterEmails()` to include the `clientId` subdirectory.
**Warning signs:** All creditors are skipped with "Document not found on disk" in logs.

### Pitfall 2: Generating Without Status Guard
**What goes wrong:** Calling `generateForAllCreditors()` without first validating `second_letter_status === 'FORM_SUBMITTED'`.
**Why it happens:** The status guard lives in `dispatchSecondLetterEmails()` (line 53-59), which runs AFTER generation.
**How to avoid:** Add an explicit status check before calling `generateForAllCreditors()` in the route handler. Fail fast with 409 if status is wrong — don't generate documents for clients not in FORM_SUBMITTED state.

### Pitfall 3: Snapshot Not Verified Before Generation
**What goes wrong:** Calling `generateForAllCreditors()` when `calculation_status !== 'completed'` — produces documents with zeros for all financial figures.
**Why it happens:** `generateForAllCreditors()` accepts any snapshot object without validating it.
**How to avoid:** Add a guard: check `snapshot.calculation_status === 'completed'` before calling generate. Return 400 if not completed.

### Pitfall 4: Template Files Not Present
**What goes wrong:** `generateForAllCreditors()` throws ENOENT when `server/templates/2.Schreiben_Ratenplan.docx` or `server/templates/2.Schreiben_Nullplan.docx` don't exist.
**Why it happens:** Template files are external pre-conditions — they must be placed in `server/templates/` by the user (not generated by code).
**How to avoid:** Check template file existence at startup or at the beginning of the send endpoint. Return 400 with a clear error if templates are missing. Documented as a known pending item in STATE.md.
**Current state:** Templates directory exists (`server/templates/`), but `2.Schreiben_Ratenplan.docx` and `2.Schreiben_Nullplan.docx` are NOT present. Only first-round and nullplan-prototype templates exist. E2E testing is blocked until user provides templates.

### Pitfall 5: Re-generation Overwrites Existing Documents
**What goes wrong:** Calling `generateForAllCreditors()` twice for the same client overwrites existing DOCX files and re-updates `second_letter_document_filename` in MongoDB.
**Why it happens:** No guard against re-generation — `ensureOutputDirectory` with `recursive: true` is a no-op if dir exists, and `writeFile` overwrites without error.
**How to avoid:** This is acceptable behavior (idempotent re-generation). For SENT clients, the status guard prevents re-triggering. But for FORM_SUBMITTED clients, re-calling is possible. The existing `SENT` guard in the route (`second_letter_status !== 'FORM_SUBMITTED'` check) prevents accidental re-generation after send.

### Pitfall 6: creditor_name Field Does Not Exist
**What goes wrong:** `secondLetterService.js` references `creditor.creditor_name` throughout (lines 111, 135, 163, 172, 180, 187, 194, 254), but `creditorSchema` has no `creditor_name` field — only `sender_name`.
**Why it happens:** Anti-pattern identified in Phase 33 VERIFICATION.md (Warning severity). The code falls through to `creditor.sender_name` which works correctly.
**How to avoid:** No functional impact (fallback works), but Phase 36 plan should note this and optionally clean up the spurious `creditor.creditor_name` references.

---

## Code Examples

### How document generation should be called (from firstRoundDocumentGenerator pattern)

```javascript
// Source: server/services/creditorContactService.js lines 154-179
const FirstRoundDocumentGenerator = require('./firstRoundDocumentGenerator');
const documentGenerator = new FirstRoundDocumentGenerator();
const documentResults = await documentGenerator.generateCreditorDocuments(clientData, creditors, client);
if (!documentResults.success) {
  throw new Error(`Document generation failed: ${documentResults.error}`);
}
```

### SecondLetterDocumentGenerator API (confirmed from secondLetterDocumentGenerator.js)

```javascript
const SecondLetterDocumentGenerator = require('../services/secondLetterDocumentGenerator');
const generator = new SecondLetterDocumentGenerator();

// Returns: { success: true, total_generated, total_failed, documents, errors }
const genResult = await generator.generateForAllCreditors(client, snapshot);
```

Where:
- `client` — Mongoose Client document (has `_id`, `final_creditor_list`, `aktenzeichen`, `name`, address fields)
- `snapshot` — `client.second_letter_financial_snapshot` subdocument (has `plan_type`, `creditor_calculations`, financial fields)

### Fixed path construction for secondLetterService

```javascript
// Current (BROKEN):
const GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round');
const fullDocPath = path.join(GENERATED_DOCS_DIR, creditor.second_letter_document_filename);

// Fixed (Option A):
const clientId = client._id.toString();
const GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round', clientId);
const fullDocPath = path.join(GENERATED_DOCS_DIR, creditor.second_letter_document_filename);
```

### Route handler integration point (admin-second-letter.js lines 98-127)

```javascript
// Phase 36: generate documents before dispatch
router.post('/clients/:clientId/send-second-letter', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;

    // [NEW] Load client for generation
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    // [NEW] Status guard before generation
    if (client.second_letter_status !== 'FORM_SUBMITTED') {
      return res.status(409).json({ success: false, error: `Status is ${client.second_letter_status}, expected FORM_SUBMITTED` });
    }

    // [NEW] Snapshot guard
    const snapshot = client.second_letter_financial_snapshot;
    if (!snapshot || snapshot.calculation_status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Snapshot not ready — run recalculate first' });
    }

    // [NEW] Generate DOCX for all creditors
    const generator = new SecondLetterDocumentGenerator();
    const genResult = await generator.generateForAllCreditors(client, snapshot);
    if (genResult.total_generated === 0 && genResult.total_failed > 0) {
      return res.status(500).json({ success: false, error: 'Document generation failed for all creditors', details: genResult.errors });
    }

    // Dispatch emails (existing)
    const result = await secondLetterService.dispatchSecondLetterEmails(clientId);
    // ... existing response logic
  } catch (error) { ... }
});
```

---

## Open Questions

1. **Template file availability**
   - What we know: `server/templates/2.Schreiben_Ratenplan.docx` and `server/templates/2.Schreiben_Nullplan.docx` are not present
   - What's unclear: Will user provide templates before E2E testing, or should the plan include a pre-check with a clear error message?
   - Recommendation: Plan must include a template existence check with a meaningful error. E2E verification requires the user to place template files — this should be flagged as a human verification requirement, not a blocker on the code plan.

2. **Generation failure handling policy**
   - What we know: `generateForAllCreditors()` continues on per-creditor failure (collects errors, doesn't stop)
   - What's unclear: If 2/5 creditors fail to generate, should dispatch proceed for the 3 that succeeded?
   - Recommendation: Yes — proceed. The `dispatchSecondLetterEmails()` skip logic already handles creditors without `second_letter_document_filename`. Partial generation + partial dispatch is acceptable. Use 207 Multi-Status response.

3. **Idempotency of re-generation**
   - What we know: Calling generate twice overwrites files and DB fields silently
   - What's unclear: Should Phase 36 add a "skip if already generated" guard?
   - Recommendation: No guard needed for v10 MVP. The SENT status guard prevents double dispatch. Admin can trigger re-generation for FORM_SUBMITTED clients if documents are corrupted.

---

## What Files Will Change

| File | Change | Why |
|------|--------|-----|
| `server/routes/admin-second-letter.js` | Import SecondLetterDocumentGenerator; add generation step before dispatch in send-second-letter handler | Integration point — generation must precede dispatch |
| `server/services/secondLetterService.js` | Fix path construction: add `clientId` subdirectory to `GENERATED_DOCS_DIR` | Path mismatch bug — files are at `second_round/{clientId}/file.docx` not `second_round/file.docx` |

No new files. No new dependencies. No schema changes.

---

## Sources

### Primary (HIGH confidence)

Direct codebase inspection — all findings are verified against actual file contents:

- `server/services/secondLetterDocumentGenerator.js` (418 lines) — Phase 32 implementation, confirmed by reading full file
- `server/services/secondLetterService.js` (284 lines) — Phase 33 implementation, confirmed by reading full file
- `server/routes/admin-second-letter.js` (162 lines) — Route handler, confirmed by reading full file
- `server/services/creditorContactService.js` lines 154-179 — First-round pattern for generate-then-dispatch
- `server/models/Client.js` lines 85-219 — creditorSchema with `{ _id: false }` and `second_letter_document_filename`
- `.planning/phases/32-docx-generation/32-VERIFICATION.md` — Phase 32 status and gap notes
- `.planning/phases/33-email-dispatch-workflow-completion/33-VERIFICATION.md` — Phase 33 gap (path mismatch identified)
- `.planning/phases/35-bug-fixes-url-id-field-names/35-VERIFICATION.md` — Phase 35 bugs fixed, current state confirmed

### Secondary

- `.planning/REQUIREMENTS.md` — Requirement definitions for DOC-01, DOC-02, SEND-01, SEND-03, SEND-04
- `.planning/STATE.md` — v10 decisions, confirmed template file pending status
- `.planning/ROADMAP.md` — Phase 36 goal and plan description

---

## Metadata

**Confidence breakdown:**
- What files to change: HIGH — confirmed by reading all relevant files
- The path mismatch bug: HIGH — confirmed by direct line-level inspection of both files
- Template file status: HIGH — confirmed by `ls server/templates/` (neither second-letter template present)
- Integration approach: HIGH — established pattern from first-round flow in creditorContactService.js
- No new dependencies needed: HIGH — both components already exist, no external library gap

**Research date:** 2026-03-03
**Valid until:** Until Phase 36 is executed — findings are stable (no external library versions involved)
