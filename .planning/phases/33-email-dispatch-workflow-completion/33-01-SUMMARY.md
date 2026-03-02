---
phase: 33-email-dispatch-workflow-completion
plan: 01
subsystem: backend
tags: [email-dispatch, second-letter, mongodb, zendesk, retry-logic]
dependency_graph:
  requires:
    - phase-32 (SecondLetterDocumentGenerator — provides second_letter_document_filename)
    - phase-31 (secondLetterCalculationService — financial snapshot on creditors)
    - phase-30 (client portal form — FORM_SUBMITTED status)
    - phase-29 (secondLetterTriggerService — PENDING status)
    - phase-28 (Client model fields — second_letter_status, per-creditor tracking fields)
  provides:
    - POST /api/admin/clients/:clientId/send-second-letter
    - SecondLetterService.dispatchSecondLetterEmails() dispatch orchestrator
  affects:
    - client.second_letter_status (FORM_SUBMITTED → SENT)
    - creditor.second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename
tech_stack:
  added: []
  patterns:
    - Dependency-injected service class (consistent with creditorContactService pattern)
    - Per-creditor MongoDB updateOne with _id array filter
    - Atomic findOneAndUpdate with status guard for state transition
    - Non-blocking Zendesk audit comments (try/catch around addTicketComment)
    - 3x retry loop with fs.existsSync pre-check
    - 2-second inter-send delay for Resend rate limiting
key_files:
  created: []
  modified:
    - server/services/secondLetterService.js
    - server/routes/admin-second-letter.js
decisions:
  - key: SecondLetterService replaces Phase 28 stub
    rationale: Phase 28 exported standalone functions (triggerSecondLetter, submitForm, markSent); Phase 33 overwrites the file with a class-based dispatch orchestrator. The trigger/form-submit functions now live in their respective services (secondLetterTriggerService, client-portal form route).
  - key: creditorEmailService required locally in route (not injected via factory)
    rationale: creditorEmailService is a singleton (module.exports = new CreditorEmailService()); it is not in server.js scope and not passed to any route factory. Consistent with creditorContactService.js and secondRoundEmailSender.js patterns.
  - key: Route registered via existing createAdminSecondLetterRouter registration
    rationale: server.js already required and mounted admin-second-letter.js (added in Phase 31). No changes to server.js needed — the new send-second-letter endpoint is added directly to the route file's factory function.
  - key: 409 for INVALID_STATUS, 422 for NO_ELIGIBLE_CREDITORS, 207 for partial failure, 200 for full success
    rationale: 409 Conflict is semantically correct for wrong state; 422 Unprocessable Entity conveys that the request is syntactically valid but Phase 32 hasn't run; 207 Multi-Status signals partial success without misleading the admin.
metrics:
  duration: ~2m
  completed_date: 2026-03-02
  tasks_completed: 2
  files_modified: 2
---

# Phase 33 Plan 01: Email Dispatch Workflow Completion Summary

**One-liner:** SecondLetterService class with per-creditor email dispatch loop, 3x retry, MongoDB tracking, non-blocking Zendesk audits, and atomic FORM_SUBMITTED → SENT transition.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create SecondLetterService dispatch orchestrator | 845367a | server/services/secondLetterService.js |
| 2 | Add send-second-letter endpoint to admin-second-letter route | 6a0934a | server/routes/admin-second-letter.js |

## What Was Built

### SecondLetterService (`server/services/secondLetterService.js`)

The Phase 28 stub (which exported three standalone functions) was replaced with a proper class-based dispatch orchestrator:

- **Constructor:** Accepts `{ Client, creditorEmailService, ZendeskManager }` — DI for testability
- **`dispatchSecondLetterEmails(clientId)`:**
  1. Status guard: rejects non-FORM_SUBMITTED clients (SEND-05)
  2. Filters `final_creditor_list` for creditors with both `sender_email` and `second_letter_document_filename`
  3. NO_ELIGIBLE_CREDITORS guard: returns 422-ready error when Phase 32 hasn't run
  4. Per-creditor loop: `fs.existsSync` check → 3x retry → `sendSecondRoundEmail()` call
  5. On success: `Client.updateOne` with `_id` array filter for per-creditor tracking (SEND-02)
  6. On success: non-blocking `zendesk.addTicketComment()` for audit trail (SEND-03)
  7. After all sends: atomic `findOneAndUpdate` with `second_letter_status: 'FORM_SUBMITTED'` guard → SENT (SEND-04)
  8. On 3 failures: `_triggerAdminAlert()` — console.error + non-blocking Zendesk internal comment (SEND-05)
  9. 2-second inter-send delay for Resend rate limiting (SEND-01)
- **`_triggerAdminAlert(client, creditor, error)`:** Prominent console error + Zendesk internal alert comment

### Admin Route (`server/routes/admin-second-letter.js`)

Added `send-second-letter` endpoint to the existing route factory:
- Instantiates `SecondLetterService` with locally-required dependencies
- `POST /api/admin/clients/:clientId/send-second-letter` behind `authenticateAdmin`
- HTTP responses: 409 (INVALID_STATUS), 422 (NO_ELIGIBLE_CREDITORS), 207 (partial failure), 200 (all succeeded)

### server.js

No changes needed — the `createAdminSecondLetterRouter` require and `app.use` registration were already in place from Phase 31.

## Requirements Satisfied

| Requirement | Description | Status |
|-------------|-------------|--------|
| SEND-01 | Dispatch emails per creditor with DOCX attachment via sendSecondRoundEmail | Done |
| SEND-02 | Per-creditor MongoDB tracking after each successful send | Done |
| SEND-03 | Non-blocking Zendesk audit comments after each send | Done |
| SEND-04 | Atomic FORM_SUBMITTED → SENT transition with status guard | Done |
| SEND-05 | 3x retry per creditor; admin alert on exhaustion; status stays FORM_SUBMITTED on failure | Done |
| SEND-06 | No demo mode checks in dispatch service — handled transparently by creditorEmailService | Done |

## Deviations from Plan

None — plan executed exactly as written.

Note: The plan's verification step 3 expected `grep -c "admin-second-letter" server/server.js` to output `2`, but it outputs `1`. This is because line 405 uses the variable name `createAdminSecondLetterRouter` (no literal string `admin-second-letter`), while line 145 has the require string `./routes/admin-second-letter`. Both the require and the registration are present — the verification wording was imprecise, not the implementation.

## Self-Check: PASSED
