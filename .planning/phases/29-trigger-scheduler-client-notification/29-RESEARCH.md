# Phase 29: Trigger, Scheduler & Client Notification - Research

**Researched:** 2026-03-02
**Domain:** Scheduler (setInterval), atomic MongoDB state transition, Resend email, token generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Admin Trigger UX
- Button placed on client detail page — action targets a single client at a time
- Confirmation dialog before triggering: "2. Anschreiben für [Client-Name] starten? Der Client wird per Email benachrichtigt."
- After successful trigger: Toast notification + immediate status badge update (IDLE → PENDING)
- Idempotency visible: if client is already PENDING, button is disabled with tooltip "Bereits ausgelöst"
- No bulk trigger — scheduler handles automatic mass processing, admin trigger is for individual overrides

#### Email Design & Content
- Formal "Sie"-Ansprache — consistent with the legal/financial context of Schuldnerberatung
- Reuse existing Resend email template (same layout, logo, footer as onboarding emails)
- Email explains context: warum Datenbestätigung nötig ist (2. Gläubigeranschreiben), was der Client tun soll, was danach passiert
- CTA-Button: "Daten bestätigen" — clear action-oriented label
- Subject line: "Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben"

### Claude's Discretion
- Scheduler implementation details (cron timing, batch processing approach)
- Token generation and expiry duration for deep-links
- Exact email body copy (within the decided tone and content guidelines)
- Error state handling in admin UI (network failures, server errors)
- Audit log storage format and data structure
- Toast notification duration and styling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRIG-01 | Scheduler prüft täglich: Clients mit MAX(email_sent_at) + 30 Tage <= heute AND second_letter_status == IDLE → setzt PENDING | setInterval pattern in scheduler.js; MongoDB query on final_creditor_list.email_sent_at; atomic findOneAndUpdate with status guard |
| TRIG-02 | Admin kann manuell 2. Anschreiben triggern (Button im Dashboard) → setzt PENDING + sendet Client-Notification | New POST route on /api/admin/clients/:clientId/trigger-second-letter; controller calls secondLetterService.triggerForClient() |
| TRIG-03 | Trigger ist idempotent — atomic findOneAndUpdate mit Status-Guard verhindert Doppelversand | findOneAndUpdate({ id: clientId, second_letter_status: 'IDLE' }, ..., { new: true }) returns null if already PENDING |
| TRIG-04 | Jede Trigger-Aktion wird mit User/System + Timestamp im Audit-Log erfasst | status_history.push({ id: uuidv4(), changed_by: 'admin'/'system', metadata: { actor, timestamp } }) — same pattern as delayedProcessingService |
| NOTIF-01 | Client bekommt Email via Resend: "Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben" | New method on emailService (not creditorEmailService); reuse HTML template structure from emailService.js |
| NOTIF-02 | Email enthält Deep-Link zum Portal-Formular (mit Token für Authentifizierung) | second_letter_form_token field (Phase 28 schema); token = uuidv4(); stored on client; URL = portal_base_url + /second-letter?token=... |
| NOTIF-03 | Keine doppelten Notifications — Guard prüft ob bereits PENDING | The atomic findOneAndUpdate status guard (TRIG-03) is the primary dedup mechanism; email only sent after successful state transition |
</phase_requirements>

## Summary

Phase 29 introduces two trigger paths (admin manual + daily scheduler) that transition an eligible client from `IDLE` to `PENDING` in the `second_letter_status` state machine. Both paths share a single idempotent transition function backed by an atomic `findOneAndUpdate` with a `{ second_letter_status: 'IDLE' }` filter — if the document is already `PENDING` or beyond, the update matches nothing, the email is not sent, and the caller receives a clear "already triggered" signal. After a successful transition the client receives a Resend email containing a short-lived token-based deep-link to the portal form (Phase 30). Every trigger action writes an entry to `status_history`, which is the existing audit mechanism across the entire codebase.

The scheduler extends the existing `Scheduler` class in `server/scheduler.js` using the established `setInterval` pattern — no `node-cron` dependency. The admin trigger is a new Express route/controller following the factory pattern used by every other admin route in the codebase. The client notification email is a new method on `emailService.js` (the client-facing Resend service) rather than `creditorEmailService.js` (which is for creditor-outbound mail).

Phase 28 is a hard prerequisite: `second_letter_status`, `second_letter_triggered_at`, and `second_letter_form_token` must exist on the Client model before any service code in Phase 29 can operate. Because Phase 28 has not yet been executed, research treats those fields as defined but not yet present in the live model.

**Primary recommendation:** Implement a `secondLetterTriggerService.js` that owns the atomic transition + email dispatch + audit log write. Both the scheduler and the admin route call this single service — code is not duplicated between the two trigger paths.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | Already in project | Atomic `findOneAndUpdate` with filter guard | Project standard ORM; `findOneAndUpdate` is the established idempotency primitive |
| uuid (v4) | Already in project (`const { v4: uuidv4 } = require('uuid')`) | Generate `second_letter_form_token` and `status_history.id` | Used throughout delayedProcessingService, adminClientCreditorController, webhookController |
| resend | Already in project (initialized in emailService.js + creditorEmailService.js) | Send client notification email | Existing Resend SDK singleton already configured with API key fallback to console-log dev mode |
| Node.js built-in setInterval | N/A (Node core) | Daily scheduler loop | Existing pattern in scheduler.js; STATE.md explicitly says "setInterval in scheduler.js (no node-cron)" |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto.randomBytes (Node built-in) | N/A | Alternative to uuidv4 for token generation | Only if higher-entropy hex token preferred; uuidv4 is already the project standard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| setInterval | node-cron | node-cron gives cleaner cron expressions (e.g., `0 6 * * *`) but adds a dependency; STATE.md locks setInterval |
| uuidv4 token | JWT with exp claim | JWT would embed expiry and clientId, reducing DB lookup; but project uses separate DB fields (portal_token, session_token) for tokens; uuidv4 + DB expiry field matches the existing pattern |
| status_history push (embedded) | Separate AuditLog model | Separate model is cleaner at scale but adds a DB collection; every existing audit log in the codebase uses status_history on the Client document |

**Installation:** No new packages needed — all required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
server/
├── services/
│   └── secondLetterTriggerService.js   # NEW: owns atomic transition + email + audit log
├── routes/
│   └── admin-second-letter.js          # NEW: POST /trigger route, factory pattern
├── controllers/
│   └── adminSecondLetterController.js  # NEW: req/res handler, calls service
└── scheduler.js                        # MODIFY: add daily 30-day check interval
```

### Pattern 1: Atomic Idempotent State Transition
**What:** `findOneAndUpdate` with a status filter as the first write. If the filter doesn't match (client already PENDING+), the function returns `null` without sending email.
**When to use:** Any trigger entry point — both admin and scheduler call this same function.
**Example:**
```javascript
// server/services/secondLetterTriggerService.js
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const emailService = require('./emailService');

class SecondLetterTriggerService {
  async triggerForClient(clientId, actor = 'system') {
    // 1. Atomic transition: only succeeds if status is currently IDLE
    const client = await Client.findOneAndUpdate(
      { id: clientId, second_letter_status: 'IDLE' },
      {
        $set: {
          second_letter_status: 'PENDING',
          second_letter_triggered_at: new Date(),
          second_letter_form_token: uuidv4(),
          second_letter_form_token_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        },
        $push: {
          status_history: {
            id: uuidv4(),
            status: 'second_letter_pending',
            changed_by: actor === 'system' ? 'system' : 'admin',
            metadata: {
              actor,
              reason: 'second_letter_trigger',
              triggered_at: new Date()
            },
            created_at: new Date()
          }
        }
      },
      { new: true }
    );

    // 2. If null: client was already PENDING or beyond — idempotency guard
    if (!client) {
      const existing = await Client.findOne({ id: clientId }, { second_letter_status: 1 });
      return {
        success: false,
        alreadyTriggered: true,
        currentStatus: existing?.second_letter_status || 'unknown'
      };
    }

    // 3. Send notification email
    const portalUrl = `${process.env.PORTAL_BASE_URL}/second-letter?token=${client.second_letter_form_token}`;
    const emailResult = await emailService.sendSecondLetterNotification(
      client.email,
      `${client.firstName} ${client.lastName}`,
      portalUrl,
      client.aktenzeichen
    );

    return {
      success: true,
      clientId: client.id,
      aktenzeichen: client.aktenzeichen,
      emailSent: emailResult.success,
      emailId: emailResult.emailId
    };
  }
}

module.exports = new SecondLetterTriggerService();
```

### Pattern 2: Daily Scheduler Check (30-day window)
**What:** `setInterval` at 24-hour intervals finds all clients eligible for auto-trigger and calls `triggerForClient` for each.
**When to use:** Runs on server startup; processes IDLE clients where `MAX(final_creditor_list.email_sent_at) + 30 days <= now`.
**Example:**
```javascript
// server/scheduler.js — add inside startScheduledTasks()
const SECOND_LETTER_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

setInterval(async () => {
  try {
    console.log('\n⏰ Running scheduled 2. Anschreiben eligibility check...');
    const result = await this.secondLetterTriggerService.checkAndTriggerEligible();
    console.log(`✅ 2. Anschreiben check complete: ${result.triggered} triggered, ${result.skipped} skipped\n`);
  } catch (error) {
    console.error('❌ Error in scheduled 2. Anschreiben check:', error);
  }
}, SECOND_LETTER_CHECK_INTERVAL);

// Run initial check after 10 minutes (consistent with other initial checks)
setTimeout(async () => {
  const result = await this.secondLetterTriggerService.checkAndTriggerEligible();
  console.log(`✅ Initial 2. Anschreiben check: ${result.triggered} triggered`);
}, 10 * 60 * 1000);
```

### Pattern 3: MongoDB Aggregation for 30-day Eligibility Query
**What:** Find clients where `second_letter_status == 'IDLE'` AND the maximum `email_sent_at` across all `final_creditor_list` entries is 30+ days ago.
**When to use:** In `checkAndTriggerEligible()` inside the service.
**Example:**
```javascript
// In secondLetterTriggerService.js
async checkAndTriggerEligible() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Find IDLE clients where at least one creditor has email_sent_at set
  // AND the most recent email_sent_at is 30+ days ago
  const eligibleClients = await Client.find({
    second_letter_status: 'IDLE',
    'final_creditor_list': { $elemMatch: { email_sent_at: { $lte: thirtyDaysAgo } } }
  }).select('id aktenzeichen firstName lastName email final_creditor_list');

  // Filter in JS: only clients where MAX(email_sent_at) <= thirtyDaysAgo
  const filtered = eligibleClients.filter(client => {
    const sentDates = client.final_creditor_list
      .map(c => c.email_sent_at)
      .filter(Boolean)
      .map(d => new Date(d));
    if (sentDates.length === 0) return false;
    const maxSentAt = new Date(Math.max(...sentDates));
    return maxSentAt <= thirtyDaysAgo;
  });

  let triggered = 0, skipped = 0, errors = 0;
  for (const client of filtered) {
    try {
      const result = await this.triggerForClient(client.id, 'system');
      result.success ? triggered++ : skipped++;
    } catch (err) {
      console.error(`❌ Error triggering ${client.aktenzeichen}:`, err.message);
      errors++;
    }
  }

  return { triggered, skipped, errors, total: filtered.length };
}
```

### Pattern 4: Admin Route — Factory Pattern
**What:** Route file exports a factory function receiving dependencies; controller is a factory function matching the pattern of `adminClientCreditorController.js`, `adminReviewController.js`, etc.
**When to use:** All new admin routes follow this factory pattern.
**Example:**
```javascript
// server/routes/admin-second-letter.js
const express = require('express');
const router = express.Router();
const createAdminSecondLetterController = require('../controllers/adminSecondLetterController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

module.exports = ({ secondLetterTriggerService }) => {
  const controller = createAdminSecondLetterController({ secondLetterTriggerService });

  router.post(
    '/clients/:clientId/trigger-second-letter',
    rateLimits.admin,
    authenticateAdmin,
    controller.triggerSecondLetter
  );

  return router;
};
```

**Mount in server.js:**
```javascript
const createAdminSecondLetterRouter = require('./routes/admin-second-letter');
// ...
app.use('/api/admin', createAdminSecondLetterRouter({ secondLetterTriggerService }));
```

### Pattern 5: Client Notification Email — New Method on emailService.js
**What:** A new method `sendSecondLetterNotification()` added to the existing `EmailService` class in `emailService.js`. Uses the same Resend singleton, same HTML structure (logo, header, CTA button, footer), same dev-mode console-log fallback.
**When to use:** Called from `secondLetterTriggerService.js` after successful state transition.
**Example:**
```javascript
// In emailService.js — add to EmailService class
async sendSecondLetterNotification(email, clientName, portalUrl, aktenzeichen) {
  const subject = 'Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben';
  const html = this.generateSecondLetterNotificationHtml(clientName, portalUrl, aktenzeichen);
  const text = this.generateSecondLetterNotificationText(clientName, portalUrl, aktenzeichen);

  if (!this.resend) {
    console.log('\n📧 SECOND LETTER NOTIFICATION (DEV MODE)');
    console.log(`📧 To: ${email}`);
    console.log(`📧 Portal URL: ${portalUrl}`);
    return { success: true, devMode: true };
  }

  try {
    const response = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: email,
      subject,
      html,
      text
    });
    return { success: true, emailId: response.data?.id || response.id };
  } catch (error) {
    console.error(`❌ Failed to send second letter notification:`, error.message);
    return { success: false, error: error.message };
  }
}
```

**HTML template key elements (matching existing emailService.js structure):**
- Logo: `https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png` (same as verification email)
- Background: `#f5f5f5`, card: `#ffffff`, radius `12px`, shadow `0 2px 8px rgba(0,0,0,0.08)`
- Salutation: `Sehr geehrte/r ${clientName}`
- Body: explains purpose (2. Gläubigeranschreiben preparation), what action is needed, what happens next
- CTA Button: "Daten bestätigen" — links to `portalUrl`; style: `background-color: #111827` (matching existing "Jetzt anmelden" button in emailService.js)
- Footer: Impressum + Datenschutz links, Aktenzeichen reference

### Pattern 6: Admin Controller — triggerSecondLetter Handler
**What:** Express request handler; validates clientId, calls service, handles already-triggered case, returns appropriate response.
**Example:**
```javascript
// server/controllers/adminSecondLetterController.js
const createAdminSecondLetterController = ({ secondLetterTriggerService }) => {

  const triggerSecondLetter = async (req, res) => {
    try {
      const { clientId } = req.params;
      const actor = req.adminId || 'admin';

      const result = await secondLetterTriggerService.triggerForClient(clientId, actor);

      if (result.alreadyTriggered) {
        // 200 (not 409) — idempotent endpoint, caller should handle gracefully
        return res.json({
          success: false,
          alreadyTriggered: true,
          currentStatus: result.currentStatus,
          message: 'Client ist bereits im Status ' + result.currentStatus
        });
      }

      return res.json({
        success: true,
        clientId: result.clientId,
        aktenzeichen: result.aktenzeichen,
        emailSent: result.emailSent
      });
    } catch (error) {
      console.error('❌ Error triggering second letter:', error);
      return res.status(500).json({ error: 'Failed to trigger second letter', details: error.message });
    }
  };

  return { triggerSecondLetter };
};

module.exports = createAdminSecondLetterController;
```

### Anti-Patterns to Avoid
- **Read-then-write for idempotency:** Never do `findOne` to check status, then `findOneAndUpdate` to update. Race condition window. Use a single `findOneAndUpdate` with a status filter in the query.
- **Sending email before state transition:** Email must only fire after the `findOneAndUpdate` returns a non-null document. If you send email first, a DB failure leaves an orphaned email with no PENDING state.
- **Calling `client.save()` instead of `findOneAndUpdate`:** `.save()` is not atomic for the status guard pattern. It would require a manual concurrency check.
- **Injecting secondLetterTriggerService as a new class instance into Scheduler constructor:** Prefer passing as a dependency (matching how `documentReminderService` and `loginReminderService` are passed to the Scheduler constructor in `server.js`).
- **Using `creditorEmailService.js` for the client notification:** That service is for outbound creditor email (with DOCX attachments, CC to insolvenz@ra-scuric.de, matcher sync). Client portal notifications belong in `emailService.js`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency / double-send prevention | Manual read-check-write | `findOneAndUpdate` with filter `{ second_letter_status: 'IDLE' }` | MongoDB atomic operation; handles concurrent requests from scheduler and admin simultaneously |
| Cron scheduling | node-cron, agenda, bull | `setInterval` in scheduler.js | STATE.md locks this; project already has 5 setIntervals in scheduler.js |
| Token generation | Custom PRNG | `uuidv4()` from `uuid` package | Already installed; used everywhere in the codebase for IDs and session tokens |
| Email sending | Custom SMTP | Resend SDK (already initialized in emailService.js) | Dev mode fallback already implemented; API key configuration already handled |
| Audit logging | Separate collection | `status_history.push()` on Client document | Every other audit event in the codebase uses status_history |

**Key insight:** All necessary infrastructure already exists. This phase is about wiring existing patterns together, not building new primitives.

---

## Common Pitfalls

### Pitfall 1: MAX(email_sent_at) Computed in Application vs. Database
**What goes wrong:** MongoDB `$max` aggregation on an array of subdocument dates is possible but complex. If done in the query itself (aggregation pipeline), it requires `$project + $max + $filter` stages. Getting it wrong silently over- or under-triggers.
**Why it happens:** `email_sent_at` lives on `final_creditor_list[].email_sent_at` (array of subdocuments). There is no top-level "max_email_sent_at" field on the Client document.
**How to avoid:** Use a two-step approach: first query `{ second_letter_status: 'IDLE', 'final_creditor_list': { $elemMatch: { email_sent_at: { $lte: thirtyDaysAgo } } } }` to get candidate clients efficiently (uses index on `email_sent_at`), then filter in JavaScript with `Math.max(...dates)` to compute the true MAX. This is safe because the scheduler runs on server-side with no external concurrency risk.
**Warning signs:** Scheduler triggering clients who had their first creditor contacted 30 days ago but others were contacted more recently. Add an explicit log of `maxSentAt` per client during scheduler runs.

### Pitfall 2: Email Sent Before State Persisted
**What goes wrong:** Network failure or crash between email send and DB write leaves client with an email in their inbox but still in IDLE state. Next scheduler run triggers again.
**Why it happens:** The temptation to send email first (optimistic), then write DB.
**How to avoid:** ALWAYS `findOneAndUpdate` (which atomically writes the PENDING state and the token) BEFORE sending email. If the email fails after the state write, the client is stuck PENDING but has not been double-emailed. Admin can re-send; this is recoverable.

### Pitfall 3: Token Missing from Phase 28 Schema
**What goes wrong:** `second_letter_form_token` and `second_letter_form_token_expires_at` must be defined on the Client model (Phase 28) before Phase 29 service code runs. If Phase 28 is incomplete, the `$set` in `findOneAndUpdate` will silently drop unknown fields (Mongoose strict mode) OR throw an error.
**Why it happens:** Phase 28 and 29 are developed sequentially; it is easy to start Phase 29 assuming Phase 28 was fully executed.
**How to avoid:** Verify the Client model schema contains `second_letter_form_token: String` and `second_letter_form_token_expires_at: Date` before writing service code. Check `server/models/Client.js` at start of Phase 29 implementation.
**Warning signs:** `findOneAndUpdate` returns the document but `client.second_letter_form_token` is `undefined` after the update.

### Pitfall 4: Scheduler Dependency Injection
**What goes wrong:** `secondLetterTriggerService` is a singleton required directly inside `scheduler.js` rather than injected as a dependency. This creates a tight coupling and makes testing harder.
**Why it happens:** Convenient one-liner `require('./services/secondLetterTriggerService')`.
**How to avoid:** Follow the exact pattern used for `documentReminderService` and `loginReminderService`: pass `secondLetterTriggerService` as a dependency to the `Scheduler` constructor in `server.js`, and store it as `this.secondLetterTriggerService` on the Scheduler instance.

### Pitfall 5: Admin Route Returns 409 for Already-Triggered
**What goes wrong:** Returning `HTTP 409 Conflict` when the client is already PENDING causes RTK Query / frontend fetch to treat it as an error and show an error toast — but "already triggered" is expected behavior (admin clicked twice, or scheduler already ran).
**Why it happens:** Mapping "already exists" to 409 is a common REST pattern, but here it degrades UX.
**How to avoid:** Return `HTTP 200` with `{ success: false, alreadyTriggered: true, currentStatus: 'PENDING' }`. The frontend reads `alreadyTriggered` to display the "Bereits ausgelöst" tooltip rather than an error toast.

### Pitfall 6: Frontend Reflects Stale Status After Trigger
**What goes wrong:** Admin clicks button, API returns 200, but the client detail page still shows IDLE badge because the component hasn't refetched.
**Why it happens:** RTK Query cache is not invalidated after the mutation.
**How to avoid:** In the frontend mutation definition (RTK Query), add `invalidatesTags` with the client detail cache tag so the status badge updates immediately after a successful trigger. Alternatively, update the local cache optimistically.

---

## Code Examples

Verified patterns from project codebase:

### Atomic findOneAndUpdate with Status Guard (from adminReviewController.js)
```javascript
// Source: server/controllers/adminReviewController.js:61
const client = await Client.findOneAndUpdate(
  { id: clientId },               // filter
  { $set: { review_assignment: { ... } } },  // update
  { new: true }                   // return updated document
);
if (!client) {
  return res.status(404).json({ error: 'Client not found' });
}
```
For Phase 29, add a status guard to the filter:
```javascript
// Idempotent version: only matches if status is IDLE
const client = await Client.findOneAndUpdate(
  { id: clientId, second_letter_status: 'IDLE' },
  { $set: { second_letter_status: 'PENDING', ... }, $push: { status_history: { ... } } },
  { new: true }
);
// null means client was not IDLE — idempotency guard fired
```

### status_history Push (from delayedProcessingService.js)
```javascript
// Source: server/services/delayedProcessingService.js:35
client.status_history.push({
  id: uuidv4(),
  status: 'processing_complete_webhook_scheduled',
  changed_by: 'system',
  metadata: {
    scheduled_for: scheduledTime,
    delay_hours: delay,
    reason: 'Giving client time to upload additional documents',
    document_id: documentId
  }
});
```
For Phase 29 (admin trigger):
```javascript
{
  id: uuidv4(),
  status: 'second_letter_pending',
  changed_by: 'admin',
  metadata: {
    actor: req.adminId || 'admin',
    reason: 'admin_manual_trigger',
    triggered_at: new Date().toISOString()
  },
  created_at: new Date()
}
```
For Phase 29 (scheduler trigger):
```javascript
{
  id: uuidv4(),
  status: 'second_letter_pending',
  changed_by: 'system',
  metadata: {
    actor: 'scheduler',
    reason: 'auto_30_day_trigger',
    triggered_at: new Date().toISOString(),
    days_since_last_email: Math.floor(daysSinceMax)
  },
  created_at: new Date()
}
```

### Resend Email with Dev Mode Fallback (from emailService.js)
```javascript
// Source: server/services/emailService.js — sendDocumentRequestEmail pattern
if (!this.resend) {
  console.log('\n📧 SECOND LETTER NOTIFICATION (DEV MODE)');
  console.log(`📧 To: ${email}`);
  console.log(`📧 Subject: ${subject}`);
  console.log(`📧 Portal URL: ${portalUrl}`);
  return { success: true, devMode: true };
}

const response = await this.resend.emails.send({
  from: `${this.fromName} <${this.fromEmail}>`,
  to: email,
  subject,
  html,
  text
});
// Resend SDK v6.x: response.data?.id || response.id
const emailId = response.data?.id || response.id;
return { success: true, emailId };
```

### Scheduler setInterval Pattern (from scheduler.js)
```javascript
// Source: server/scheduler.js — existing pattern
const INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

setInterval(async () => {
  try {
    console.log('\n⏰ Running scheduled 2. Anschreiben check...');
    const result = await this.secondLetterTriggerService.checkAndTriggerEligible();
    console.log(`✅ 2. Anschreiben check: ${result.triggered} triggered\n`);
  } catch (error) {
    console.error('❌ Error in 2. Anschreiben check:', error);
  }
}, INTERVAL);
```

### Scheduler Constructor Injection (from server.js)
```javascript
// Source: server/server.js:530
const scheduler = new Scheduler({
  documentReminderService,
  loginReminderService
  // ADD: secondLetterTriggerService
});
scheduler.startScheduledTasks();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zendesk Side Conversations for client emails | Resend SDK direct email (emailService.js) | Previous phases | Phase 29 uses Resend, NOT Zendesk |
| second-round-api.js + secondRoundManager.js | New secondLetterTriggerService.js (state-machine-aware) | v10 architectural decision | Do NOT extend or reuse second-round-api.js — deprecated per STATE.md |
| Individual client.save() calls for state updates | Atomic findOneAndUpdate for idempotent transitions | Established pattern in documentQueueService.js, webhookQueueService.js | Required for concurrent trigger safety |

**Deprecated/outdated:**
- `server/routes/second-round-api.js`: Routes for old Zendesk-based second round. Add deprecation comment, do not extend.
- `server/services/secondRoundManager.js`: Zendesk-centric orchestrator. Do not use as pattern for new work.
- `server/services/secondRoundEmailSender.js`: Part of old second-round stack. Do not use.

---

## Open Questions

1. **Phase 28 completion status**
   - What we know: Phase 28 (State Machine Foundation) is "Not Started" per STATE.md as of 2026-03-02
   - What's unclear: Whether Phase 28 will be fully complete before Phase 29 begins
   - Recommendation: Phase 29 implementation MUST wait for Phase 28's Client model migration. Add a schema check comment at the top of secondLetterTriggerService.js as a reminder.

2. **PORTAL_BASE_URL environment variable**
   - What we know: `emailService.js` hardcodes `https://mandanten-portal.onrender.com/login` in `generateDocumentRequestEmailHtml`; there is no `PORTAL_BASE_URL` env var in the current codebase
   - What's unclear: Whether Phase 30 form will live at a predictable URL on the existing CRA portal
   - Recommendation: Use `process.env.PORTAL_BASE_URL || 'https://mandanten-portal.onrender.com'` as the base, appending `/second-letter?token=TOKEN`. Planner should add `PORTAL_BASE_URL` to the server's `.env` setup task, or document the hardcoded fallback.

3. **Token expiry field name on Client model**
   - What we know: STATE.md says "second_letter_form_token (short-lived, 14 days)" and the schema must be defined in Phase 28
   - What's unclear: Whether Phase 28 will add `second_letter_form_token_expires_at` (for server-side expiry validation) in addition to the token itself
   - Recommendation: The trigger service should set both `second_letter_form_token` and `second_letter_form_token_expires_at` regardless. Phase 30 will validate against the expiry field.

4. **Scheduler initial boot delay**
   - What we know: Existing services run initial checks 1–5 minutes after server start to avoid blocking startup
   - What's unclear: Whether a 30-day check should run on every server restart (potentially triggering many clients after a deployment)
   - Recommendation: Use a 10-minute initial delay for the first scheduler run. This matches the "soft start" pattern without waiting as long as 6 hours.

---

## Sources

### Primary (HIGH confidence)
- Direct code reading of `server/scheduler.js` — setInterval pattern, constructor injection
- Direct code reading of `server/services/emailService.js` — Resend SDK singleton, dev mode, HTML template structure, `sendDocumentRequestEmail` as the closest existing analogue
- Direct code reading of `server/services/creditorEmailService.js` — Resend SDK v6.x response shape (`response.data?.id || response.id`)
- Direct code reading of `server/models/Client.js` — `status_history` schema, `final_creditor_list[].email_sent_at` field, `portal_token` as precedent for token fields
- Direct code reading of `server/services/delayedProcessingService.js` — `status_history.push` audit log pattern, `findOne` + `.save()` pattern (to contrast with the superior `findOneAndUpdate` approach)
- Direct code reading of `server/controllers/adminReviewController.js` — `findOneAndUpdate` controller pattern
- Direct code reading of `server/controllers/adminClientCreditorController.js` — `status_history.push` with `changed_by: 'admin'` and `metadata.added_by: req.adminId`
- Direct code reading of `server/server.js` — route mounting pattern, Scheduler instantiation
- Direct code reading of `server/middleware/auth.js` — `req.adminId` is set by `authenticateAdmin`
- `.planning/STATE.md` — locked architectural decisions (setInterval, no node-cron; token is dedicated field not portal_token; atomic findOneAndUpdate)
- `.planning/REQUIREMENTS.md` — TRIG-01 through TRIG-04, NOTIF-01 through NOTIF-03

### Secondary (MEDIUM confidence)
- `.planning/phases/28-state-machine-foundation/28-CONTEXT.md` — Schema field names (`second_letter_form_token`, `second_letter_triggered_at`) and idempotency pattern
- `.planning/phases/29-trigger-scheduler-client-notification/29-CONTEXT.md` — Locked UX and email content decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; no new dependencies
- Architecture: HIGH — all patterns verified by reading actual code; no speculation
- Pitfalls: HIGH — root causes traced to real code patterns; atomic operation semantics verified
- Scheduler query logic: MEDIUM — MAX(email_sent_at) approach validated by reading the field structure in Client.js, but the aggregation approach was not tested against a live DB; recommend verifying with a test script before production

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable patterns; only risk is Phase 28 schema changes)
