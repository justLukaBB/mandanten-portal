# Architecture Research

**Domain:** Insolvency case management — automated 2. Anschreiben workflow integration
**Researched:** 2026-03-02
**Confidence:** HIGH — based on direct codebase inspection of all integration points

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                             │
├───────────────────────────────┬──────────────────────────────────┤
│  Admin Portal (Vite/React)    │  Client Portal (CRA/React)       │
│  MandantenPortalDesign/src/   │  src/                            │
│                               │                                  │
│  ┌──────────────────────┐     │  ┌──────────────────────┐        │
│  │ ClientDetail         │     │  │ FinancialDataForm     │        │
│  │  + SecondLetterPanel │ NEW │  │ ExtendedFinancialWiz  │        │
│  └──────────────────────┘     │  │ SecondLetterForm  NEW │        │
│                               │  └──────────────────────┘        │
│  ┌──────────────────────┐     │                                  │
│  │ LetterTrackingPage   │     │  Pattern: axios + /api proxy     │
│  │  (existing 1. round) │     │  Auth: cookie/session token      │
│  └──────────────────────┘     │                                  │
│                               │                                  │
│  RTK Query: clientDetailApi   │                                  │
│  baseApi → /api proxy → :10000│                                  │
└───────────────────────────────┴──────────────────────────────────┘
                        │ /api/* → :10000
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express :10000)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ROUTES (new for 2. Anschreiben)                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ POST /api/admin/clients/:id/trigger-second-letter   NEW  │     │
│  │ POST /api/admin/clients/:id/send-second-letter      NEW  │     │
│  │ GET  /api/admin/clients/:id/second-letter-status    NEW  │     │
│  │ GET  /api/clients/:id/second-letter-form            NEW  │     │
│  │ POST /api/clients/:id/second-letter-form            NEW  │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  SERVICES (new for 2. Anschreiben)                                │
│  ┌──────────────────────┐  ┌──────────────────────────────┐      │
│  │ secondLetterService  │  │ secondRoundDocumentGenerator  │      │
│  │ (orchestrator)   NEW │  │ (mirrors firstRound*)     NEW │      │
│  └──────────────────────┘  └──────────────────────────────┘      │
│  ┌──────────────────────────────────────────────────────┐        │
│  │ secondLetterSchedulerService (30-day check)      NEW │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                   │
│  SERVICES (existing, reused as-is)                                │
│  ┌────────────────────┐  ┌──────────────────────────────────┐    │
│  │ creditorEmailService│  │ firstRoundDocumentGenerator      │    │
│  │ .sendSecondRound() │  │ (reference template only)        │    │
│  └────────────────────┘  └──────────────────────────────────┘    │
│                                                                   │
│  SCHEDULER                                                        │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ scheduler.js — add setInterval for 30-day check    MOD │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────────────┐
│                     DATA LAYER (MongoDB)                          │
├──────────────────────────────────────────────────────────────────┤
│  Client model additions:                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ second_letter_status: String (enum state machine)    NEW  │    │
│  │ second_letter_triggered_at: Date                     NEW  │    │
│  │ second_letter_client_notified_at: Date               NEW  │    │
│  │ second_letter_sent_at: Date                          NEW  │    │
│  │ second_letter_snapshot: { subdocument }              NEW  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  creditorSchema additions (per-creditor tracking):               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ second_letter_sent_at: Date                          NEW  │    │
│  │ second_letter_document_filename: String              NEW  │    │
│  │ second_letter_email_sent_at: Date                    NEW  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────────────┐
│               EXTERNAL SERVICES (existing, reused)                │
│  Resend SDK → sendSecondRoundEmail() already implemented          │
│  Creditor-email-matcher sync → syncToMatcher() already wired      │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New vs Modified |
|-----------|----------------|-----------------|
| `second_letter_status` on Client | State machine driving all eligibility and UI | NEW field on existing model |
| `second_letter_snapshot` on Client | Immutable audit record of calculation at time of send | NEW subdocument |
| `secondLetterService.js` | Main orchestrator: eligibility, client notification, generate DOCX, send emails | NEW service |
| `secondRoundDocumentGenerator.js` | docxtemplater pipeline for Ratenplan + Nullplan templates | NEW service |
| `secondLetterSchedulerService.js` | MongoDB query for clients where MAX(email_sent_at) >= 30 days, batch trigger | NEW service |
| `scheduler.js` | Register new scheduled check every 6 hours | MODIFIED |
| `creditorEmailService.sendSecondRoundEmail()` | Send 2nd round email to creditor with DOCX attachment | EXISTING — no changes |
| `admin-second-letter.js` (route) | Admin trigger, manual send, status check endpoints | NEW route file |
| `client-portal.js` (route) | Add GET + POST for second-letter-form | MODIFIED |
| `SecondLetterPanel` (admin component) | Status badge, trigger/send actions inside ClientDetail | NEW component |
| `SecondLetterForm.tsx` (client component) | Pre-filled form in CRA portal — confirm/correct financial data | NEW component |
| `clientDetailApi.ts` | Add `triggerSecondLetter`, `sendSecondLetter`, `getSecondLetterStatus` mutations | MODIFIED |
| `types.ts` | Add `second_letter_status` and `second_letter_snapshot` to `ClientDetailData` | MODIFIED |

## Recommended Project Structure

```
server/
├── services/
│   ├── firstRoundDocumentGenerator.js        # existing — reference template only
│   ├── secondRoundDocumentGenerator.js       # NEW — mirrors firstRound class pattern
│   ├── secondLetterService.js                # NEW — main orchestrator
│   └── secondLetterSchedulerService.js       # NEW — 30-day eligibility checker
├── routes/
│   ├── admin-second-letter.js                # NEW — admin trigger + status + send
│   └── client-portal.js                      # MODIFIED — add 2 second-letter-form routes
├── models/
│   └── Client.js                             # MODIFIED — add second_letter_* fields
└── scheduler.js                              # MODIFIED — add 6-hour setInterval block

MandantenPortalDesign/src/
├── app/
│   └── components/
│       └── second-letter-panel.tsx           # NEW — admin UI, plugs into ClientDetail
└── store/api/
    └── clientDetailApi.ts                    # MODIFIED — add 3 RTK Query endpoints

src/  (CRA — client portal)
└── components/
    └── SecondLetterForm.tsx                  # NEW — financial data confirmation form
```

### Structure Rationale

- **secondRoundDocumentGenerator.js:** New file that mirrors the class structure of `firstRoundDocumentGenerator.js` (same constructor shape, same method names). The two generators stay independently testable and make template variable differences explicit. Do not extend or import firstRoundDocumentGenerator.
- **secondLetterService.js:** Single orchestrator, following the pattern of `creditorContactService.js`. Business logic lives here, not scattered across routes.
- **secondLetterSchedulerService.js:** Separate file, consistent with `DelayedProcessingService` pattern already used in scheduler.js. Scheduler itself stays thin.
- **admin-second-letter.js:** New route file rather than extending admin-client-creditor.js. Keeps concerns separated, follows existing one-file-per-domain route convention.
- **SecondLetterPanel:** Panel inside ClientDetail rather than a separate page. The 2. Anschreiben is client-scoped; it belongs alongside existing tabs in the detail view.

## Architectural Patterns

### Pattern 1: State Machine on Client Model

**What:** `second_letter_status` enum on Client drives eligibility checks, UI state, and guards against double-triggering.
**When to use:** Any multi-step async workflow where re-entrancy must be prevented.
**Trade-offs:** Simple to query and display as badge. No extra collections. MongoDB atomic update provides the guard.

State transitions:
```
IDLE           (default — not yet triggered)
  → PENDING       (scheduler or admin triggered; notification email sent to client)
  → FORM_SUBMITTED (client completes SecondLetterForm)
  → IN_REVIEW     (admin has the snapshot, reviewing before send)
  → SENT          (DOCX generated, emailed to all creditors)
  → SKIPPED       (admin decides not to send this round)
```

Guard implementation (mirrors dedup guard in existing codebase):
```javascript
// secondLetterService.js — atomic state transition, prevents double-trigger
async triggerSecondLetter(clientId) {
  const client = await Client.findOneAndUpdate(
    { _id: clientId, second_letter_status: 'IDLE' },
    { $set: {
        second_letter_status: 'PENDING',
        second_letter_triggered_at: new Date()
      }
    },
    { new: true }
  );
  if (!client) throw new Error('Client not eligible or already triggered');
  // Continue to send notification email to client...
}
```

### Pattern 2: Snapshot Subdocument for Audit

**What:** Before generating the DOCX and sending emails, capture an immutable copy of the financial calculation on the Client document.
**When to use:** Any time a business decision is communicated externally and must be auditable (amount agreed to, plan sent).
**Trade-offs:** Denormalized but intentional — the letter reflects data *at time of sending*, not current data which may change.

Schema addition to Client.js:
```javascript
second_letter_snapshot: {
  captured_at: Date,
  determined_plan_type: { type: String, enum: ['nullplan', 'ratenzahlung'] },
  pfaendbar_amount: Number,
  plan_duration_months: Number,
  financial_data: mongoose.Schema.Types.Mixed,      // deep copy
  extended_financial_data: mongoose.Schema.Types.Mixed,
  creditor_calculations: [{
    creditor_id: String,
    creditor_name: String,
    claim_amount: Number,
    monthly_quota: Number,   // for ratenzahlung only
    percentage: Number
  }]
}
```

### Pattern 3: Fire-and-Forget Background Execution

**What:** Admin trigger endpoint returns immediately (202); document generation and email sending happen asynchronously. Status is tracked via `second_letter_status` field.
**When to use:** The 1. Anschreiben pipeline uses this exact pattern (`confirm-creditors` returns immediately, processing is background).
**Trade-offs:** Admin gets fast UI response; long operations don't block the HTTP response. Status visible on reload or via existing RTK Query cache invalidation.

```javascript
// admin-second-letter.js route handler
router.post('/clients/:clientId/send-second-letter', authenticateAdmin, async (req, res) => {
  // Respond immediately
  res.json({ success: true, message: 'Second letter send initiated' });
  // Fire-and-forget
  secondLetterService.sendSecondLetter(clientId).catch(err => {
    console.error(`Second letter send failed for ${clientId}:`, err.message);
  });
});
```

## Data Flow

### Flow 1: Automated 30-Day Scheduler Trigger

```
scheduler.js (every 6 hours)
  → secondLetterSchedulerService.checkEligibleClients()
      MongoDB query:
        {
          second_letter_status: 'IDLE',
          creditor_contact_started: true,
          'final_creditor_list': {
            $elemMatch: {
              contact_status: 'email_sent_with_document',
              email_sent_at: { $lte: <30 days ago> }
            }
          }
        }
      JS-side filter: MAX(email_sent_at) across all creditors <= 30 days ago
      (avoids complex $group aggregation on subdocument array)
  → For each eligible client:
      secondLetterService.triggerSecondLetter(client._id)
        → Atomic update: IDLE → PENDING (guard)
        → Send client notification email via Resend with portal link
        → Update second_letter_client_notified_at
```

### Flow 2: Admin Manual Trigger

```
Admin Portal — SecondLetterPanel
  → Admin clicks "Jetzt triggern" (bypasses 30-day date check)
  → POST /api/admin/clients/:id/trigger-second-letter  { force: true }
      secondLetterService.triggerSecondLetter(clientId, { force: true })
        → Atomic update: IDLE → PENDING (still guards against re-trigger)
        → Send client notification email
  → RTK Query invalidates Client tag → UI refetches → badge shows PENDING
```

### Flow 3: Client Submits Financial Data Form

```
Client receives email → clicks portal link → opens SecondLetterForm.tsx

SecondLetterForm.tsx
  → GET /api/clients/:id/second-letter-form
      Server: return { financial_data, extended_financial_data } from Client doc
      (pre-filled with existing data)
  → Client reviews fields, corrects if needed
  → POST /api/clients/:id/second-letter-form
      Body: { financial_data, extended_financial_data }
      Server:
        → validate
        → save to client.financial_data + client.extended_financial_data
        → update second_letter_status: FORM_SUBMITTED
  → Client sees confirmation screen
```

### Flow 4: Admin Sends 2. Anschreiben

```
Admin Portal — SecondLetterPanel (status: FORM_SUBMITTED)
  → Admin clicks "2. Anschreiben senden"
  → POST /api/admin/clients/:id/send-second-letter
      Server responds 202 immediately
      Background (secondLetterService.sendSecondLetter):
        1. Read client.financial_data + extended_financial_data + determined_plan_type
        2. Calculate pfaendbar_amount (existing §850c ZPO logic)
        3. Determine plan type: nullplan vs ratenzahlung
           (use client.determined_plan_type, already set by planTypeRouter)
        4. Calculate per-creditor quota (% of total debt × pfaendbar_amount)
        5. Write second_letter_snapshot to Client (before any sends)
        6. secondRoundDocumentGenerator.generateCreditorDocuments()
             → Load template:
               if nullplan   → server/templates/2.Schreiben-Nullplan.docx
               if ratenzahlung → server/templates/2.Schreiben-Ratenplan.docx
             → Fill variables per creditor:
               {Name} {Adresse} {Creditor} {Datum}
               {Pfaendbarer_Betrag} {Rate} {Laufzeit} {Quote}
             → Output: server/generated_documents/second_round/
        7. For each creditor with email:
             creditorEmailService.sendSecondRoundEmail()  ← already implemented
             Update creditor: second_letter_sent_at, second_letter_email_sent_at
             2s delay between creditors (matches 1. Anschreiben pattern)
        8. Update client: second_letter_status: SENT, second_letter_sent_at
  → RTK Query cache invalidated → SecondLetterPanel shows SENT badge
```

### State Management (Admin Frontend)

```
RTK Query (clientDetailApi.ts)
  useGetClientDetailQuery(clientId)
    → returns ClientDetailData including second_letter_status + second_letter_snapshot
    → poll interval: 30s (already set on LetterTrackingPage, replicate pattern)

  triggerSecondLetter mutation (NEW)
    → POST /api/admin/clients/:id/trigger-second-letter
    → invalidatesTags: [{ type: 'Client', id: clientId }]

  sendSecondLetter mutation (NEW)
    → POST /api/admin/clients/:id/send-second-letter
    → invalidatesTags: [{ type: 'Client', id: clientId }]

SecondLetterPanel reads:
  client.second_letter_status    → drives badge + button visibility
  client.second_letter_snapshot  → shows calculation summary
  client.second_letter_sent_at   → shows sent timestamp
```

## Integration Points

### Existing Services — Reuse As-Is

| Service | How to Reuse | Notes |
|---------|-------------|-------|
| `creditorEmailService.sendSecondRoundEmail()` | Import singleton, call directly | Already implemented with correct German subject line, DOCX attachment support, matcher sync, demo mode |
| §850c ZPO calculation | Read existing `client.financial_data.garnishable_amount` or call the calculation function in adminFinancialController | Do not rewrite; the calculation is already in the DB on clients that went through FinancialDataForm |
| `client.determined_plan_type` | Read this field to branch nullplan vs ratenzahlung document template | Already set by planTypeRouter after ExtendedFinancialDataWizard |
| `creditorContactService.js` | Reference only — use as pattern for orchestrator structure | Do not modify |
| `firstRoundDocumentGenerator.js` | Reference only — copy class structure, change templatePath and variables | Do not import or extend |

### Existing Routes — What to Add

| Route File | Addition |
|------------|----------|
| `server/routes/client-portal.js` | `GET /clients/:id/second-letter-form` and `POST /clients/:id/second-letter-form` following existing authenticateClient pattern |
| `server/scheduler.js` | One new setInterval block calling `secondLetterSchedulerService.checkEligibleClients()`, every 6 hours |
| `server.js` | Mount `admin-second-letter.js` router at `/api/admin` alongside existing admin routes |

### Client Portal Pattern (client-portal.js additions)

```javascript
// GET — return pre-filled financial data for the form
router.get('/clients/:clientId/second-letter-form',
    authenticateClient,
    controller.handleGetSecondLetterForm   // returns financial_data + extended_financial_data
);

// POST — save client's confirmed/corrected data
router.post('/clients/:clientId/second-letter-form',
    authenticateClient,
    controller.handleSubmitSecondLetterForm  // updates data, sets status FORM_SUBMITTED
);
```

### MongoDB Query for 30-Day Check

```javascript
// secondLetterSchedulerService.js
async checkEligibleClients() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const candidates = await Client.find({
    second_letter_status: 'IDLE',
    creditor_contact_started: true,
    'final_creditor_list': {
      $elemMatch: {
        contact_status: 'email_sent_with_document',
        email_sent_at: { $lte: thirtyDaysAgo }
      }
    }
  }).select('_id aktenzeichen firstName lastName final_creditor_list');

  // JS-side: only trigger if ALL sent emails are >= 30 days old
  // (ensures the full 30-day response window has passed)
  const eligible = candidates.filter(client => {
    const sentEmails = client.final_creditor_list
      .filter(c => c.email_sent_at)
      .map(c => new Date(c.email_sent_at));
    if (sentEmails.length === 0) return false;
    const maxSentAt = new Date(Math.max(...sentEmails));
    return maxSentAt <= thirtyDaysAgo;
  });

  return eligible;
}
```

This approach uses the existing pattern in DelayedProcessingService (simple $find + JS filter) rather than a complex $group aggregation.

### Admin Frontend Integration

`SecondLetterPanel` is a new component in `MandantenPortalDesign/src/app/components/`. It plugs into the existing `ClientDetail` component tab structure. The recommended placement is as a section within the `overview` tab (or a dedicated `second-letter` tab if the overview becomes crowded).

The panel uses `useGetClientDetailQuery` which already fetches the full client — no extra API call for initial render. After mutations, the Client cache tag invalidation triggers a refetch.

TypeScript additions required in `types.ts`:
```typescript
// Add to ClientDetailData interface
second_letter_status?: 'IDLE' | 'PENDING' | 'FORM_SUBMITTED' | 'IN_REVIEW' | 'SENT' | 'SKIPPED';
second_letter_triggered_at?: string;
second_letter_client_notified_at?: string;
second_letter_sent_at?: string;
second_letter_snapshot?: {
  captured_at: string;
  determined_plan_type: 'nullplan' | 'ratenzahlung';
  pfaendbar_amount: number;
  plan_duration_months?: number;
};
```

### Client Portal Integration

`SecondLetterForm.tsx` is a new component in `/src/components/` (CRA portal). It follows the exact same pattern as `ExtendedFinancialDataWizard.tsx`:
- Uses `api` (axios instance from `/src/config/api`)
- Receives `clientId` as prop
- Calls GET endpoint on mount to pre-fill
- Multi-step wizard structure (berufsstatus, einkommen, vermögen sections already exist in ExtendedFinancialDataWizard — reuse the UI structure, just add a confirmation step)
- Calls POST on submit

The client reaches this form via the link in the notification email. The portal URL pattern matches existing portal auth (session token or verification code).

## Anti-Patterns

### Anti-Pattern 1: Re-implementing Email Sending

**What people do:** Write new email sending logic inside secondLetterService.js.
**Why it's wrong:** `creditorEmailService.sendSecondRoundEmail()` is already fully implemented: correct German subject line ("Schuldenbereinigungsplan..."), DOCX attachment support, demo mode (redirects to test address), matcher sync, Resend SDK initialization. Re-implementing duplicates all this.
**Do this instead:** Import the singleton `require('./creditorEmailService')` and call `sendSecondRoundEmail()` directly. Only new work is generating the DOCX file passed as the attachment.

### Anti-Pattern 2: Scheduler Without Idempotency Guard

**What people do:** Add a setInterval that triggers second letters but relies only on the date check for idempotency.
**Why it's wrong:** The scheduler runs every 6 hours. If secondLetterService.triggerSecondLetter fails partway through (client notified but status not saved), the next scheduler run will re-trigger the same client, sending duplicate notification emails.
**Do this instead:** The atomic `findOneAndUpdate` matching on `second_letter_status: 'IDLE'` is the idempotency guard. This is the same pattern used for `dedup_in_progress` and payment guards throughout the existing codebase. Without it, double-sends are guaranteed under failure conditions.

### Anti-Pattern 3: Skipping the Snapshot Before Sending

**What people do:** Calculate pfändbar amount and per-creditor quotas on the fly when generating documents, without persisting the calculation.
**Why it's wrong:** financial_data can be edited after the letter is sent. Without a snapshot, there is no way to reconstruct what was actually in the DOCX that went to creditors. This breaks audit requirements and causes confusion if creditors dispute amounts.
**Do this instead:** Write `second_letter_snapshot` to MongoDB *before* calling the document generator. If document generation fails, the snapshot still records what was calculated. This matches the existing pattern of `debt_settlement_plan` on the Client model.

### Anti-Pattern 4: Using secondRoundManager.js as the Model

**What people do:** Look at the existing `server/services/secondRoundManager.js` and follow its patterns for the new 2. Anschreiben workflow.
**Why it's wrong:** `secondRoundManager.js` was built for a different concept (Zendesk-based second round with the old `second_round_api.js` route). It uses Zendesk uploader, in-memory state maps, and the old creditor calculation approach. It does not align with the new requirements (state machine, client form, snapshot, admin-controlled send).
**Do this instead:** Follow the pattern of `creditorContactService.js` (orchestrator pattern) and `firstRoundDocumentGenerator.js` (document generation pattern). Use `creditorEmailService.sendSecondRoundEmail()` which was already built for the new approach.

### Anti-Pattern 5: New Polling Endpoint for Status

**What people do:** Add a dedicated `getSecondLetterStatus` polling endpoint and a separate RTK Query query that polls every 10 seconds.
**Why it's wrong:** `useGetClientDetailQuery` already returns the full client including `second_letter_status`. Adding a separate poll doubles requests. The existing LetterTrackingPage already polls `getClientDetail` every 30 seconds.
**Do this instead:** Return `second_letter_status` and `second_letter_snapshot` as part of the existing GET `/api/clients/:id` response. Mutations invalidate the `Client` RTK tag, causing immediate refetch.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (< 100 active clients) | setInterval in scheduler.js is sufficient. No queue needed. |
| If > 50 clients trigger simultaneously | Document generation is CPU-bound. Add a concurrency limit (already done in creditorContactService with 2s delays between emails — replicate). |
| Email volume | Resend handles rate limiting internally. No changes needed within current plan limits. |

The 2. Anschreiben workflow triggers at most once per client and has a 30-day cadence. Simultaneous processing of more than 10-15 clients is unlikely given the business model. Scaling is not a concern for this milestone.

## Build Order (Dependency-Ordered)

Build in this order to respect data and code dependencies:

**1. Client.js model changes**
Add `second_letter_status`, `second_letter_triggered_at`, `second_letter_client_notified_at`, `second_letter_sent_at`, `second_letter_snapshot` to clientSchema. Add `second_letter_*` fields to creditorSchema.
Everything downstream reads from the model.

**2. secondRoundDocumentGenerator.js**
Pure file-in/file-out service. No DB dependency except reading client data. Can be built and manually tested in isolation with placeholder DOCX templates. Depends on model (step 1) for the client data shape it receives.

**3. secondLetterService.js**
Main orchestrator. Depends on model (step 1), document generator (step 2), and existing `creditorEmailService.sendSecondRoundEmail()` (no changes to that service).

**4. secondLetterSchedulerService.js**
Eligibility checker. Depends on model (step 1) and secondLetterService (step 3).

**5. scheduler.js modification**
Add one setInterval block calling secondLetterSchedulerService. Depends on step 4.

**6. admin-second-letter.js route**
Admin endpoints: trigger, send, status. Depends on secondLetterService (step 3). Wire into server.js.

**7. client-portal.js route additions**
GET + POST for second-letter-form. Depends on model (step 1) and a handler in clientPortalController. Does not require secondLetterService — the controller only reads/writes financial_data and updates status.

**8. SecondLetterForm.tsx (client portal)**
CRA component. Depends on backend routes (step 7). Client-facing form with pre-fill and submission.

**9. types.ts + clientDetailApi.ts extensions**
TypeScript types for `second_letter_*` fields. Add 2-3 RTK Query mutations. Depends on backend routes being stable (steps 6, 7).

**10. SecondLetterPanel.tsx (admin portal)**
Admin UI component. Depends on RTK Query mutations (step 9). Plugs into existing ClientDetail tab structure.

## Sources

- Direct inspection: `server/services/firstRoundDocumentGenerator.js` — document generator pattern
- Direct inspection: `server/services/creditorEmailService.js` — `sendSecondRoundEmail()` confirmed implemented
- Direct inspection: `server/services/secondRoundManager.js` — old Zendesk-based approach; do NOT follow for new work
- Direct inspection: `server/services/creditorContactService.js` — orchestrator pattern to follow
- Direct inspection: `server/scheduler.js` — setInterval patterns, dependency injection structure
- Direct inspection: `server/models/Client.js` — full schema including financial_data, extended_financial_data, determined_plan_type, existing settlement plan fields
- Direct inspection: `server/routes/client-portal.js`, `admin-financial.js`, `admin-client-creditor.js`
- Direct inspection: `server/routes/second-round-api.js` + `server/services/secondRoundManager.js` — old approach (Zendesk-based), not the template for new work
- Direct inspection: `MandantenPortalDesign/src/store/api/clientDetailApi.ts` — RTK Query pattern (mutation + invalidatesTags)
- Direct inspection: `MandantenPortalDesign/src/app/types.ts` — ClientDetailData interface to extend
- Direct inspection: `MandantenPortalDesign/src/app/App.tsx` — route structure, no new top-level routes needed
- Direct inspection: `src/components/FinancialDataForm.tsx`, `ExtendedFinancialDataWizard.tsx` — CRA portal patterns (axios, step wizard, clientId prop)

---
*Architecture research for: 2. Anschreiben Automatisierung — v10 milestone*
*Researched: 2026-03-02*
