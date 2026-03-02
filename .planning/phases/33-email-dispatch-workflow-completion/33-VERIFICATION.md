---
phase: 33-email-dispatch-workflow-completion
verified: 2026-03-02T00:00:00Z
status: gaps_found
score: 6/7 must-haves verified
re_verification: false
gaps:
  - truth: "After each successful per-creditor send, second_letter_sent_at, second_letter_email_sent_at, and second_letter_document_filename are updated on the creditor subdocument in MongoDB"
    status: failed
    reason: "secondLetterService.js line 147 filters with 'final_creditor_list._id': creditor._id, but creditorSchema is defined with { _id: false } (Client.js line 219), so creditor._id is always undefined. The Client.updateOne() call will find no matching subdocument and silently apply no update. The production pattern in creditorContactService.js uses 'final_creditor_list.id' (the string id field) not 'final_creditor_list._id'."
    artifacts:
      - path: "server/services/secondLetterService.js"
        issue: "Line 147: uses 'final_creditor_list._id': creditor._id — creditor._id is undefined because creditorSchema has { _id: false }"
      - path: "server/models/Client.js"
        issue: "Line 219: creditorSchema closed with { _id: false }, disabling Mongoose-generated _id on all creditor subdocuments"
    missing:
      - "Change line 147 of secondLetterService.js from '{ _id: client._id, 'final_creditor_list._id': creditor._id }' to '{ _id: client._id, 'final_creditor_list.id': creditor.id }' — matching the established pattern in creditorContactService.js lines 627 and 719"
---

# Phase 33: Email Dispatch Workflow Completion — Verification Report

**Phase Goal:** Admin triggers the send — each creditor receives a Resend email with the DOCX attachment, per-creditor tracking is updated, and status transitions to SENT
**Verified:** 2026-03-02
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin triggers send-second-letter endpoint and each creditor with a valid email receives a Resend email with the correct DOCX attachment via creditorEmailService.sendSecondRoundEmail() | VERIFIED | secondLetterService.js lines 133–142: correct call with recipientEmail, recipientName, clientName, clientReference, attachment.filename, attachment.path |
| 2 | After each successful per-creditor send, second_letter_sent_at, second_letter_email_sent_at, and second_letter_document_filename are updated on the creditor subdocument in MongoDB | FAILED | secondLetterService.js line 147 uses 'final_creditor_list._id': creditor._id — but creditorSchema has { _id: false } (Client.js line 219), so creditor._id is undefined. Client.updateOne() matches no subdocument. Confirmed by Node.js test: { _id: false } on schema yields undefined _id on subdocument instances. |
| 3 | After each successful per-creditor send, a Zendesk internal audit comment is appended to the client main ticket (non-blocking on failure) | VERIFIED | secondLetterService.js lines 158–175: resolves ticketId via client.zendesk_ticket_id \|\| creditor.main_zendesk_ticket_id, calls this.zendesk.addTicketComment(ticketId, commentBody, false) inside try/catch that only console.warn on failure |
| 4 | When all creditor emails succeed, second_letter_status atomically transitions from FORM_SUBMITTED to SENT with second_letter_sent_at timestamp | VERIFIED | secondLetterService.js lines 215–228: Client.findOneAndUpdate({ _id: client._id, second_letter_status: 'FORM_SUBMITTED' }, { $set: { second_letter_status: 'SENT', second_letter_sent_at: new Date() } }) guarded by allSucceeded check |
| 5 | When any creditor email fails after 3 retries, status remains FORM_SUBMITTED, an admin alert is logged to console and Zendesk, and the response indicates partial failure | VERIFIED | MAX_RETRIES=3 at line 127; _triggerAdminAlert() called at line 201 sets allSucceeded=false; route returns 207 when result.success===false; SENT transition skipped |
| 6 | When no creditors have second_letter_document_filename (Phase 32 not run), the endpoint returns 422 with NO_ELIGIBLE_CREDITORS error instead of misleading success | VERIFIED | secondLetterService.js lines 86–92: guard on eligibleCreditors.length === 0 && allCreditors.length > 0; route returns res.status(422).json at lines 108–110 |
| 7 | Demo mode is transparently handled by creditorEmailService — no additional demo-mode checks in the dispatch service | VERIFIED | Zero occurrences of demo_mode in secondLetterService.js; creditorEmailService.js line 252 handles it inside sendEmail() via ReviewSettings.demo_mode_enabled |

**Score:** 6/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/services/secondLetterService.js` | Dispatch orchestrator — per-creditor email loop with retry, tracking, Zendesk audit, state transition | STUB (partial) | File exists, 284 lines, fully substantive — but per-creditor MongoDB update uses wrong filter field (_id vs id). The class and all methods are non-stub; only the positional filter is broken. |
| `server/routes/admin-second-letter.js` | POST /clients/:clientId/send-second-letter endpoint behind authenticateAdmin | VERIFIED | File exists, 130 lines. Endpoint at line 98 with authenticateAdmin at line 99. Correct HTTP response codes: 409/422/207/200. Calls secondLetterService.dispatchSecondLetterEmails(clientId) at line 103. |
| `server/server.js` | Route registration for admin-second-letter | VERIFIED | Line 145: require('./routes/admin-second-letter'); Line 405: app.use('/api/admin', createAdminSecondLetterRouter({ secondLetterTriggerService, Client })). Both present and correct. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server/routes/admin-second-letter.js | server/services/creditorEmailService.js | local require (line 9) | WIRED | `const creditorEmailService = require('../services/creditorEmailService')` — not injected via factory as specified |
| server/routes/admin-second-letter.js | server/services/secondLetterService.js | dispatchSecondLetterEmails call (line 103) | WIRED | `await secondLetterService.dispatchSecondLetterEmails(clientId)` confirmed at line 103 |
| server/services/secondLetterService.js | server/services/creditorEmailService.js | sendSecondRoundEmail call (line 133) | WIRED | `await this.creditorEmailService.sendSecondRoundEmail({...})` — 3 occurrences including error log |
| server/services/secondLetterService.js | server/models/Client.js | findOneAndUpdate with FORM_SUBMITTED guard (line 216) | WIRED | `Client.findOneAndUpdate({ _id: client._id, second_letter_status: 'FORM_SUBMITTED' }, ...)` confirmed |
| server/server.js | server/routes/admin-second-letter.js | app.use('/api/admin', createAdminSecondLetterRouter(...)) (line 405) | WIRED | Both require (line 145) and app.use (line 405) present |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SEND-01 | 33-01-PLAN | Resend email per creditor with DOCX attachment via sendSecondRoundEmail | SATISFIED | secondLetterService.js lines 133–142: correct sendSecondRoundEmail call with attachment.filename and attachment.path; 2-second inter-send delay at line 208 |
| SEND-02 | 33-01-PLAN | Per-creditor tracking: second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename updated | BLOCKED | Client.updateOne filter uses 'final_creditor_list._id': creditor._id (line 147) but creditorSchema has { _id: false } — creditor._id is undefined, positional update silently applies to no document |
| SEND-03 | 33-01-PLAN | Zendesk audit comment per successful send appended to main ticket | SATISFIED | Non-blocking try/catch at lines 160–175; resolves ticketId from client.zendesk_ticket_id or creditor.main_zendesk_ticket_id; German comment body with recipient, document, Resend ID, timestamp |
| SEND-04 | 33-01-PLAN | Status transition FORM_SUBMITTED → SENT after all creditor emails sent | SATISFIED | Atomic findOneAndUpdate with second_letter_status: 'FORM_SUBMITTED' guard at line 217; only executes when allSucceeded===true |
| SEND-05 | 33-01-PLAN | Error handling: retry 3x, admin alert on exhaustion, status stays FORM_SUBMITTED | SATISFIED | MAX_RETRIES=3 (line 127); _triggerAdminAlert called at line 201 (console.error + Zendesk non-blocking); allSucceeded=false prevents SENT transition |
| SEND-06 | 33-01-PLAN | Demo mode respected — handled transparently by creditorEmailService | SATISFIED | No demo_mode references in secondLetterService.js; creditorEmailService.sendEmail() handles it at line 252 via ReviewSettings.findOne |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/services/secondLetterService.js | 147 | `'final_creditor_list._id': creditor._id` — creditor._id is undefined because creditorSchema uses { _id: false } | Blocker | Per-creditor MongoDB tracking (SEND-02) silently writes nothing; second_letter_sent_at, second_letter_email_sent_at remain unset on creditor subdocuments after successful email sends |
| server/services/secondLetterService.js | 111, 135, 163, 172, 180, 187, 194, 254 | Uses `creditor.creditor_name` which is not a field in creditorSchema | Warning | creditor_name is always undefined; falls through to creditor.sender_name fallback which works correctly — no functional impact, but misleading field reference |

### Human Verification Required

None — all automated checks provide sufficient coverage for this backend-only phase.

### Gaps Summary

One blocker gap prevents full goal achievement: the per-creditor MongoDB tracking update in `secondLetterService.js` uses the wrong filter field.

**Root cause:** `creditorSchema` in `Client.js` (line 85–219) is defined with `{ _id: false }` as the schema options, which instructs Mongoose to not generate `_id` fields on creditor subdocuments. At runtime, `creditor._id` is `undefined`. The `Client.updateOne()` call at line 147 passes `'final_creditor_list._id': undefined` as a filter condition, which matches zero documents. The update executes without error (Mongoose silently accepts it) but writes nothing to the database.

The established project pattern, used in `creditorContactService.js` at lines 627 and 719, correctly uses `'final_creditor_list.id': creditor.id` — matching on the string `id` field that creditors DO have (line 86: `id: { type: String, required: true }`).

**Fix:** Change line 147 of `server/services/secondLetterService.js` from:
```javascript
{ _id: client._id, 'final_creditor_list._id': creditor._id },
```
to:
```javascript
{ _id: client._id, 'final_creditor_list.id': creditor.id },
```

This is a single-line change that makes SEND-02 functional. All other requirements (SEND-01, SEND-03, SEND-04, SEND-05, SEND-06) and the endpoint routing are fully implemented and correct.

---

_Verified: 2026-03-02_
_Verifier: Claude (gsd-verifier)_
