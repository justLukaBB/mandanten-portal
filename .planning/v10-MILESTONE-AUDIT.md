---
milestone: v10
audited: 2026-03-02T23:59:00Z
status: gaps_found
scores:
  requirements: 24/34
  phases: 6/7
  integration: 2/6
  flows: 2/4
gaps:
  requirements:
    - id: "FORM-03"
      status: "unsatisfied"
      phase: "Phase 30"
      claimed_by_plans: ["30-01-PLAN.md"]
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 30 has no VERIFICATION.md. FORM-03 (snapshot write on submit) is not listed in any SUMMARY requirements-completed frontmatter. 30-02-SUMMARY claims FORM-01, FORM-02, FORM-04, FORM-05 but not FORM-03."
    - id: "SEND-02"
      status: "unsatisfied"
      phase: "Phase 33"
      claimed_by_plans: ["33-01-PLAN.md"]
      completed_by_plans: ["33-01-SUMMARY.md"]
      verification_status: "gaps_found"
      evidence: "secondLetterService.js line 147 uses 'final_creditor_list._id': creditor._id, but creditorSchema has { _id: false }. Per-creditor tracking update silently writes nothing."
    - id: "DOC-01"
      status: "partial"
      phase: "Phase 32"
      claimed_by_plans: ["32-01-PLAN.md"]
      completed_by_plans: ["32-01-SUMMARY.md"]
      verification_status: "passed"
      evidence: "Phase-level code verified as correct, but SecondLetterDocumentGenerator is never imported or called by any route, controller, or service. Dead export at integration level."
    - id: "DOC-02"
      status: "partial"
      phase: "Phase 32"
      claimed_by_plans: ["32-01-PLAN.md"]
      completed_by_plans: ["32-01-SUMMARY.md"]
      verification_status: "passed"
      evidence: "Template branching code correct but unreachable — DOC-01 is unwired."
    - id: "DOC-03"
      status: "partial"
      phase: "Phase 32"
      claimed_by_plans: ["32-01-PLAN.md"]
      completed_by_plans: ["32-01-SUMMARY.md"]
      verification_status: "passed"
      evidence: "prepareTemplateData reads snapshot.familienstand / snapshot.anzahl_unterhaltsberechtigte but Phase 30 writes marital_status / number_of_dependents. Template variables will be empty."
    - id: "DOC-04"
      status: "partial"
      phase: "Phase 32"
      claimed_by_plans: ["32-01-PLAN.md"]
      completed_by_plans: ["32-01-SUMMARY.md"]
      verification_status: "passed"
      evidence: "Per-creditor file save correct but DB update uses final_creditor_list._id (undefined, since _id: false). Same class of bug as SEND-02."
    - id: "NOTIF-02"
      status: "partial"
      phase: "Phase 29"
      claimed_by_plans: ["29-01-PLAN.md"]
      completed_by_plans: []
      verification_status: "passed"
      evidence: "Phase 29 verification confirmed code is correct, but integration check found URL mismatch: trigger generates /second-letter?token=... but SecondLetterForm is mounted at /portal/second-letter-form in App.tsx. Client receives dead link."
    - id: "SEND-01"
      status: "partial"
      phase: "Phase 33"
      claimed_by_plans: ["33-01-PLAN.md"]
      completed_by_plans: []
      verification_status: "passed"
      evidence: "sendSecondRoundEmail code correct but unreachable — dispatchSecondLetterEmails returns NO_ELIGIBLE_CREDITORS because second_letter_document_filename is never populated (DOC-01 unwired)."
    - id: "SEND-03"
      status: "partial"
      phase: "Phase 33"
      claimed_by_plans: ["33-01-PLAN.md"]
      completed_by_plans: []
      verification_status: "passed"
      evidence: "Zendesk audit code correct but unreachable — blocked by DOC-01 unwired."
    - id: "SEND-04"
      status: "partial"
      phase: "Phase 33"
      claimed_by_plans: ["33-01-PLAN.md"]
      completed_by_plans: []
      verification_status: "passed"
      evidence: "FORM_SUBMITTED→SENT transition code correct but unreachable — blocked by DOC-01 unwired."
  integration:
    - from: "Phase 32 (SecondLetterDocumentGenerator)"
      to: "Phase 33 (SecondLetterService.dispatchSecondLetterEmails)"
      issue: "CRITICAL: SecondLetterDocumentGenerator is never imported or called. No route, controller, or service invokes generateForAllCreditors(). The send-second-letter endpoint always returns NO_ELIGIBLE_CREDITORS because second_letter_document_filename is never populated."
      affected_requirements: ["DOC-01", "DOC-02", "DOC-03", "DOC-04", "SEND-01", "SEND-02", "SEND-03", "SEND-04", "SEND-05"]
    - from: "Phase 29 (secondLetterTriggerService)"
      to: "Phase 30 (SecondLetterForm route)"
      issue: "CRITICAL: URL mismatch. Trigger generates /second-letter?token=<uuid> but SecondLetterForm is mounted at /portal/second-letter-form in src/App.tsx. Client clicks dead link."
      affected_requirements: ["NOTIF-02"]
    - from: "Phase 32 (secondLetterDocumentGenerator)"
      to: "MongoDB (creditor subdocument positional update)"
      issue: "HIGH: generateForAllCreditors uses 'final_creditor_list._id': creditor._id but creditorSchema has { _id: false }. Same class of bug as Phase 33 SEND-02. Must use 'final_creditor_list.id': creditor.id."
      affected_requirements: ["DOC-04", "SEND-02"]
    - from: "Phase 32 (prepareTemplateData)"
      to: "Phase 30 (snapshot field names)"
      issue: "HIGH: prepareTemplateData reads snapshot.familienstand / snapshot.anzahl_unterhaltsberechtigte but Phase 30 form writes marital_status / number_of_dependents. Template variables render as empty string / '0'. Calculation service already handles both conventions — doc generator must do the same."
      affected_requirements: ["DOC-03"]
  flows:
    - flow: "Admin trigger → send E2E"
      breaks_at: "DOCX generation step"
      issue: "No code path invokes SecondLetterDocumentGenerator between FORM_SUBMITTED and send-second-letter. Admin clicks 'Jetzt senden' → dispatchSecondLetterEmails → NO_ELIGIBLE_CREDITORS (no document filenames populated)."
    - flow: "Client form access via email"
      breaks_at: "Deep-link URL"
      issue: "Email generates /second-letter?token=... but form route is /portal/second-letter-form. Client gets 404."
tech_debt:
  - phase: 28-state-machine-foundation
    items:
      - "Mongoose duplicate {id: 1} index warning on Client model load (pre-existing, not from this phase)"
  - phase: 30-client-portal-form
    items:
      - "Missing VERIFICATION.md — phase was never formally verified"
  - phase: 32-docx-generation
    items:
      - "Template files (2.Schreiben_Ratenplan.docx, 2.Schreiben_Nullplan.docx) do not exist in server/templates/ — acknowledged external pre-condition"
  - phase: 33-email-dispatch-workflow-completion
    items:
      - "secondLetterService.js references creditor.creditor_name which is not a schema field — falls through to creditor.sender_name (works, but misleading)"
  - phase: 34-admin-ui-tracking
    items:
      - "REQUIREMENTS.md traceability table shows DOC-01–04 and UI-01–04 as 'Pending' — should be updated to 'Complete'"
      - "4 human verification items pending (trigger button modal, TrackingCanvas layout, plan override select, Client List badge colors)"
---

# v10 Milestone Audit: 2. Anschreiben Automatisierung

**Audited:** 2026-03-02
**Status:** gaps_found
**Score:** 24/34 requirements satisfied | 6/7 phases verified | 2/6 integration links clean | 2/4 E2E flows working

---

## Phase Verification Summary

| Phase | Name | Verification Status | Score | Key Issue |
|-------|------|-------------------|-------|-----------|
| 28 | State Machine Foundation | PASSED | 10/10 | — |
| 29 | Trigger, Scheduler & Client Notification | PASSED | 9/9 | — |
| **30** | **Client Portal Form** | **MISSING** | **—** | **No VERIFICATION.md exists** |
| 31 | Financial Calculation Engine | PASSED | 8/8 | — |
| 32 | DOCX Generation | PASSED | 6/6 | Template files not yet provided (external pre-condition) |
| 33 | Email Dispatch & Workflow Completion | GAPS_FOUND | 6/7 | `_id` vs `id` bug on per-creditor tracking |
| 34 | Admin UI & Tracking | PASSED | 9/9 | Human verification pending for 4 UI items |

---

## Requirements Cross-Reference (3-Source)

### Satisfied (24/34)

| REQ-ID | Description | Phase | VERIFICATION | SUMMARY | REQ.md |
|--------|-------------|-------|-------------|---------|--------|
| SCHEMA-01 | second_letter_status enum | 28 | passed | listed | [x] |
| SCHEMA-02 | financial_snapshot subdocument | 28 | passed | listed | [x] |
| SCHEMA-03 | timestamp fields | 28 | passed | listed | [x] |
| SCHEMA-04 | creditor tracking fields | 28 | passed | listed | [x] |
| TRIG-01 | Scheduler daily check | 29 | passed | — | [x] |
| TRIG-02 | Manual admin trigger | 29 | passed | — | [x] |
| TRIG-03 | Idempotent trigger | 29 | passed | — | [x] |
| TRIG-04 | Audit log | 29 | passed | — | [x] |
| NOTIF-01 | Resend email to client | 29 | passed | — | [x] |
| NOTIF-03 | No duplicate notifications | 29 | passed | — | [x] |
| FORM-01 | Pre-filled form | 30 | — | listed | [x] |
| FORM-02 | Required fields | 30 | — | listed | [x] |
| FORM-04 | Status PENDING→FORM_SUBMITTED | 30 | — | listed | [x] |
| FORM-05 | Form only when PENDING | 30 | — | listed | [x] |
| CALC-01 | Garnishable amount §850c | 31 | passed | listed | [x] |
| CALC-02 | Plan type determination | 31 | passed | listed | [x] |
| CALC-03 | Pro-rata quota | 31 | passed | listed | [x] |
| CALC-04 | Tilgungsangebot per creditor | 31 | passed | listed | [x] |
| SEND-05 | Retry 3x + admin alert | 33 | passed | — | [x] |
| SEND-06 | Demo mode | 33 | passed | — | [x] |
| UI-01 | Trigger button | 34 | passed | listed | [ ] |
| UI-02 | Status badges | 34 | passed | listed | [ ] |
| UI-03 | TrackingCanvas 3rd column | 34 | passed | listed | [ ] |
| UI-04 | Plan type override | 34 | passed | listed | [ ] |

### Unsatisfied (2/34) — Blockers

| REQ-ID | Description | Phase | Reason |
|--------|-------------|-------|--------|
| **FORM-03** | Snapshot write on submit | 30 | No VERIFICATION.md, not in any SUMMARY requirements-completed. Likely implemented in 30-01 backend but never formally verified. |
| **SEND-02** | Per-creditor tracking update | 33 | VERIFICATION confirmed bug: `final_creditor_list._id` is `undefined` (creditorSchema `{ _id: false }`). MongoDB positional update silently writes nothing. |

### Blocked by Integration (8/34) — Code Correct, Wiring Missing

| REQ-ID | Description | Phase | Integration Issue |
|--------|-------------|-------|-------------------|
| **NOTIF-02** | Email deep-link with token | 29 | URL mismatch: generates `/second-letter?token=...` but form is at `/portal/second-letter-form` |
| **DOC-01** | SecondLetterDocumentGenerator | 32 | Class never imported/called — dead export |
| **DOC-02** | Template branching | 32 | Unreachable (DOC-01 unwired) |
| **DOC-03** | Template variables populated | 32 | Field name mismatch: reads `familienstand` but snapshot stores `marital_status` |
| **DOC-04** | One DOCX per creditor saved | 32 | `_id` bug in DB update + unreachable |
| **SEND-01** | Email per creditor with DOCX | 33 | Returns NO_ELIGIBLE_CREDITORS (no document filenames populated) |
| **SEND-03** | Zendesk audit comment | 33 | Unreachable (blocked by SEND-01) |
| **SEND-04** | Status FORM_SUBMITTED→SENT | 33 | Unreachable (blocked by SEND-01) |

---

## Integration Gaps

### CRITICAL: SecondLetterDocumentGenerator is Dead Code

**Phase 32 → Phase 33**

`SecondLetterDocumentGenerator` is a fully implemented 418-line class that passes all phase-level verification checks. However, it is never imported or called by any other file in the codebase. Zero `require()` sites exist outside of the file itself.

The `send-second-letter` endpoint (Phase 33) requires `second_letter_document_filename` to be set on creditors before it can send emails. Without DOCX generation running first, `dispatchSecondLetterEmails()` returns `NO_ELIGIBLE_CREDITORS` for every client.

**Fix:** Add DOCX generation call inside the `send-second-letter` route (before dispatch), or create a separate admin endpoint.

### CRITICAL: Email Deep-Link URL Mismatch

**Phase 29 → Phase 30**

`secondLetterTriggerService.js` line 93 generates:
```
${baseUrl}/second-letter?token=${token}
```

But `SecondLetterForm.tsx` is mounted in `src/App.tsx` at:
```
/portal/second-letter-form
```

Client receives a dead link. The form exists and works — the URL is just wrong.

**Fix:** Change line 93 to `/portal/second-letter-form?token=${token}`.

### HIGH: Document Generator _id Bug

**Phase 32 → MongoDB**

`secondLetterDocumentGenerator.js` lines 357-359 use `'final_creditor_list._id': result.creditor_id` but `creditorSchema` has `{ _id: false }`. Same class of bug as SEND-02 (Phase 33). Also `creditor._id?.toString()` at line 300 will be `undefined`.

**Fix:** Use `'final_creditor_list.id': creditor.id` consistently.

### HIGH: Template Variable Field Name Mismatch

**Phase 32 → Phase 30 snapshot**

`prepareTemplateData()` reads `snapshot.familienstand` and `snapshot.anzahl_unterhaltsberechtigte`, but Phase 30's form handler writes `marital_status` and `number_of_dependents`. The calculation service correctly handles both conventions with fallback — the document generator must do the same.

**Fix:** Apply fallback pattern: `snapshot.familienstand || snapshot.marital_status`.

---

## E2E Flow Status

| Flow | Status | Breaks At |
|------|--------|-----------|
| Admin trigger → PENDING → email → form → FORM_SUBMITTED → calc → DOCX → send → SENT | **BROKEN** | DOCX generation (no caller) + URL mismatch (dead link) |
| Scheduler auto-trigger | **BROKEN** | Same break point as admin trigger |
| Admin recalculate | COMPLETE | — |
| Admin plan type override | COMPLETE | — |

---

## Tech Debt (Non-Blocking)

| Phase | Items |
|-------|-------|
| 28 | Mongoose duplicate `{id: 1}` index warning (pre-existing) |
| 30 | Missing VERIFICATION.md (never formally verified) |
| 32 | Template DOCX files not yet provided (external pre-condition) |
| 33 | `creditor.creditor_name` references non-existent field (falls through to `sender_name`, works) |
| 34 | REQUIREMENTS.md checkboxes not updated for DOC-01–04, UI-01–04 |
| 34 | 4 human verification items pending (UI visual checks) |

**Total:** 7 items across 5 phases

---

## Actionable Fixes Required (Priority Order)

### 1. Wire SecondLetterDocumentGenerator into send workflow
- Import `SecondLetterDocumentGenerator` in `send-second-letter` route or service
- Call `generateForAllCreditors(client, snapshot)` before `dispatchSecondLetterEmails()`
- **Blocks:** DOC-01–04, SEND-01, SEND-03, SEND-04

### 2. Fix email deep-link URL
- `secondLetterTriggerService.js` line 93: change `/second-letter?token=` to `/portal/second-letter-form?token=`
- **Blocks:** NOTIF-02, entire client form access flow

### 3. Fix _id bug in secondLetterService.js (Phase 33)
- Line 147: change `'final_creditor_list._id': creditor._id` to `'final_creditor_list.id': creditor.id`
- **Blocks:** SEND-02

### 4. Fix _id bug in secondLetterDocumentGenerator.js (Phase 32)
- Lines 300, 357-359, 397, 409-411: replace all `._id` references with `.id`
- **Blocks:** DOC-04

### 5. Fix field name mismatch in prepareTemplateData
- Lines 235-236: add fallback `snapshot.familienstand || snapshot.marital_status` and `snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0`
- **Blocks:** DOC-03

### 6. Create Phase 30 VERIFICATION.md
- Run verification for Phase 30 to formally confirm FORM-01 through FORM-05
- **Blocks:** FORM-03 (likely already implemented but unverified)

### 7. Update REQUIREMENTS.md checkboxes
- Mark DOC-01–04 and UI-01–04 as `[x]` Complete
- Housekeeping, not functional

---

_Audited: 2026-03-02T23:59:00Z_
_Auditor: Claude (gsd-audit-milestone)_
