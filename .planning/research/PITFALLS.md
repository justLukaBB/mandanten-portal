# Pitfalls Research

**Domain:** Adding 2. Anschreiben automation to an existing insolvency management system
**Researched:** 2026-03-02
**Confidence:** HIGH (based on direct codebase analysis — scheduler.js, delayedProcessingService.js, Client.js, firstRoundDocumentGenerator.js, creditorEmailService.js, germanGarnishmentCalculator.js, adminFinancialController.js, clientPortalController.js)

---

## Critical Pitfalls

### Pitfall 1: Double-Send via Scheduler + Manual Trigger

**What goes wrong:**
Admin clicks the manual trigger button while the 30-day scheduler has already queued the same client. Two second letters go to each creditor. Creditors get confused, the law firm looks unprofessional, and there is no automated way to undo sent emails.

**Why it happens:**
The existing scheduler (`server/scheduler.js`) uses `setInterval` with boolean flags in the database (e.g., `processing_complete_webhook_triggered: true`) to prevent re-triggering. The same pattern must be followed for the 2. Anschreiben, but developers forget to atomically set the guard flag before starting document generation — meaning a scheduler run and a manual trigger can both read `second_letter_status = FIRST_SENT` simultaneously and both proceed.

**How to avoid:**
Use a MongoDB atomic update as the first step of the trigger handler. Do not read-then-write; use `findOneAndUpdate` with `$set: { second_letter_status: 'SECOND_PENDING' }` and a filter that includes `{ second_letter_status: 'FIRST_SENT' }`. If the update returns `null`, another process already claimed the lock — abort immediately. The pattern already exists in the codebase for dedup (`dedup_in_progress`).

```javascript
// Correct: atomic claim
const client = await Client.findOneAndUpdate(
  { _id: id, second_letter_status: 'FIRST_SENT' },
  { $set: { second_letter_status: 'SECOND_PENDING', second_letter_triggered_at: new Date() } },
  { new: true }
);
if (!client) return; // already claimed by another trigger
```

**Warning signs:**
- Handler reads status with `Client.findOne`, then saves status update later
- No idempotency check at the entry point of the trigger
- Scheduler check interval is shorter than document generation time (~2 min for 20+ creditors)

**Phase to address:**
Phase 1 (Scheduler + State Machine) — the atomic guard must be implemented before any document generation logic.

---

### Pitfall 2: State Machine Enum Mismatch Between Schema and Code

**What goes wrong:**
`second_letter_status` is a new Mongoose enum field that does not exist in the Client schema yet. Code that checks or sets this field without a schema migration will either silently store wrong values (Mongoose ignores undefined fields by default unless `strict: false`) or throw validation errors at save time.

**Why it happens:**
Developers add the business logic first (checking status in the scheduler) and forget to add the enum field to `Client.js` first. The `clientSchema` in `server/models/Client.js` is large (678 lines) and the field would be added in the "workflow" section. Until it is added, `client.second_letter_status` reads as `undefined`, and every client passes the "not yet sent" check.

**How to avoid:**
Add `second_letter_status` to the Mongoose schema as the absolute first step before any service code. Include all valid enum values, a sensible default, and the related date fields:

```javascript
second_letter_status: {
  type: String,
  enum: ['FIRST_SENT', 'SECOND_PENDING', 'SECOND_IN_REVIEW', 'SECOND_SENT'],
  default: 'FIRST_SENT'
},
second_letter_triggered_at: Date,
second_letter_sent_at: Date,
second_letter_notification_sent_at: Date,
```

Also add the schema migration: existing clients have `creditor_contact_started: true` and should be initialized to `FIRST_SENT`.

**Warning signs:**
- Scheduler query uses `current_status` as proxy for "1. Anschreiben sent" instead of the dedicated field
- State transitions happen via direct assignment (`client.second_letter_status = 'SECOND_SENT'`) without validating the previous state
- No migration script for existing clients

**Phase to address:**
Phase 1 (Scheduler + State Machine) — schema first, services second.

---

### Pitfall 3: Quota Calculation Produces NaN or Infinity When Claim Amounts Are Missing

**What goes wrong:**
Per-creditor quota = `creditor_claim_amount / total_debt * garnishable_amount`. If any creditor in `final_creditor_list` has `claim_amount: null`, `undefined`, or `0`, `total_debt` can be 0 (division by zero → Infinity) or the quota can be NaN. These values get written to the DOCX template and appear as "NaN €" or "Infinity €" in the letter sent to creditors.

**Why it happens:**
Looking at `adminFinancialController.js` lines 130–141, the quota calculation uses `creditor.claim_amount || 0` as a fallback. When multiple creditors have null amounts, total_debt collapses to 0. JavaScript division by zero produces `Infinity`, not an error. The `toFixed(2)` call on `Infinity` produces the string `"Infinity"` which docxtemplater writes verbatim into the DOCX.

**How to avoid:**
1. Guard against zero total debt before division:
```javascript
if (totalDebt === 0) throw new Error('Cannot calculate quotas: total debt is zero');
```
2. Filter creditors with missing amounts before calculation and log them as warnings.
3. Round monthly payment with `Math.round(value * 100) / 100` (not `toFixed()` — that returns a string, not a number, causing downstream type bugs).
4. Assert every quota field in the template data is a finite number before calling docxtemplater.

**Warning signs:**
- Template variables built with `toFixed()` without checking `isFinite()`
- No validation step between quota calculation and DOCX generation
- Test clients have all creditors with populated `claim_amount` values (happy path only)

**Phase to address:**
Phase 3 (Financial Calculation) — the calculation service must include guards; Phase 4 (DOCX Generation) must validate template data before calling docxtemplater.

---

### Pitfall 4: Nullplan / Ratenplan Decision Applied to Wrong Financial Data Snapshot

**What goes wrong:**
The plan type (Nullplan vs. Ratenplan) is determined from `client.financial_data` at trigger time. But the client may have submitted an updated form (the 2. Anschreiben confirmation form) that changed `monthly_net_income`. If the trigger runs before the client's form submission is persisted to the database (race between form POST and scheduler check), the system generates Ratenplan documents but the client actually qualifies for Nullplan, or vice versa.

**Why it happens:**
The scheduler runs every hour via `setInterval`. The client form submission is async (React form POST → Express → MongoDB save). The window is small but real: the scheduler can read the client document between the Express handler receiving the request and `client.save()` completing. This is a TOCTOU (time-of-check, time-of-use) bug.

**How to avoid:**
1. The 30-day scheduler should only set the status to `SECOND_PENDING` — it should NOT immediately generate documents.
2. Document generation should only start after `second_letter_status === 'SECOND_IN_REVIEW'`, which is set when the client form submission completes.
3. Snapshot the financial data used for calculation in `second_letter_financial_snapshot` at form submission time. The document generator reads from the snapshot, not live `financial_data`.

**Warning signs:**
- Scheduler directly calls the document generator after setting status
- Document generator reads `client.financial_data` at generation time (no snapshot)
- No timestamp check to verify form was submitted before generation begins

**Phase to address:**
Phase 3 (Financial Calculation) — snapshot pattern must be designed here; Phase 2 (Client Form) — form submission must write the snapshot.

---

### Pitfall 5: docxtemplater Template Variable Name Mismatch Causes Silent Empty Fields

**What goes wrong:**
The 2. Anschreiben DOCX templates (Ratenplan + Nullplan) will be provided by the user with `{VariableName}` placeholders. If the variable names in the template don't exactly match what the document generator passes, docxtemplater renders those fields as empty strings — it does NOT throw an error by default. Letters go out with blank creditor names, missing amounts, or empty dates.

**Why it happens:**
docxtemplater's default error mode for missing tags is `nullGetter` which returns an empty string. The 1. Anschreiben generator (`firstRoundDocumentGenerator.js`) works around this with the `isUsableValue` helper and verified variable names. The 2. Anschreiben will have different template variables (e.g., `{Pfaendbarer_Betrag}`, `{Quote_Prozent}`, `{Monatliche_Rate}`) that need to be mapped precisely to what the code produces.

**How to avoid:**
1. Set `errorLogging: true` in docxtemplater constructor during development to expose missing tags.
2. Parse the DOCX template XML to extract all `{VariableName}` tags before running generation — log any that don't have a corresponding value.
3. Create a variable manifest from the user-provided templates before writing generation code — build the code to match the template, not the other way around.
4. Run a dry-run generation pass with a known-good fixture client and visually inspect the output DOCX.

**Warning signs:**
- Document generator written before templates are received from user
- No output validation step (generate → inspect)
- Using `{` `}` curly syntax without checking if template actually uses that syntax vs `«»` angular brackets

**Phase to address:**
Phase 4 (DOCX Template Integration) — must start by extracting and mapping all template variables.

---

### Pitfall 6: Client Notification Email Contains a Dead Link

**What goes wrong:**
The notification email sent to the Mandant (client) contains a link like `https://portal.example.com/financial-data?token=abc123`. If the token has already been used, expired, or was never created, the client clicks the link and gets an error or blank page. The client cannot fill in the required financial data and the whole workflow stalls.

**Why it happens:**
The client portal uses `session_token` and `portal_token` for authentication (see `Client.js` lines 285-288). These tokens are generated once at onboarding. If the 2. Anschreiben email is generated months later, the token might be expired or stale. The email service constructs the link from `client.portal_link` which was set at onboarding — if that URL pattern changed in the meantime, it's dead.

**How to avoid:**
1. Generate a fresh time-limited token specifically for the 2. Anschreiben form (`second_letter_form_token`, expiry 14 days).
2. The notification email link must route to a dedicated route in the old CRA portal (e.g., `/zweites-anschreiben`) protected by this token.
3. Test the link in a browser before treating the feature as complete — do not trust that `portal_link` resolves correctly.
4. Add link expiry handling in the form route: if token is expired, show a clear "contact your lawyer" message, not a generic 401.

**Warning signs:**
- Email template uses the static `client.portal_link` field from onboarding
- No dedicated token for the 2. Anschreiben flow
- Form route not yet created in `/src/` CRA portal

**Phase to address:**
Phase 2 (Client Notification Email + Form Route) — link and token generation must be tested end-to-end.

---

### Pitfall 7: setInterval Scheduler Does Not Survive Server Restart

**What goes wrong:**
If the Node.js server restarts (deploy, crash, OOM), all `setInterval` timers are lost. A client that was 29 days into the 30-day window has their counter reset to 0. The 2. Anschreiben is delayed by another 30 days.

**Why it happens:**
The existing scheduler (`server/scheduler.js`) uses pure in-process `setInterval`. State is tracked in MongoDB (`processing_complete_webhook_scheduled_at`), so check functions use database timestamps — this is the safe pattern. But if the new 30-day check uses the same pattern (checking `email_sent_at` from `final_creditor_list`), a restart simply means the next hourly check will correctly find the client. The pitfall is if the trigger logic uses a session-level variable or in-memory state instead.

**How to avoid:**
Follow the existing pattern exactly: do NOT track "due at" in memory. Instead, in the scheduler check function, query MongoDB for:
```javascript
Client.find({
  second_letter_status: 'FIRST_SENT',
  'final_creditor_list.email_sent_at': { $lte: thirtyDaysAgo }
})
```
This is stateless — every restart recalculates from source-of-truth data.

**Warning signs:**
- Scheduler stores `next_check_at` in a JavaScript variable
- Trigger uses `setTimeout(trigger, 30 * 24 * 60 * 60 * 1000)` instead of a periodic query
- No test of scheduler behavior after server restart simulation

**Phase to address:**
Phase 1 (Scheduler + State Machine) — query design must be database-driven from the start.

---

### Pitfall 8: Financial Data Form in Old CRA Portal Has No Prefill Guard

**What goes wrong:**
The 2. Anschreiben form in `/src/` (old CRA portal) should prefill from existing `financial_data` stored in the client document. If the prefill API call fails or returns stale data, the client submits a blank or incorrect form. The garnishment calculation then uses wrong income data, producing wrong Ratenplan/Nullplan determination and wrong quota amounts.

**Why it happens:**
The existing `FinancialDataForm.tsx` starts with empty state (lines 35-40). The new form for 2. Anschreiben must fetch and populate existing values. The fetch happens asynchronously. If there is a race condition — form renders before data arrives, user fills fields, then data arrives and overwrites user input — the user loses their changes.

**How to avoid:**
1. Render a loading skeleton until prefill data has resolved; do NOT render the form in an editable state before data arrives.
2. Once data arrives, populate state once with `useEffect` that has the fetched data as its value (not a dependency that re-runs).
3. Add an `isLoading` state that prevents form submission until prefill is confirmed complete.
4. Prefill should show the existing income values with a visual indicator ("from your records — please verify").

**Warning signs:**
- Form initializes with empty strings, then `useEffect` sets values (causes user input override)
- No loading state before form renders
- Form `onSubmit` does not check if prefill completed

**Phase to address:**
Phase 2 (Client Form + Prefill) — the loading/prefill pattern must be designed before the form component is built.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `second-round-api.js` (existing route) without adding state machine | Less code | The existing route has no idempotency guard; double-sends are possible | Never — the state machine guard is required |
| Use `client.financial_data.garnishable_amount` directly without re-calculating | Faster | Amount may be stale (calculated months ago with old income data) | Only if client has just submitted the 2. Anschreiben confirmation form |
| Generate all creditor documents in a single synchronous loop | Simpler | Blocks the event loop for large creditor lists (20+), causes 30s+ timeout on the HTTP trigger endpoint | Acceptable only with a background job pattern (fire-and-forget) |
| Use the same `portal_token` from onboarding for 2. Anschreiben form | One less field | Token may be expired; no way to track form completion separately | Never — use a dedicated short-lived token |
| Skip demo mode redirect for 2. Anschreiben creditor emails | Simpler | Accidentally emails real creditors during testing | Never — must respect existing `demo_mode_enabled` ReviewSettings flag |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Resend SDK | Treating dev mode (no API key) as a success and marking `second_letter_status = SECOND_SENT` | Check `result.devMode` flag; only update status when `result.success && !result.devMode`, or make devMode acceptable explicitly |
| Resend SDK | Not CC-ing `insolvenz@ra-scuric.de` on 2. Anschreiben creditor emails | The 1. Anschreiben adds CC (see `creditorEmailService.js` line 148); 2. Anschreiben must do the same |
| docxtemplater | Calling `doc.render()` without wrapping in try/catch for template errors | docxtemplater throws for structural XML errors; catch and log with template variable dump |
| docxtemplater | Passing `Number.toFixed()` result (a string) as a template variable for currency amounts | Parse the return value back to float, or pass the raw number and format in the template |
| MongoDB | Using `client.save()` after the idempotency update instead of the targeted `findOneAndUpdate` | `client.save()` on a stale document object can overwrite concurrent writes; use `Client.updateOne` for status-only updates |
| CRA Portal (old /src/) | Using `axios` directly instead of the `api` helper from `src/config/api` | The `api` helper attaches the session token automatically; raw `axios` calls will fail auth |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Generating DOCX for all creditors synchronously in the HTTP request handler | Request times out on large creditor lists | Fire-and-forget: respond 202 immediately, generate in background | At 15+ creditors (~30s generation time) |
| Loading all `eligible` clients in memory to check 30-day threshold | Memory spike on large datasets | Use MongoDB query with date filter directly, no in-memory post-filter | At 200+ clients |
| Attaching DOCX files to Resend via `fs.readFileSync` synchronously in email loop | Blocks I/O during file reads | Use `fs.promises.readFile` (async), or read all files in parallel before the loop | Always an issue; becomes visible at 10+ creditors |
| Scheduler query runs without an index on `second_letter_status` | Scheduler check becomes slow as client count grows | Add MongoDB index on `second_letter_status` when adding the schema field | At 500+ clients |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using the client's `portal_token` (long-lived) in the 2. Anschreiben email link | If token leaks, attacker can access client data indefinitely | Generate a short-lived (14-day) single-use `second_letter_form_token`; invalidate after first use |
| Not validating that the requesting client's session belongs to the client ID in the URL | Client A could submit financial data for client B | The `authenticateClient` middleware checks session token; ensure the route uses it and the controller validates `req.client._id === params.clientId` |
| Logging full financial data (income, children, marital status) to console | PII in server logs | Log only `clientId` and `aktenzeichen`; never log financial fields |
| Demo mode bypass: manually calling the trigger endpoint with real client data | Real creditors get test emails | The trigger endpoint must check `ReviewSettings.demo_mode_enabled` before allowing send, same as the existing `creditorEmailService.js` |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Admin trigger button does not show current `second_letter_status` | Admin triggers when already in progress, gets confusing error | Show current status badge next to trigger button; disable button when status is `SECOND_PENDING` or `SECOND_SENT` |
| No success/failure feedback after admin manual trigger | Admin doesn't know if it worked | Show inline status update (loading → success/error) without page reload; poll status endpoint |
| Client form shows both "old" and "new" income fields without explaining what changed | Client confused about which values to verify | Label prefilled values as "Aktuell gespeichert" with a timestamp; highlight that corrections will be used for the settlement plan |
| Client notification email subject is generic | Email gets marked as spam or ignored | Use specific subject: "Ihr Schuldenbereinigungsplan — bitte Finanzdaten bestätigen (Az: {AZ})" |
| Admin status badge shows only `SECOND_SENT` / not sent — no intermediate states | Admin can't distinguish "scheduled by scheduler" from "pending client form" | Show all four states as distinct badges: 1. Anschreiben versendet → Ausstehend → In Prüfung → 2. Anschreiben versendet |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Scheduler trigger:** Documents generate correctly in dev mode — verify the idempotency guard works when two requests hit simultaneously (simulate with two parallel curl requests)
- [ ] **State machine:** Status transitions from FIRST_SENT → SECOND_PENDING → SECOND_IN_REVIEW → SECOND_SENT — verify no client can skip states (e.g., jump directly to SECOND_SENT without going through SECOND_IN_REVIEW)
- [ ] **Client form prefill:** Form renders with existing financial data — verify it also works for clients whose `financial_data` is empty (first-time fill for 2. Anschreiben)
- [ ] **Quota calculation:** Sum of all creditor quotas equals exactly 100% (rounding errors distribute remainder to largest creditor) — verify with a 3-creditor test case
- [ ] **Nullplan detection:** System determines Nullplan when `garnishable_amount < 1` — verify that a client with `garnishable_amount = 0.50` gets a Nullplan letter, not a Ratenplan letter with "€0.50 / month" per creditor
- [ ] **DOCX template variables:** All template `{fields}` are populated — open generated DOCX visually, do not rely on absence of exceptions
- [ ] **Email send + status update:** After Resend confirms send, `second_letter_status` is atomically set to `SECOND_SENT` — verify that if the Resend call succeeds but the MongoDB update fails, the system does not attempt a re-send that over-delivers
- [ ] **Demo mode:** With `demo_mode_enabled: true`, creditor emails redirect to test address — verify the 2. Anschreiben email service reads this flag (the existing `creditorEmailService.sendEmail()` already does, but a new service class would not)
- [ ] **Client notification link:** Link in client email opens the correct form, not the old financial data form — verify by following the link in a browser
- [ ] **Two-frontend contract:** Admin in MandantenPortalDesign triggers the workflow, client in old `/src/` portal submits the form — verify the API endpoint that the CRA portal calls is the same endpoint the admin dashboard queries for status

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-send: 2. Anschreiben sent twice to creditors | HIGH | Manual admin email to affected creditors explaining the duplicate; no automated fix possible once emails are delivered |
| Wrong plan type generated (Ratenplan instead of Nullplan) | MEDIUM | Update `second_letter_status` back to `SECOND_IN_REVIEW` in MongoDB; regenerate documents; resend manually |
| DOCX with blank fields sent | MEDIUM | Identify affected clients via `second_letter_sent_at`; generate corrected documents; send follow-up with corrected attachment |
| Client notification link expired/broken | LOW | Admin regenerates token via admin panel; resends notification manually |
| Scheduler missed clients (server restart during 30-day window) | LOW | Scheduler will pick up clients on next hourly run; no data loss, just a delay |
| NaN/Infinity in quota values written to database | MEDIUM | Query for clients where `debt_settlement_plan.creditors[].monthly_quota` is not a finite number; recalculate for each |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Double-send (Pitfall 1) | Phase 1: Scheduler + State Machine | Simulate simultaneous trigger calls; verify only one proceeds |
| Schema enum mismatch (Pitfall 2) | Phase 1: Scheduler + State Machine | Mongoose schema test — save a doc with an invalid status value, expect validation error |
| NaN/Infinity quotas (Pitfall 3) | Phase 3: Financial Calculation | Test with creditor with `claim_amount: null`; expect clean error, not corrupted data |
| Wrong plan type from race condition (Pitfall 4) | Phase 2: Client Form + Phase 3: Financial Calculation | Submit form and immediately trigger scheduler; verify snapshot used |
| Template variable mismatch (Pitfall 5) | Phase 4: DOCX Template Integration | Extract all template tags programmatically, compare against generator output |
| Dead client notification link (Pitfall 6) | Phase 2: Client Notification Email | Follow generated link in browser as the client; verify form loads |
| Scheduler reset on restart (Pitfall 7) | Phase 1: Scheduler | Simulate restart by restarting server mid-check; verify no clients are missed |
| Form prefill race condition (Pitfall 8) | Phase 2: Client Form | Test form load on slow connection (throttle to 3G); verify no user input lost |

---

## Sources

- `server/scheduler.js` — existing setInterval pattern, idempotency via DB flags
- `server/services/delayedProcessingService.js` — MongoDB date-based trigger pattern (the correct approach to follow)
- `server/models/Client.js` — schema analysis for where `second_letter_status` must be added
- `server/services/firstRoundDocumentGenerator.js` — docxtemplater usage, `isUsableValue` helper
- `server/services/creditorEmailService.js` — Resend SDK usage, demo mode, CC pattern
- `server/services/germanGarnishmentCalculator.js` — § 850c ZPO table implementation
- `server/controllers/adminFinancialController.js` — quota calculation with division-by-zero risk
- `server/services/secondRoundDocumentService.js` — existing second round infrastructure
- `server/routes/second-round-api.js` — existing route (no idempotency guard)
- `src/components/FinancialDataForm.tsx` — CRA portal form pattern (empty initial state)
- `.planning/PROJECT.md` — milestone context, two-frontend architecture

---
*Pitfalls research for: 2. Anschreiben Automatisierung (v10)*
*Researched: 2026-03-02*
