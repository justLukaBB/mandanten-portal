# Phase 33: Email Dispatch & Workflow Completion - Research

**Researched:** 2026-03-02
**Domain:** Resend email dispatch, per-creditor MongoDB tracking, Zendesk audit comments, retry logic, state machine transition FORM_SUBMITTED → SENT
**Confidence:** HIGH — all findings from direct codebase inspection of the project's own production code

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEND-01 | Resend email per creditor with DOCX attachment — identical pipeline as 1. Anschreiben (creditorEmailService.sendSecondRoundEmail) | `creditorEmailService.sendSecondRoundEmail()` is fully implemented and ready to call. Signature, demo mode, and matcher sync are already handled internally. |
| SEND-02 | Per-creditor tracking: `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` updated after each successful send | These fields must be added to `creditorSchema` in Phase 28. The update pattern using `Client.updateOne({ 'final_creditor_list.$.field': value })` is established in `creditorContactService.js`. |
| SEND-03 | Zendesk audit comment per successful send appended to client's main ticket | `this.zendesk.addTicketComment(mainTicketId, body, false)` is the established internal-comment pattern. The `mainTicketId` is stored per-creditor in `final_creditor_list.$.main_zendesk_ticket_id` and on the client root as `zendesk_ticket_id`. |
| SEND-04 | Status transition FORM_SUBMITTED → SENT after all creditor emails dispatched | Must use `Client.findOneAndUpdate({ _id, second_letter_status: 'FORM_SUBMITTED' }, { $set: { second_letter_status: 'SENT', second_letter_sent_at: new Date() } })` with status guard to prevent double-completion. |
| SEND-05 | Error handling: retry 3x per creditor, then admin alert + status stays FORM_SUBMITTED | No existing admin alert helper exists in the codebase. Must implement inline (e.g., log + emailService or console-based alert). Retry pattern: loop up to 3 attempts inside the per-creditor send step. |
| SEND-06 | Demo mode respected — emails go to test address instead of real creditor emails | Already handled transparently inside `creditorEmailService.sendEmail()` via `ReviewSettings.demo_mode_enabled`. No special logic needed in the dispatch service — the service handles redirection internally. |
</phase_requirements>

---

## Summary

Phase 33 is the dispatch layer of the 2. Anschreiben workflow. It sits after Phase 32 (DOCX generation) and before Phase 34 (Admin UI). The core task is: read the generated DOCX files for each creditor in `final_creditor_list`, call `creditorEmailService.sendSecondRoundEmail()` for each, update per-creditor MongoDB tracking fields, add Zendesk audit comments, then transition `second_letter_status` to SENT.

The good news: the entire email-sending infrastructure already exists and works. `creditorEmailService.sendSecondRoundEmail()` is a fully implemented, production-grade method that handles Resend SDK calls, demo mode redirection, matcher sync, and dev-mode fallback. The project pattern for per-creditor MongoDB updates after a send is also established in `creditorContactService.js`. The Zendesk audit comment pattern is established in both `creditorContactService.js` and `secondRoundEmailSender.js`.

The new work is: (1) write a `secondLetterService.js` that orchestrates the dispatch loop with 3-retry logic and admin alert on exhaustion, (2) add a `POST /api/admin/clients/:clientId/send-second-letter` endpoint behind `authenticateAdmin`, and (3) wire the status machine transition to SENT atomically after all creditors succeed.

**Primary recommendation:** Mirror the `creditorContactService.sendFirstRoundEmailsViaResend()` dispatch loop pattern. Add retry-per-creditor wrapping. Use `Client.findOneAndUpdate()` with a status guard (`second_letter_status: 'FORM_SUBMITTED'`) for the final SENT transition to prevent partial-state races.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `creditorEmailService` (existing) | local | Sends Resend emails with DOCX attachment | Already implemented and used for first round; `sendSecondRoundEmail()` is the confirmed method |
| `ZendeskManager` (existing) | local | Adds audit comments to tickets | `addTicketComment(ticketId, body, false)` is established pattern |
| `Client` (Mongoose model) | local | Per-creditor and client-level DB updates | `Client.updateOne` with `final_creditor_list.$` positional operator for per-creditor updates; `findOneAndUpdate` with status guard for SENT transition |
| `ReviewSettings` (Mongoose model) | local | Demo mode check | Used inside `creditorEmailService.sendEmail()` — no additional handling needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `emailService` (existing) | local | Admin alert email fallback | Only if admin alert email is needed; otherwise console log + Zendesk comment |
| `fs` (Node built-in) | built-in | Read DOCX file from disk for attachment | Already used in `creditorEmailService.sendFirstRoundEmail` |
| `path` (Node built-in) | built-in | Resolve `generated_documents/second_round/` paths | Already used throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline retry loop (3x) | webhookQueueService retry | webhookQueueService is for async webhooks; synchronous inline retry is simpler and consistent with the project's approach |
| Console admin alert | emailService.sendAdminAlert | No existing `sendAdminAlert` method exists in the codebase; simplest approach is console.error + Zendesk internal comment; can be upgraded to email later |

**Installation:** No new packages needed — all required libraries are already in `server/package.json`.

---

## Architecture Patterns

### Recommended Project Structure

The Phase 33 implementation creates:

```
server/
├── services/
│   └── secondLetterService.js       # New orchestrator for dispatch + tracking + state transition
├── routes/
│   └── admin-second-letter.js       # New route file: POST /clients/:clientId/send-second-letter
└── server.js                        # Register new route: app.use('/api/admin', ...)
```

No new controller file is needed — inline handler inside the route factory is sufficient given the single-endpoint scope, consistent with simpler admin routes like `admin-settlement.js`.

### Pattern 1: Per-Creditor Dispatch Loop with Retry

**What:** Iterate over `final_creditor_list`, for each creditor attempt `sendSecondRoundEmail()` up to 3 times with a 2-second delay between sends (per SEND-01 requirement). Track success/failure per creditor.

**When to use:** This is the core dispatch loop.

```javascript
// Source: creditorContactService.js lines 796-811 + secondRoundEmailSender.js lines 35-87
for (let i = 0; i < creditors.length; i++) {
  const creditor = creditors[i];
  let lastError = null;
  let success = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await creditorEmailService.sendSecondRoundEmail({
      recipientEmail: creditor.sender_email,
      recipientName: creditor.creditor_name || creditor.sender_name,
      clientName: `${client.firstName} ${client.lastName}`,
      clientReference: client.aktenzeichen,
      attachment: {
        filename: creditor._docxFilename,  // set by Phase 32
        path: path.join(__dirname, '../generated_documents/second_round', creditor._docxFilename)
      }
    });

    if (result.success) {
      success = true;
      // Update per-creditor tracking (SEND-02)
      await Client.updateOne(
        { _id: client._id, 'final_creditor_list._id': creditor._id },
        {
          $set: {
            'final_creditor_list.$.second_letter_sent_at': new Date(),
            'final_creditor_list.$.second_letter_email_sent_at': new Date(),
            'final_creditor_list.$.second_letter_document_filename': creditor._docxFilename
          }
        }
      );
      // Zendesk audit comment (SEND-03)
      await addZendeskAuditComment(client, creditor, result.emailId);
      break;
    }
    lastError = result.error;
  }

  if (!success) {
    // Admin alert after 3 failures (SEND-05)
    triggerAdminAlert(client, creditor, lastError);
    allSucceeded = false;
  }

  // 2-second delay between sends (SEND-01 requirement)
  if (i < creditors.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### Pattern 2: Atomic SENT Transition with Status Guard

**What:** After all creditors have been processed, transition `second_letter_status` to SENT only if all sends succeeded. Use `findOneAndUpdate` with status guard to prevent double-completion.

**When to use:** Final step of the dispatch, after the per-creditor loop.

```javascript
// Source: STATE.md v10 Key Decisions — "atomic findOneAndUpdate with Status-Guard"
if (allSucceeded) {
  const updated = await Client.findOneAndUpdate(
    { _id: client._id, second_letter_status: 'FORM_SUBMITTED' },
    {
      $set: {
        second_letter_status: 'SENT',
        second_letter_sent_at: new Date()
      }
    },
    { new: true }
  );

  if (!updated) {
    // Another process already transitioned — idempotent, not an error
    console.warn(`Status guard: client ${client.aktenzeichen} was not in FORM_SUBMITTED state`);
  }
}
// If any creditor failed: status stays FORM_SUBMITTED (SEND-05)
```

### Pattern 3: Zendesk Audit Comment

**What:** After each successful per-creditor send, add an internal comment to the client's main Zendesk ticket.

**When to use:** Immediately after a successful `sendSecondRoundEmail` call (SEND-03).

```javascript
// Source: secondRoundEmailSender.js lines 148-161 + creditorContactService.js lines 687-701
async function addZendeskAuditComment(client, creditor, resendEmailId) {
  try {
    const zendesk = new ZendeskManager();
    const mainTicketId = client.zendesk_ticket_id
      || creditor.main_zendesk_ticket_id;

    if (!mainTicketId) {
      console.warn(`No Zendesk ticket ID for client ${client.aktenzeichen} — skipping audit comment`);
      return;
    }

    await zendesk.addTicketComment(
      mainTicketId,
      `📧 2. Anschreiben via Resend gesendet\n\n` +
      `• Empfänger: ${creditor.creditor_name || creditor.sender_name} (${creditor.sender_email})\n` +
      `• Dokument: ${creditor.second_letter_document_filename}\n` +
      `• Resend ID: ${resendEmailId}\n` +
      `• Zeitpunkt: ${new Date().toLocaleString('de-DE')}`,
      false // internal comment
    );
  } catch (err) {
    // Non-blocking — Zendesk failure must not abort the dispatch
    console.warn(`Failed to add Zendesk audit comment: ${err.message}`);
  }
}
```

### Pattern 4: Admin Route Registration

**What:** New admin route file, factory pattern, mounted at `/api/admin`.

**When to use:** Standard pattern for all admin routes in this codebase.

```javascript
// Source: server.js lines 328–394 — all admin routes use this pattern
// server/routes/admin-second-letter.js
module.exports = (dependencies) => {
  const router = express.Router();
  const { Client, creditorEmailService } = dependencies;

  router.post('/clients/:clientId/send-second-letter',
    rateLimits.admin,
    authenticateAdmin,
    async (req, res) => { /* handler */ }
  );

  return router;
};

// server.js
const createAdminSecondLetterRouter = require('./routes/admin-second-letter');
app.use('/api/admin', createAdminSecondLetterRouter({ Client, creditorEmailService }));
```

### Anti-Patterns to Avoid

- **Do NOT call `creditorEmailService.sendEmail()` directly:** Always call `sendSecondRoundEmail()` — it uses the correct subject, body template, and tags for the second round.
- **Do NOT check demo mode in the dispatch service:** `creditorEmailService.sendEmail()` already reads `ReviewSettings.demo_mode_enabled` internally. Adding a second check creates double-handling.
- **Do NOT use the deprecated `secondRoundManager.js` or `second-round-api.js`:** These are Zendesk-centric and architecturally incompatible with the new v10 state machine. As per STATE.md, these should have a deprecation comment added, not be extended.
- **Do NOT write `second_letter_status: 'SENT'` with a plain `$set` without the status guard:** Must use `findOneAndUpdate({ _id, second_letter_status: 'FORM_SUBMITTED' })` to prevent marking partial-send as complete.
- **Do NOT use the `id` field for MongoDB lookups:** Always use `_id` per CLAUDE.md rules.
- **Do NOT match creditors by array index:** Creditor matching in `final_creditor_list` must use the creditor's `_id` (subdocument `_id`) or unique identifier, not index position, to avoid mismatches on concurrent updates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resend email sending with DOCX attachment | Custom Resend API calls | `creditorEmailService.sendSecondRoundEmail()` | Already handles: Resend SDK init, demo mode redirect, matcher sync, dev-mode console fallback, attachment preparation from file path |
| Demo mode email redirection | Check `demo_mode_enabled` in service | Already in `creditorEmailService.sendEmail()` | The check happens inside `sendEmail()` which both `sendFirstRoundEmail` and `sendSecondRoundEmail` call — no additional handling needed |
| Rate limiting between emails | Custom delay logic | `await new Promise(resolve => setTimeout(resolve, 2000))` | 2-second delay is the established pattern in `creditorContactService.js` (line 797) and `secondRoundEmailSender.js` |
| Zendesk internal comments | Custom Zendesk API calls | `ZendeskManager.addTicketComment(id, body, false)` | Normalized, handles string vs object body, already used throughout |
| Per-creditor subdocument update | Full document save | `Client.updateOne({ 'final_creditor_list.$.field': v })` with `_id` filter | Atomic positional update pattern established in `creditorContactService.js` lines 714–733 |

**Key insight:** The entire email-sending infrastructure for the second round is already implemented and battle-tested. Phase 33 is an orchestration layer, not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Status Guard Missing on SENT Transition
**What goes wrong:** If admin triggers send while another process is already running (e.g., double-click), `second_letter_status` becomes SENT prematurely with partial sends.
**Why it happens:** Plain `$set` without guard does not check current state.
**How to avoid:** Always use `findOneAndUpdate({ _id, second_letter_status: 'FORM_SUBMITTED' })` — if it returns `null`, another process won the race; log and return without error.
**Warning signs:** `modifiedCount: 0` on the status update when client IS in FORM_SUBMITTED state.

### Pitfall 2: SENT Transition When Some Creditors Failed
**What goes wrong:** If 4 of 5 creditors succeed but 1 fails after 3 retries, status is set to SENT — requirement SEND-05 says status must stay FORM_SUBMITTED on any failure.
**Why it happens:** Setting SENT based on "at least one success" instead of "all succeeded."
**How to avoid:** Track a boolean `allSucceeded = true`; set to `false` on any creditor exhaust. Only transition to SENT when `allSucceeded === true`.
**Warning signs:** Admin sees SENT status but Zendesk audit log shows a failed creditor.

### Pitfall 3: Zendesk Audit Failure Blocking Email Dispatch
**What goes wrong:** Zendesk API is temporarily down; `addTicketComment` throws; entire dispatch loop fails mid-way.
**Why it happens:** Awaiting Zendesk comment without try/catch inside the per-creditor loop.
**How to avoid:** Wrap every `addTicketComment` call in try/catch that only warns, never throws. Established pattern in `secondRoundEmailSender.js` lines 159–161 and `creditorContactService.js` lines 699–701.
**Warning signs:** Email sends succeed but loop stops before all creditors are processed.

### Pitfall 4: Missing Zendesk Ticket ID
**What goes wrong:** `addTicketComment` receives `undefined` as ticketId, causing Zendesk API to return a 404/400; if not caught, this terminates the loop.
**Why it happens:** The `main_zendesk_ticket_id` is stored per-creditor (`final_creditor_list.$.main_zendesk_ticket_id`) AND at the client root (`zendesk_ticket_id`). If the first round was processed differently, one or the other may be missing.
**How to avoid:** Resolve ticket ID with fallback: `client.zendesk_ticket_id || creditor.main_zendesk_ticket_id`. If both are null, skip comment with a warning — do not fail the send.
**Warning signs:** Comment added to wrong ticket or `undefined` ticket ID logged.

### Pitfall 5: Document Path Not Resolving for Attachment
**What goes wrong:** `fs.readFileSync(attachment.path)` throws ENOENT inside `creditorEmailService`; email fails for all creditors.
**Why it happens:** Phase 32 stores `second_letter_document_filename` (just the filename), but the dispatch needs the full path. The output directory for second round documents is `server/generated_documents/second_round/`.
**How to avoid:** Build the full path in the dispatch service: `path.join(__dirname, '../generated_documents/second_round/', creditor.second_letter_document_filename)`. Validate file exists with `fs.existsSync()` before calling send; fail fast with a clear error if missing.
**Warning signs:** Attachment size logged as 0 KB or `Failed to read attachment file` error in `creditorEmailService`.

### Pitfall 6: Creditor Matching by Index Instead of ID
**What goes wrong:** `final_creditor_list[i]` is used for positional `$` update but the index in the loop does not match the array index in MongoDB (possible if creditor list was modified).
**Why it happens:** Using loop index `i` for the MongoDB positional operator filter.
**How to avoid:** Filter by `'final_creditor_list._id': creditor._id` (the Mongoose-generated subdocument `_id`) in the `updateOne` call. Never use array index position for identification.

---

## Code Examples

Verified patterns from existing production code:

### sendSecondRoundEmail Call Signature
```javascript
// Source: server/services/creditorEmailService.js lines 184-243
const result = await creditorEmailService.sendSecondRoundEmail({
  recipientEmail: creditor.sender_email,         // creditor email address
  recipientName: creditor.creditor_name || creditor.sender_name,
  clientName: `${client.firstName} ${client.lastName}`,
  clientReference: client.aktenzeichen,
  attachment: {
    filename: 'AZ-1234_MusterGlaubi_2Anschreiben.docx',
    path: '/abs/path/to/generated_documents/second_round/AZ-1234_MusterGlaubi_2Anschreiben.docx'
  }
  // settlementDetails: optional, not required for 2. Anschreiben
});
// Returns: { success: boolean, emailId?: string, error?: string }
```

### Per-Creditor MongoDB Update Pattern
```javascript
// Source: server/services/creditorContactService.js lines 714-733
await Client.updateOne(
  {
    aktenzeichen: client.aktenzeichen,          // or _id: client._id
    'final_creditor_list._id': creditor._id     // subdocument _id for positional match
  },
  {
    $set: {
      'final_creditor_list.$.second_letter_sent_at': new Date(),
      'final_creditor_list.$.second_letter_email_sent_at': new Date(),
      'final_creditor_list.$.second_letter_document_filename': filename
    }
  }
);
```

### Atomic Status Transition with Guard
```javascript
// Source: STATE.md v10 Key Decisions — atomic findOneAndUpdate
const updated = await Client.findOneAndUpdate(
  { _id: client._id, second_letter_status: 'FORM_SUBMITTED' },
  {
    $set: {
      second_letter_status: 'SENT',
      second_letter_sent_at: new Date()
    }
  },
  { new: true }
);
if (!updated) {
  console.warn(`Status guard prevented duplicate SENT transition for ${client.aktenzeichen}`);
}
```

### Zendesk Internal Comment (Non-Blocking)
```javascript
// Source: server/services/secondRoundEmailSender.js lines 148-161
try {
  await zendesk.addTicketComment(
    mainTicketId,
    `📧 2. Anschreiben via Resend gesendet\n` +
    `• Empfänger: ${creditorName} (${creditorEmail})\n` +
    `• Dokument: ${filename}\n` +
    `• Resend ID: ${emailId}\n` +
    `• Zeitpunkt: ${new Date().toLocaleString('de-DE')}`,
    false // internal/private comment
  );
} catch (commentError) {
  console.warn(`⚠️ Failed to add Zendesk audit comment: ${commentError.message}`);
  // Do not rethrow — Zendesk failure must not block email dispatch
}
```

### Inter-Send Delay
```javascript
// Source: server/services/creditorContactService.js line 798
// and secondRoundEmailSender.js line 73
if (i < creditors.length - 1) {
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
}
```

### Admin Route Registration Pattern
```javascript
// Source: server/server.js lines 341–394
// In server.js — after existing admin route registrations:
const createAdminSecondLetterRouter = require('./routes/admin-second-letter');
app.use('/api/admin', createAdminSecondLetterRouter({
  Client: require('./models/Client'),
  creditorEmailService: require('./services/creditorEmailService')
}));
```

---

## Key Design Decision: secondLetterService vs. Inline Route Handler

The existing admin routes use a controller/service split for complex operations (e.g., `adminDashboardController`, `adminSettlementController`) but inline handlers for simpler operations (e.g., `admin-settlement.js` short handler methods). Given:

- Phase 33 has one endpoint (`POST /send-second-letter`)
- The dispatch logic is complex enough to warrant unit testing
- The service will be reused if a retry-individual-creditor endpoint is ever needed (Phase 34+ or v2)

**Recommendation:** Create `secondLetterService.js` as a standalone service class (mirroring `creditorContactService.js` structure) with a `dispatchSecondLetterEmails(clientId)` method. The route handler calls the service. This keeps route file thin and service logic independently testable.

---

## State Machine Context for Phase 33

Phase 33 operates on clients in `second_letter_status: 'FORM_SUBMITTED'` state. The trigger for dispatch is admin action (not automatic). The endpoint must:

1. Verify client is in `FORM_SUBMITTED` state — return 409 if not
2. Load `final_creditor_list` from client
3. For each creditor: find the pre-generated DOCX (from Phase 32), send email, update per-creditor fields
4. After all: atomically transition to SENT (only if all succeeded)

The endpoint is idempotent with respect to SENT transition (status guard prevents double-SENT). It is NOT idempotent with respect to individual emails — a second call while in FORM_SUBMITTED will re-send emails. This matches the requirement: retry capability is intentional; the admin can trigger again if partial failure occurred.

---

## Admin Alert Pattern (SEND-05)

No `sendAdminAlert` method exists in the codebase. The simplest compliant implementation:

```javascript
async function triggerAdminAlert(client, creditor, error) {
  // 1. Log prominently
  console.error(
    `❌ ADMIN ALERT: Failed to send 2. Anschreiben to ${creditor.creditor_name} ` +
    `for client ${client.aktenzeichen} after 3 attempts. Error: ${error}`
  );
  // 2. Add to Zendesk main ticket as internal comment (non-blocking)
  try {
    const zendesk = new ZendeskManager();
    const mainTicketId = client.zendesk_ticket_id;
    if (mainTicketId) {
      await zendesk.addTicketComment(
        mainTicketId,
        `⚠️ ADMIN-ALERT: E-Mail-Versand 2. Anschreiben fehlgeschlagen\n` +
        `• Gläubiger: ${creditor.creditor_name || creditor.sender_name}\n` +
        `• Fehler: ${error}\n` +
        `• Nach 3 Versuchen — manuelle Nachbearbeitung erforderlich`,
        false
      );
    }
  } catch (e) {
    console.error(`Failed to add admin alert to Zendesk: ${e.message}`);
  }
}
```

This produces an admin alert as required (SEND-05) without requiring new email infrastructure. The alert is visible both in server logs and in the Zendesk audit trail.

---

## Open Questions

1. **How does Phase 33 know which DOCX file corresponds to each creditor?**
   - What we know: Phase 32 generates DOCX files in `generated_documents/second_round/`, stores `second_letter_document_filename` per-creditor in `final_creditor_list`.
   - What's unclear: The exact field name Phase 32 will use — Phase 32 is not yet implemented.
   - Recommendation: Phase 33 planning must agree on the field name contract with Phase 32. The research assumes `second_letter_document_filename` per SCHEMA-04 in REQUIREMENTS.md.

2. **What is the `final_creditor_list` filter for "creditors to dispatch to"?**
   - What we know: Phase 32 (DOC-04) generates one DOCX per creditor and stores the filename. Phase 33 should send to creditors with a valid email address AND a generated document.
   - What's unclear: Should creditors without email addresses be skipped silently or flagged?
   - Recommendation: Mirror `creditorContactService.js` pattern — skip creditors without email, count as "no_email_manual_contact", do not fail the entire dispatch.

3. **What constitutes "all creditors dispatched" for the SENT transition?**
   - What we know: SEND-04 says "after all creditor emails sent without error." SEND-05 says status stays FORM_SUBMITTED if sending fails.
   - What's unclear: Does "without error" mean all creditors with email addresses, or all creditors in the list (including those without email)?
   - Recommendation: "All creditors with valid email addresses" — creditors with no email are expected-skips, not failures. Track skip vs fail separately.

---

## Sources

### Primary (HIGH confidence)
- `server/services/creditorEmailService.js` — `sendSecondRoundEmail()` signature, demo mode, matcher sync, dev fallback confirmed by reading full source
- `server/services/creditorContactService.js` — per-creditor MongoDB update pattern (lines 714–733), 2-second inter-email delay (line 798), Zendesk audit comment pattern (lines 687–701) confirmed by direct inspection
- `server/services/secondRoundEmailSender.js` — independent confirmation of `sendSecondRoundEmail()` call signature, Zendesk comment, retry context
- `server/services/zendeskManager.js` — `addTicketComment(ticketId, commentData, isPublic)` signature (lines 1177–1217)
- `server/models/Client.js` — `creditorSchema` fields (lines 130–214), `clientSchema` fields (lines 233–638), `main_zendesk_ticket_id` per-creditor, `zendesk_ticket_id` on client root
- `.planning/STATE.md` — v10 Key Decisions (atomic status guard, email: reuse creditorEmailService.sendSecondRoundEmail, demo mode, deprecate secondRoundManager)
- `.planning/REQUIREMENTS.md` — SEND-01 through SEND-06 requirements verbatim
- `server/server.js` — admin route mounting pattern (lines 328–394), factory pattern for dependency injection

### Secondary (MEDIUM confidence)
- `server/services/firstRoundDocumentGenerator.js` — output directory `generated_documents/first_round/`, filename generation pattern — second round will mirror at `generated_documents/second_round/`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from direct code inspection, no external dependencies needed
- Architecture patterns: HIGH — confirmed from existing production-grade patterns in `creditorContactService.js` and `secondRoundEmailSender.js`
- Pitfalls: HIGH — each pitfall was identified by tracing the actual code paths
- Open questions: MEDIUM — questions about Phase 32 contract are forward-looking and depend on Phase 32 implementation decisions

**Research date:** 2026-03-02
**Valid until:** Stable — this research is based on codebase inspection, not external library docs. Valid until Phase 32 is implemented (field name contract may need verification).
