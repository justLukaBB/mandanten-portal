---
phase: 38-fix-schema-gap-persist-calculation-fields
verified: 2026-03-03T12:30:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 38: Fix Schema Gap — Persist Calculation Fields — Verification Report

**Phase Goal:** Add 5 missing fields to `second_letter_financial_snapshot` Mongoose schema so calculation results persist to MongoDB — unblocking the entire send workflow (DOCX generation, email dispatch, status transition)
**Verified:** 2026-03-03T12:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calculation results (creditor_calculations, calculation_status, calculated_at, total_debt, calculation_error) persist to MongoDB after $set write via findByIdAndUpdate | VERIFIED | All 5 fields declared inside `second_letter_financial_snapshot` block at lines 678–692 of `server/models/Client.js`. Schema loads without errors (`node -e "require('./server/models/Client.js')"` returns `Schema loaded OK`). |
| 2 | The send-second-letter route guard passes when calculation_status is 'completed' — DOCX generation and email dispatch proceed | VERIFIED | `admin-second-letter.js` line 121: `if (!snapshot || snapshot.calculation_status !== 'completed')` reads from the now-declared schema field. Both write sites (clientPortalController.js lines 1469, admin-second-letter.js line 70) set `calculation_status = 'completed'` via `$set`. With the schema declaration in place, Mongoose strict mode no longer discards the value. |
| 3 | REQUIREMENTS.md shows all 8 requirements (CALC-04, DOC-01–04, SEND-01, SEND-03, SEND-04) as checked and Complete in traceability | VERIFIED | `grep -c "\- \[x\]"` returns 34. `grep -c "Pending"` returns 0. `grep -c "\- \[ \]"` returns 0. All 8 requirement IDs confirmed as `[x]` checkbox + `Complete` traceability row. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/models/Client.js` | 5 missing fields declared in `second_letter_financial_snapshot` subdocument | VERIFIED | Lines 678–692: `creditor_calculations` (typed subdocument array), `calculation_status` (enum `['completed', 'failed']`, no default), `calculation_error` (plain String), `calculated_at` (Date), `total_debt` (Number). All field names and types match exactly what Phase 31's `secondLetterCalculationService` writes. |
| `.planning/REQUIREMENTS.md` | Updated checkboxes and traceability for 8 requirements | VERIFIED | 34/34 `[x]` checkboxes. 0 Pending traceability rows. 34 Complete traceability rows. Last Updated line reflects 2026-03-03 Phase 38 completion. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/models/Client.js` | `server/controllers/clientPortalController.js` | Mongoose schema whitelists $set fields | WIRED | `clientPortalController.js` lines 1467–1471 use dotted-path `$set` for all 5 fields. Schema now declares them — writes will persist. |
| `server/models/Client.js` | `server/routes/admin-second-letter.js` | Mongoose schema whitelists $set fields; route guard reads calculation_status | WIRED | Write site at lines 68–74: `$set` pattern for 4 of 5 fields. Route guard at line 121: `snapshot.calculation_status !== 'completed'` reads from the now-declared field. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CALC-04 | 38-01-PLAN.md | Tilgungsangebot pro Gläubiger berechnet und im Snapshot gespeichert | SATISFIED | `creditor_calculations` array declared in schema — Phase 31 $set now persists. Checkbox `[x]`, traceability `Complete`. |
| DOC-01 | 38-01-PLAN.md | SecondLetterDocumentGenerator erstellt | SATISFIED | Generator implemented (Phases 32+36). Schema fix unblocks route guard. Checkbox `[x]`, traceability `Complete`. |
| DOC-02 | 38-01-PLAN.md | Template-Branching: plan_type == RATENPLAN / NULLPLAN Template | SATISFIED | Branching logic already correct. Schema fix unblocks execution path. Checkbox `[x]`, traceability `Complete`. |
| DOC-03 | 38-01-PLAN.md | Template-Variablen befüllt: per-creditor financials from creditor_calculations | SATISFIED | `creditor_calculations` now persists — `prepareTemplateData` reads it correctly. Checkbox `[x]`, traceability `Complete`. |
| DOC-04 | 38-01-PLAN.md | Ein DOCX pro Gläubiger generiert, gespeichert in generated_documents/second_round/ | SATISFIED | Generation loop correct. Route guard now passable. Checkbox `[x]`, traceability `Complete`. |
| SEND-01 | 38-01-PLAN.md | Resend Email pro Gläubiger mit DOCX Attachment | SATISFIED | `sendSecondRoundEmail` correct. `dispatchSecondLetterEmails` reachable once guard passes. Checkbox `[x]`, traceability `Complete`. |
| SEND-03 | 38-01-PLAN.md | Zendesk Audit-Comment pro erfolgreichem Versand | SATISFIED | Zendesk logic correct. Reachable once send workflow unblocked. Checkbox `[x]`, traceability `Complete`. |
| SEND-04 | 38-01-PLAN.md | Status-Übergang FORM_SUBMITTED -> SENT nach erfolgreichem Versand | SATISFIED | Atomic transition implemented. Reachable once send workflow unblocked. Checkbox `[x]`, traceability `Complete`. |

No orphaned requirements — all 8 requirements declared in the plan are accounted for and verified.

### Anti-Patterns Found

None. No TODOs, FIXMEs, stubs, or placeholder returns found in `server/models/Client.js` or `.planning/REQUIREMENTS.md`.

Note: Pre-existing duplicate index warning `[MONGOOSE] Warning: Duplicate schema index on {"id":1}` is unrelated to Phase 38 changes.

### Human Verification Required

One item is recommended for human testing but is not a blocker for this phase's stated goal (schema declaration):

**1. End-to-end persistence smoke test**

**Test:** Put a client in `FORM_SUBMITTED` state, submit the second-letter form, then read the client document from MongoDB and confirm `second_letter_financial_snapshot.creditor_calculations` is a non-empty array and `calculation_status` equals `'completed'`.

**Expected:** MongoDB document contains persisted calculation fields — `creditor_calculations` array with per-creditor objects, `calculation_status: 'completed'`, `calculated_at` timestamp, `total_debt` number.

**Why human:** Requires a running MongoDB instance and a valid test client. Cannot verify persistence behavior programmatically from static code analysis alone.

**2. DOCX template presence check**

**Test:** Verify that `server/templates/2.Schreiben_Ratenplan.docx` and `server/templates/2.Schreiben_Nullplan.docx` exist on disk.

**Expected:** Both template files present — otherwise `SecondLetterDocumentGenerator` will fail with a file-not-found error at generation time.

**Why human:** Template files are a pre-condition from Phase 32 research flagged as an open question. Cannot verify whether they have been placed since the v10 audit.

These human checks validate the end-to-end pipeline but do not affect Phase 38's goal of schema field declaration, which is fully verified programmatically.

### Gaps Summary

No gaps. All three observable truths verified, both artifacts confirmed at all three levels (exists, substantive, wired), both key links confirmed wired. 34/34 requirements Complete with zero Pending entries.

---

## Commit Evidence

| Task | Commit | Files Changed | Verified |
|------|--------|---------------|---------|
| Task 1: 5 schema fields added | `4c41621` | `server/models/Client.js` only (+17 lines) | Yes — diff shows exact 5-field addition inside `second_letter_financial_snapshot` |
| Task 2: REQUIREMENTS.md update | `19066cc` | `.planning/REQUIREMENTS.md` only (+14/-14 lines) | Yes — 34 `[x]` checkboxes, 0 Pending traceability rows |

---

_Verified: 2026-03-03T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
