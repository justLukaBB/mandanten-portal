# Stack Research

**Domain:** Insolvency case management — automated second creditor letter workflow
**Researched:** 2026-03-02
**Confidence:** HIGH — based on direct codebase inspection of installed packages, existing pipeline patterns, and verified package versions

---

## Context: What Already Exists (Do Not Reinstall)

The following are confirmed installed and in active use. Do not add them again — they are the foundation the 2. Anschreiben milestone builds on:

| Package | Installed Version | Role in This Milestone |
|---------|------------------|-----------------------|
| `docxtemplater` | 3.66.4 | DOCX generation — replicate for 2. Anschreiben templates |
| `pizzip` | 3.2.0 | Pairs with docxtemplater — already in `firstRoundDocumentGenerator.js` |
| `resend` | 6.8.0 | Email delivery — identical send path as 1. Anschreiben |
| `mongoose` | 8.16.5 | All DB operations — Client model will gain `second_letter_status` |
| `uuid` | 9.0.1 | Status history entries — same pattern as existing `status_history` |
| `axios` | 1.10.0 | API calls from old portal (`src/`) — use in new financial snapshot route |
| `express` | 4.18.2 | Routes for trigger, form submit, and status endpoints |

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node-cron` | ^3.0.3 | 30-day scheduler trigger | setInterval (current pattern) lacks cron expression syntax for calendar-based triggers; node-cron adds human-readable schedule strings and fires at predictable wall-clock times rather than drift-prone millisecond intervals. Zero external dependencies. |

**Why node-cron over alternatives:**
- The existing `scheduler.js` uses raw `setInterval` at hourly/daily intervals — acceptable for polling loops that just scan MongoDB. For the 2. Anschreiben, the trigger condition is "30 days since `MAX(email_sent_at)` on first round", which is a poll-and-check pattern. `setInterval` with a daily poll is actually fine here too — the condition check is idempotent against MongoDB. Use `node-cron` for cleaner cron syntax, but keep the same polling model.
- Agenda (MongoDB-backed jobs) and BullMQ (Redis) are overkill: this is a single-server app with no distributed requirements and jobs are already idempotent.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none new)* | — | — | All other capabilities are covered by existing stack |

**No additional npm packages are required.** The full 2. Anschreiben feature set is achievable with the existing dependencies:

- **Scheduler trigger** → extend `server/scheduler.js` with a daily `setInterval` or `node-cron` job
- **State machine** → Mongoose schema field addition to Client model (`second_letter_status`)
- **Financial snapshot** → plain object stored to MongoDB via Mongoose (no snapshot library needed)
- **Quote calculation** → pure JavaScript math using existing `germanGarnishmentCalculator.js` output
- **DOCX generation** → `docxtemplater` + `pizzip` (identical to `firstRoundDocumentGenerator.js`)
- **Client email notification** → `resend` v6 (identical to existing email sends)
- **Admin UI trigger** → React + RTK Query in `MandantenPortalDesign/src/` (no new frontend deps)
- **Client form** → React + axios in `src/` (old CRA portal, existing `FinancialDataForm.tsx` pattern)

---

## Confirmed Integration Points

### Backend: secondLetter Service Layer

Mirror the `firstRoundDocumentGenerator.js` pattern exactly:

```javascript
// server/services/secondLetterDocumentGenerator.js
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs').promises;
const path = require('path');

// Template paths (supplied by user):
// server/templates/2.Schreiben.Ratenplan.docx
// server/templates/2.Schreiben.Nullplan.docx
```

### Backend: Scheduler Extension

Add to `server/scheduler.js` — follow the existing setInterval pattern (no node-cron required if team prefers consistency):

```javascript
// Every 24 hours — check for clients 30 days past first round send
const SECOND_LETTER_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

setInterval(async () => {
    const secondLetterService = new SecondLetterTriggerService();
    await secondLetterService.checkAndTriggerEligibleClients();
}, SECOND_LETTER_CHECK_INTERVAL);
```

Idempotency guard: use `second_letter_status: 'FIRST_SENT'` as eligibility filter — MongoDB query ensures only clients in the right state are ever touched.

### Backend: State Machine on Client Model

Add to `clientSchema` in `server/models/Client.js`:

```javascript
second_letter_status: {
    type: String,
    enum: [
        'FIRST_SENT',          // First round complete, eligible for 30-day trigger
        'SECOND_PENDING',      // Scheduler fired, client notified, awaiting form
        'SECOND_IN_REVIEW',    // Client submitted form, ready for admin to trigger send
        'SECOND_SENT'          // Documents generated and sent to creditors
    ],
    default: 'FIRST_SENT'
},
second_letter_triggered_at: Date,       // When scheduler/admin fired the trigger
second_letter_form_submitted_at: Date,  // When client submitted financial snapshot
second_letter_sent_at: Date,           // When creditor emails were sent
second_letter_financial_snapshot: {    // Immutable snapshot taken at form submit
    monthly_net_income: Number,
    number_of_children: Number,
    marital_status: String,
    garnishable_amount: Number,
    plan_type: { type: String, enum: ['ratenplan', 'nullplan'] },
    total_debt: Number,
    creditor_quotes: [{               // Per-creditor calculated quota
        creditor_id: String,
        creditor_name: String,
        claim_amount: Number,
        quota_percentage: Number,
        monthly_rate: Number
    }],
    snapshot_taken_at: Date,
    confirmed_by_client: { type: Boolean, default: false }
}
```

**Why snapshot pattern:** Financial data changes over time. The creditor letters must reflect data as of the moment the client confirmed, not the current database state. Store `second_letter_financial_snapshot` as immutable record at form submission.

### Frontend (Admin Portal — MandantenPortalDesign)

Uses existing deps: RTK Query for API calls, shadcn/ui components, Tailwind 4 tokens. No additions needed.

New UI elements:
- Trigger button → `<Button>` (shadcn/ui, orange accent, max 1 per section)
- Status badge → outlined + tinted pill (existing badge pattern)
- Tracking section → existing `ClientDetailTabs` tab addition

### Frontend (Client Portal — src/)

Uses existing deps: `axios` for API calls, React, TypeScript. No additions needed.

New component: `SecondLetterFinancialConfirmation.tsx` — mirror `FinancialDataForm.tsx` pattern:
- Pre-fill from `financial_data` and `extended_financial_data`
- Read-only creditor quote table (calculated server-side)
- Submit triggers snapshot save + status transition to `SECOND_IN_REVIEW`

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `agenda` or `bull` | MongoDB/Redis job queue adds infrastructure complexity with no benefit for single-server idempotent polling | Extend existing `setInterval` scheduler or add `node-cron` |
| `node-schedule` | Functionally equivalent to `node-cron` but less commonly used; team already familiar with setInterval pattern | `node-cron` if switching, or stay with `setInterval` |
| A separate snapshot library | No ecosystem standard exists; plain Mongoose subdocument is idiomatic and already used for `status_history` | Mongoose embedded document |
| `xstate` or other state machine libraries | The state machine has 4 linear states with no branching logic; a schema enum + service function is sufficient | Mongoose enum field + guard checks in service |
| New email provider | Resend v6 is already configured, from-address and domain verified, matcher sync integrated | Resend v6 (existing `creditorEmailService.js` pattern) |
| PDF conversion for DOCX delivery | 1. Anschreiben sends DOCX directly and it works; creditors accept DOCX | Keep DOCX format via existing docxtemplater pipeline |

---

## Installation

**No new packages required for MVP.**

If the team chooses `node-cron` for cleaner syntax over raw `setInterval`:

```bash
# From server/ directory
cd server && npm install node-cron@^3.0.3
```

That is the only optional addition. Everything else is already installed.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Extend `server/scheduler.js` with poll-and-check | Dedicated cron service / external scheduler | Single-server local dev context; no deployment infra to add external schedulers; existing scheduler.js already handles 5 similar patterns successfully |
| Mongoose embedded document for snapshot | Separate `FinancialSnapshot` collection | No cross-collection queries needed; snapshot is always accessed with its client; avoids join complexity |
| Plain setInterval (or node-cron) | Agenda.js | Agenda requires MongoDB job collection + worker process; 4x the complexity for a once-daily check |
| `docxtemplater` template variables | Generating DOCX programmatically with `docx` library | Templates are user-supplied DOCX files with `{variable}` placeholders; docxtemplater fills them without rewriting layout |

---

## Stack Patterns by Feature Area

**30-day scheduler trigger:**
- Daily `setInterval` or `node-cron` polling job in `server/scheduler.js`
- Query: `{ second_letter_status: 'FIRST_SENT', creditor_contact_started_at: { $lte: thirtyDaysAgo } }`
- Idempotency: status transition `FIRST_SENT → SECOND_PENDING` is atomic Mongoose update

**Quote calculation per creditor:**
- Use existing `garnishable_amount` from `financial_data` (already calculated via `germanGarnishmentCalculator.js`)
- Plan type already in `determined_plan_type` or calculate from garnishable_amount threshold
- Per-creditor quota: `(creditor.claim_amount / total_debt) * garnishable_amount`
- Store results in `second_letter_financial_snapshot.creditor_quotes[]`

**DOCX template branching (Ratenplan vs Nullplan):**
- Plan type determines which template file to load
- `garnishable_amount > 0` → Ratenplan template
- `garnishable_amount === 0` → Nullplan template
- Same docxtemplater generation loop as first round, different template path

**Client notification email:**
- Use `resend` SDK directly (not via Zendesk side conversation)
- Same pattern as `creditorEmailService.js` first-round emails
- Include portal URL with deep link to second letter confirmation form

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `docxtemplater@3.66.4` | `pizzip@3.2.0` | HIGH — same major versions as first round pipeline | No changes needed |
| `resend@6.8.0` | `node@>=18` | HIGH — confirmed working in this codebase | Existing API key works |
| `mongoose@8.16.5` | `node@>=18` | HIGH — schema additions are backward compatible | Adding fields with defaults doesn't break existing data |
| `node-cron@^3.0.3` (optional) | `node@>=18` | HIGH — pure JS, no native bindings | Install only if preferred over setInterval |

---

## Sources

- Direct codebase inspection (HIGH confidence):
  - `server/services/firstRoundDocumentGenerator.js` — confirmed docxtemplater + pizzip pattern
  - `server/services/creditorEmailService.js` — confirmed Resend v6 send pattern
  - `server/services/secondRoundManager.js`, `secondRoundDocumentService.js` — existing second-round skeleton (partial implementation)
  - `server/scheduler.js` — confirmed setInterval pattern for all existing scheduled tasks
  - `server/models/Client.js` — confirmed no `second_letter_status` field exists yet
  - `server/services/germanGarnishmentCalculator.js` — confirmed garnishment calculation exists
  - `server/package.json` — confirmed all installed package versions
  - `MandantenPortalDesign/package.json` — confirmed Vite admin portal deps

- betterstack.com scheduler comparison — node-cron vs setInterval vs Agenda for single-server idempotent tasks (MEDIUM confidence, verified aligns with codebase context)

---

*Stack research for: 2. Anschreiben Automatisierung (v10 milestone)*
*Researched: 2026-03-02*
