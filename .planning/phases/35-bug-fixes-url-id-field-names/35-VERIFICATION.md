---
phase: 35-bug-fixes-url-id-field-names
verified: 2026-03-03T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 35: Bug Fixes — URL, _id, and Field Names Verification Report

**Phase Goal:** Fix all data-level bugs identified by milestone audit — URL mismatch in email deep-link, _id vs id in MongoDB positional updates, and field name mismatch in template data preparation
**Verified:** 2026-03-03
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Email deep-link opens the correct portal form page at /portal/second-letter-form | VERIFIED | `secondLetterTriggerService.js` line 93: `` `${baseUrl}/portal/second-letter-form?token=${client.second_letter_form_token}` `` — matches route in `src/App.tsx` line 118 |
| 2 | Per-creditor DOCX generation stores correct creditor_id (not undefined/empty) in result objects | VERIFIED | `secondLetterDocumentGenerator.js` lines 300 and 341 both use `creditor.id` — no `creditor._id` in result storage |
| 3 | MongoDB positional updates use 'final_creditor_list.id' to match creditor subdocuments that have { _id: false } | VERIFIED | Lines 358 and 410 in documentGenerator use `'final_creditor_list.id': result.creditor_id` and `'final_creditor_list.id': creditor.id` respectively — zero occurrences of `final_creditor_list._id` |
| 4 | Template data for Familienstand and Unterhaltsberechtigte resolves from English snapshot field names (marital_status, number_of_dependents) | VERIFIED | `secondLetterDocumentGenerator.js` line 235: `snapshot.familienstand \|\| snapshot.marital_status \|\| ''`; line 236: `String(snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0)` |
| 5 | creditor_calculations entries store the actual creditor.id value (not empty string) | VERIFIED | `secondLetterCalculationService.js` line 145: `creditor_id: creditor.id \|\| ''` — no `creditor._id` in storage path |
| 6 | Per-creditor tracking in secondLetterService.js already uses correct 'final_creditor_list.id' filter (SEND-02 verified) | VERIFIED | `secondLetterService.js` line 147: `{ _id: client._id, 'final_creditor_list.id': creditor.id }` — correct, no change needed |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/services/secondLetterTriggerService.js` | Correct portal deep-link URL containing `/portal/second-letter-form?token=` | VERIFIED | Line 93 contains exact string; file is 186 lines, substantive implementation |
| `server/services/secondLetterDocumentGenerator.js` | Fixed _id-to-id references and field name fallbacks; contains `creditor.id` | VERIFIED | Lines 300, 341 use `creditor.id`; lines 235-236 have fallback chains; 418 lines total, substantive class |
| `server/services/secondLetterCalculationService.js` | Fixed creditor_id storage; contains `creditor.id \|\|` | VERIFIED | Line 145 uses `creditor.id \|\| ''`; 168 lines, substantive implementation |

All three artifacts: exist, are substantive (no stubs, no placeholder returns), and are wired into the broader workflow.

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `secondLetterTriggerService.js` | `src/App.tsx` route `/portal/second-letter-form` | URL string in email body | VERIFIED | Line 93 contains `/portal/second-letter-form?token=`; App.tsx line 118 mounts `SecondLetterForm` at `/portal/second-letter-form` |
| `secondLetterDocumentGenerator.js` | `Client` creditorSchema `{ _id: false }` | Mongoose positional update filter `final_creditor_list.id` | VERIFIED | Lines 358 and 410 use `'final_creditor_list.id'`; zero occurrences of `'final_creditor_list._id'` remain |
| `secondLetterCalculationService.js` | `secondLetterDocumentGenerator.js` prepareTemplateData | `creditor_id` field in `creditor_calculations` array | VERIFIED | calculationService line 145 stores `creditor.id`; documentGenerator line 203-205 looks up by that same value via `creditor.id` fallback |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| NOTIF-02 | 35-01-PLAN.md | Email enthält Deep-Link zum Portal-Formular (mit Token) | SATISFIED | `secondLetterTriggerService.js` line 93 constructs URL with correct path `/portal/second-letter-form?token=`; commit `c1523c2` |
| SEND-02 | 35-01-PLAN.md | Per-Creditor Tracking fields updated after send | SATISFIED | `secondLetterService.js` line 147 already uses `'final_creditor_list.id': creditor.id` — correct filter key confirmed; no code change needed, documented as verified |
| DOC-03 | 35-01-PLAN.md | Template-Variablen befüllt: Familienstand, Unterhaltsberechtigte | SATISFIED | `secondLetterDocumentGenerator.js` lines 235-236 include dual-language fallback chain (`familienstand \|\| marital_status` and `anzahl_unterhaltsberechtigte ?? number_of_dependents`); commit `c1523c2` |
| DOC-04 | 35-01-PLAN.md | Ein DOCX pro Gläubiger generiert, DB tracking field updated | SATISFIED | Five bug sites corrected: creditor_id in result objects (lines 300, 341), filter keys in generateForAllCreditors (line 358) and generateForSingleCreditorById (line 410), creditor lookup (line 397); commit `c1523c2` |

**Orphaned requirements check:** REQUIREMENTS.md maps NOTIF-02, DOC-03, DOC-04, SEND-02 to Phase 35. All four are claimed in PLAN frontmatter and verified above. No orphaned requirements.

---

### Noted Residual References (Not Bugs)

Two `creditor._id` references remain in the codebase that are explicitly out of scope and intentionally safe:

1. **`secondLetterDocumentGenerator.js` line 203** — `creditor._id?.toString() || creditor.id`
   This is the `prepareTemplateData` creditorId lookup. The PLAN explicitly prohibits changing this line: since `creditor._id` is always `undefined` with `{ _id: false }`, the expression always evaluates to `creditor.id` via the `||` fallback. The comment in the file confirms this is intentional graceful degradation.

2. **`secondLetterCalculationService.js` line 96** — `String(creditor._id || 'Unbekannt')`
   This is inside an error-path creditor display name fallback (CALC-03 validation, missing claim_amount). It is not a storage site and was never in scope for Phase 35. Since `creditor._id` is undefined, it evaluates to `String('Unbekannt')` — harmless.

Neither reference was in the plan's bug map. Neither affects stored data or runtime correctness.

---

### Anti-Patterns Found

No blockers or warnings found. Grep scans for TODO/FIXME/HACK/placeholder, empty implementations (`return null`, `return {}`, `return []`), and console-log-only stubs returned zero results across all three modified files.

---

### Human Verification Required

#### 1. End-to-end 2. Anschreiben flow smoke test

**Test:** Trigger the 2. Anschreiben for a test client in IDLE status, check the email received, click the deep-link, complete the form, then run DOCX generation and email dispatch.
**Expected:** Email deep-link navigates to `/portal/second-letter-form?token=...` (not a 404); Familienstand and Unterhaltsberechtigte appear correctly in the generated DOCX; per-creditor `second_letter_document_filename` field updates in MongoDB.
**Why human:** Requires a running server, live email delivery, actual MongoDB state, and a DOCX template file on disk — not verifiable by static code inspection.

#### 2. Recalculation for pre-fix clients

**Test:** For any client currently in `FORM_SUBMITTED` whose snapshot was calculated before the phase 35 fix, run `POST /api/admin/clients/:clientId/recalculate-second-letter` and then trigger DOCX generation.
**Expected:** `creditor_calculations` entries now contain real `creditor.id` values (not empty strings); DOCX financial figures (Forderung, Quote, Auszahlung) populate correctly.
**Why human:** Requires identifying live clients with stale snapshots and running the admin endpoint against real data — cannot be verified statically.

---

### Gaps Summary

No gaps. All six bug sites were fixed as specified in the plan, and SEND-02 was confirmed already correct (no code change needed). All must-have truths are verified by direct file reads against the actual codebase. The phase goal is achieved.

---

## Commit Verification

Both task commits referenced in SUMMARY.md exist in the git history:
- `c1523c2` — fix(35-01): fix _id-to-id and URL bugs in documentGenerator and triggerService
- `d613c1c` — fix(35-01): fix creditor_id storage in calculationService; verify SEND-02

---

_Verified: 2026-03-03_
_Verifier: Claude (gsd-verifier)_
