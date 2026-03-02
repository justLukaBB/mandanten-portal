# Project Research Summary

**Project:** 2. Anschreiben Automatisierung (v10 milestone)
**Domain:** German insolvency case management — automated second creditor letter workflow
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

The 2. Anschreiben (second creditor letter) is a legal obligation under §305 InsO: after the 30-day response window following the first creditor contact round, the debt settlement plan must be formally presented to each creditor with up-to-date financial data. The workflow is a multi-step, two-actor process — the system (or admin) triggers it, the client confirms financial data via a portal form, and the admin dispatches DOCX letters to creditors via email. The codebase already contains substantial scaffolding: document generators, email senders, the garnishment calculator, and even partial second-round services. The central design challenge is not building from scratch but wiring existing pieces together behind a proper state machine that prevents double-sends and captures an immutable financial snapshot.

The recommended approach is to treat `second_letter_status` as the single source of truth for the entire workflow. Every service, route, and UI component reads from and writes to this field. The 4-state machine (`IDLE → PENDING → FORM_SUBMITTED → SENT`, with optional `IN_REVIEW`) gates each step atomically via MongoDB `findOneAndUpdate`, preventing race conditions between the 30-day scheduler and manual admin triggers. The financial data snapshot pattern — capturing calculation inputs at form-submission time rather than reading live data at send time — is the other critical design decision. It ensures DOCX letters reflect what the client confirmed, not a later agent edit.

The top risk is double-sending: creditors receiving the 2. Anschreiben twice. This is unrecoverable by automated means once emails are delivered. The idempotency guard (atomic status claim) must be the very first line of the trigger path, before any document generation or email dispatch. The secondary risk is incorrect plan type (Nullplan vs. Ratenplan) reaching creditors — prevented by capturing the snapshot before generation and giving the admin a review step before final send. Both risks are fully mitigatable with disciplined build order: schema first, snapshot second, calculation third, generation fourth, send last.

---

## Key Findings

### Recommended Stack

No new packages are required for MVP. The full feature set is achievable with already-installed dependencies: `docxtemplater` + `pizzip` for DOCX generation (direct mirror of the 1. Anschreiben pipeline), `resend` v6 for email dispatch, `mongoose` for the state machine and snapshot subdocument, and `express` for new routes. The existing `scheduler.js` `setInterval` pattern is sufficient for the 30-day check — `node-cron` is optional if the team prefers cron syntax but adds no capability. Heavy-weight alternatives (Agenda.js, BullMQ, xstate) are explicitly ruled out: the state machine has 4 linear states, there are no distributed requirements, and all jobs are idempotent against MongoDB.

**Core technologies:**
- `docxtemplater@3.66.4` + `pizzip@3.2.0`: DOCX generation — identical to `firstRoundDocumentGenerator.js`, already installed
- `resend@6.8.0`: Email delivery — `creditorEmailService.sendSecondRoundEmail()` is already implemented, demo-mode-aware, CC-aware
- `mongoose@8.16.5`: State machine enum field + immutable snapshot subdocument on Client model
- `setInterval` in `scheduler.js`: 30-day eligibility polling, stateless against MongoDB (restart-safe)
- `node-cron@^3.0.3` (optional): Cleaner cron syntax; install only if preferred over setInterval

See: `.planning/research/STACK.md`

### Expected Features

The workflow has a clear P1/P2/P3 split. Everything in P1 is required for the workflow to function at all — missing any P1 item means the 2. Anschreiben cannot be sent. P2 items improve correctness and visibility without blocking the happy path.

**Must have (P1 — table stakes):**
- `second_letter_status` state machine on Client model — prerequisite for every other feature
- 30-day scheduler trigger — auto-sets `PENDING` after 30 days post last `email_sent_at`
- Manual admin trigger button in MandantenPortalDesign — needed for exceptions and testing
- Client notification email via Resend with portal deep-link — client must be informed to confirm data
- Pre-filled client portal form in `/src/` (CRA) — confirm/correct `financial_data` + `extended_financial_data`
- `second_letter_financial_snapshot` subdocument — immutable record of confirmed calculation inputs
- Pfändungsberechnung (§850c ZPO) + plan type determination (Ratenplan vs. Nullplan)
- Pro-rata quota per creditor using snapshot data
- DOCX generation (Ratenplan + Nullplan templates) — one letter per creditor
- Resend email dispatch to all creditors with DOCX attachment
- Admin status badge for `second_letter_status`
- Idempotency guard on trigger (atomic MongoDB update)

**Should have (P2 — correctness and visibility):**
- Admin approval gate: `FORM_SUBMITTED → IN_REVIEW` → admin approves → `SENT` (prevents wrong plan type from shipping)
- Plan type admin override (edge case handling before send)
- Per-creditor `second_letter_sent_at` + `second_letter_email_sent_at` tracking fields
- TrackingCanvas 3rd column for 2. Anschreiben (comment at line 59 already exists in codebase)

**Defer (v2+):**
- Snapshot diff display in admin (compare original vs. confirmed financial data)
- Client portal redesign in Vite for the confirmation form (separate milestone per PROJECT.md)
- 3. Anschreiben or multi-round loop (explicitly out of scope for v10)

See: `.planning/research/FEATURES.md`

### Architecture Approach

The architecture is a thin orchestration layer on top of existing services. A new `secondLetterService.js` orchestrator (following the pattern of `creditorContactService.js`) coordinates state machine transitions, calls the document generator, and dispatches via the existing email service. The document generator (`secondRoundDocumentGenerator.js`) mirrors `firstRoundDocumentGenerator.js` exactly — same class structure, different template paths and variable names. The existing `secondRoundManager.js` and `second-round-api.js` are Zendesk-centric exploratory scaffolding and must NOT be used as the pattern for new work.

**Major components:**
1. `Client.js` (MODIFIED) — add `second_letter_status` enum, date fields, `second_letter_snapshot` subdocument, per-creditor tracking fields
2. `secondLetterService.js` (NEW) — main orchestrator: atomic trigger, client notification, snapshot write, document generation, email dispatch
3. `secondRoundDocumentGenerator.js` (NEW) — docxtemplater pipeline for Ratenplan and Nullplan templates; mirrors firstRound generator class
4. `secondLetterSchedulerService.js` (NEW) — MongoDB query for eligible clients (30-day threshold); stateless, restart-safe
5. `admin-second-letter.js` route (NEW) — admin trigger, send, and status endpoints; fire-and-forget pattern for send (202 response)
6. `client-portal.js` (MODIFIED) — add GET + POST for second-letter-form
7. `SecondLetterPanel.tsx` (NEW, admin, MandantenPortalDesign) — status badge, trigger + send actions, plugs into existing ClientDetail
8. `SecondLetterForm.tsx` (NEW, client, `/src/`) — pre-filled CRA wizard for financial data confirmation

State transitions:
```
IDLE → PENDING (scheduler or admin trigger, atomic)
PENDING → FORM_SUBMITTED (client submits portal form, snapshot written)
FORM_SUBMITTED → SENT (admin sends — or via IN_REVIEW approval gate in P2)
```

See: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Double-send via scheduler + manual trigger** — Use `findOneAndUpdate` with `{ second_letter_status: 'IDLE' }` as the filter for every trigger entry point. If the return is null, another process already claimed the lock — abort immediately. The idempotency guard must exist before any document or email logic. Recovery from double-send is manual, permanent, and reputationally damaging.

2. **Schema enum mismatch (undefined field passes every eligibility check)** — Add `second_letter_status` to `Client.js` as the absolute first implementation step. Without it, `client.second_letter_status === undefined` passes every scheduler filter and every guard. Also write a migration script to initialize existing clients with `creditor_contact_started: true` to `IDLE`.

3. **NaN/Infinity in quota calculation from missing claim amounts** — Guard against `totalDebt === 0` before division. Filter creditors with null `claim_amount`. Use `Math.round()` not `toFixed()` (toFixed returns a string, causing downstream type bugs). Assert all template variables are finite numbers before calling docxtemplater.

4. **Wrong plan type from TOCTOU race (snapshot not used at generation time)** — The scheduler must only set `PENDING`, never generate documents. Document generation reads exclusively from `second_letter_snapshot`, written at form submission. Snapshot must be written to MongoDB before document generation begins.

5. **Template variable mismatch causes silent empty fields** — docxtemplater's default `nullGetter` returns empty string on missing tags with no error thrown. Extract all `{VariableName}` placeholders from the user-supplied DOCX templates before writing generation code. Enable `errorLogging: true` in dev. Visually inspect every generated DOCX output.

6. **Dead client notification link** — Do not reuse the onboarding `portal_token`. Generate a short-lived (14-day), single-use `second_letter_form_token`. Test the link in a browser before marking the feature complete.

See: `.planning/research/PITFALLS.md`

---

## Implications for Roadmap

The dependency chain is strict and linear: the state machine schema must exist before any service code; the client form and snapshot must exist before calculations; calculations must exist before DOCX generation; DOCX generation must exist before email dispatch. This dictates a phase structure where each phase has a verifiable output that unblocks the next. No phase can be safely skipped or reordered.

### Phase 1: State Machine Foundation
**Rationale:** Every downstream feature depends on `second_letter_status` existing in the schema. The scheduler and all service guards are inert without it. This is also where the hardest-to-recover-from pitfall (double-send) is permanently prevented.
**Delivers:** Updated `Client.js` schema with all `second_letter_*` fields and creditor tracking fields; migration for existing clients; working `secondLetterSchedulerService.js` with idempotency guard; admin trigger endpoint (202 fire-and-forget); client notification email via Resend with dedicated token
**Addresses:** `second_letter_status` state machine, 30-day scheduler trigger, manual admin trigger, client notification email, idempotency guard
**Avoids:** Pitfall 1 (double-send) and Pitfall 2 (schema mismatch)

### Phase 2: Client Portal Form
**Rationale:** The client form is the only input path for the financial data snapshot. Nothing downstream can run until the client submits confirmed data. The form must also be reachable via a fresh, non-expired, dedicated token.
**Delivers:** `SecondLetterForm.tsx` in CRA portal with pre-fill from `financial_data` + `extended_financial_data`; form submission writing `second_letter_snapshot` and transitioning to `FORM_SUBMITTED`; dedicated short-lived `second_letter_form_token`; loading skeleton pattern preventing race conditions
**Addresses:** Client portal form (pre-fill + confirm), financial data snapshot, token-guarded portal route
**Avoids:** Pitfall 6 (dead link), Pitfall 8 (prefill race condition), Pitfall 4 (TOCTOU — snapshot is written here before generation can start)

### Phase 3: Financial Calculation and Plan Determination
**Rationale:** Calculation reads from the snapshot written in Phase 2. Plan type determination must precede document template selection. This phase can be built and unit-tested in isolation before DOCX generation exists.
**Delivers:** Quota calculation service using snapshot data; Ratenplan/Nullplan determination; all calculation results written into `second_letter_snapshot.creditor_calculations[]`; guards against zero total debt and NaN values
**Addresses:** Pfändungsberechnung (§850c ZPO), plan type determination, pro-rata quota per creditor
**Avoids:** Pitfall 3 (NaN/Infinity), Pitfall 4 (wrong plan type from stale data)

### Phase 4: DOCX Template Integration
**Rationale:** Template variable mapping must be established before generation code is written, not after. Build the generator to match the templates, not the other way around. Requires actual DOCX files from user.
**Delivers:** `secondRoundDocumentGenerator.js` producing correct Ratenplan and Nullplan DOCX files per creditor; variable manifest extracted from templates; development-mode error logging enabled; dry-run output verified visually
**Addresses:** DOCX generation (both plan types)
**Avoids:** Pitfall 5 (template variable mismatch causing silent empty fields)
**Dependency:** User must supply 2. Anschreiben DOCX template files before this phase can begin

### Phase 5: Email Dispatch and Workflow Completion
**Rationale:** Email sends are the point of no return — once sent to creditors there is no automated rollback. This phase must only run after all prior phases are verified. Reuses the fully-implemented `creditorEmailService.sendSecondRoundEmail()` with no modifications.
**Delivers:** Admin "2. Anschreiben senden" action in SecondLetterPanel; fire-and-forget background send; per-creditor `second_letter_email_sent_at` tracking; final `second_letter_status = SENT`; demo mode respected; insolvenz@ra-scuric.de CC included
**Addresses:** Resend email dispatch, per-creditor tracking fields, admin status badge
**Avoids:** Re-entrancy on send; accidental real sends in demo mode

### Phase 6: Admin UI and Tracking (P2 polish)
**Rationale:** The admin panel wires existing status data into visible controls. Admin approval gate (`IN_REVIEW`) and plan type override improve correctness for edge cases. TrackingCanvas extension is lower priority but already scaffolded with a comment.
**Delivers:** Full `SecondLetterPanel.tsx` with status badge, trigger/send controls, admin approval gate, plan type override select; TrackingCanvas 3rd column; RTK Query mutations for all admin actions
**Addresses:** Admin approval gate, plan type admin override, TrackingCanvas extension
**Notes:** Basic panel (status badge + trigger button) can be partially delivered alongside Phase 5; approval gate added in this dedicated phase

### Phase Ordering Rationale

- Phases 1-5 are strictly sequenced due to hard data dependencies (schema → snapshot → calculation → DOCX → email)
- Phase 6 can begin in parallel with Phase 5 for basic UI elements, but the approval gate needs the Phase 5 state transition logic to be stable first
- The 10-step build order in ARCHITECTURE.md maps cleanly onto these 6 phases
- Each phase ends with a verifiable artifact: schema diff, working form submission, unit-tested calculation, generated DOCX file, email delivery confirmed, admin panel functional
- Pitfalls map directly onto phases: Pitfalls 1-2 to Phase 1, Pitfalls 6+8 to Phase 2, Pitfalls 3-4 to Phase 3, Pitfall 5 to Phase 4

### Research Flags

**Phases with well-documented patterns (skip `/gsd:research-phase`):**
- **Phase 1:** setInterval scheduler and Mongoose enum fields are established codebase patterns; atomic `findOneAndUpdate` guard already used for dedup
- **Phase 3:** `germanGarnishmentCalculator.js` already implements §850c ZPO; quota formula is straightforward arithmetic; patterns are fully researched
- **Phase 5:** `creditorEmailService.sendSecondRoundEmail()` is already implemented; reuse without modification

**Phases needing careful attention during planning (not full research but read before coding):**
- **Phase 2:** Read the `authenticateClient` middleware and existing `portal_token` handling in `client-portal.js` before designing the `second_letter_form_token` flow. The token generation mechanism must be compatible with the existing CRA portal auth pattern.
- **Phase 4:** DOCX template files must be received and inspected before a single line of generation code is written. Extract all `{VariableName}` placeholders programmatically first, build the variable data contract, then write the generator.
- **Phase 6:** Confirm with product owner whether admin approval gate (`IN_REVIEW`) is in v1 or deferred, before wiring the Phase 5 send endpoint. This affects which state transitions are valid.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages confirmed installed via direct `package.json` inspection; versions verified; no new dependencies required for MVP |
| Features | HIGH | Derived from direct codebase inspection + §305 InsO / §850c ZPO legal requirements; P1/P2 split validated against existing pipeline as reference |
| Architecture | HIGH | All integration points confirmed by reading actual service files; build order dependency-ordered and verified against existing patterns in the codebase |
| Pitfalls | HIGH | Pitfalls derived from reading actual code (division-by-zero in adminFinancialController.js, existing scheduler idempotency pattern, FinancialDataForm.tsx empty initial state) — not theoretical risks |

**Overall confidence: HIGH**

### Gaps to Address

- **DOCX template variables (Phase 4 blocker):** The actual template files for 2. Anschreiben (Ratenplan + Nullplan) must be received from the user before Phase 4 can begin. Template variable names drive the entire generator data contract. Do not write generation code without the templates in hand.

- **Client notification token design (Phase 2):** The exact mechanism for generating and validating `second_letter_form_token` needs to be designed against the existing `authenticateClient` middleware in `client-portal.js`. Read the token validation logic before designing the Phase 2 route — do not assume it matches `portal_token` from onboarding.

- **Admin approval gate scope (Phase 5/6 boundary):** FEATURES.md marks `IN_REVIEW` as P2 and notes "can start with auto-approve on snapshot submit for speed." This decision must be confirmed before Phase 5 implementation to avoid rework on the `FORM_SUBMITTED → SENT` state transition.

- **Existing second-round routes (deprecation decision):** `server/routes/second-round-api.js` and `server/services/secondRoundManager.js` exist and are architecturally incompatible with the new design. A decision is needed: deprecate/remove vs. leave in place unused. Leaving them active risks confusion about which route frontend should call. Recommend explicit deprecation comment or removal before Phase 6 ships.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `server/services/firstRoundDocumentGenerator.js` — DOCX generation pattern (docxtemplater + pizzip class structure)
- `server/services/creditorEmailService.js` — `sendSecondRoundEmail()` confirmed implemented with demo mode, CC, matcher sync
- `server/services/germanGarnishmentCalculator.js` — §850c ZPO Pfändungstabelle 2025-2026, quota formula
- `server/services/creditorContactService.js` — orchestrator pattern to follow for new secondLetterService
- `server/services/secondRoundManager.js` — Zendesk-centric; confirmed NOT the pattern to follow for new work
- `server/services/secondRoundDocumentService.js` — partial implementation; document generation reusable, orchestration to replace
- `server/models/Client.js` — full schema; confirmed `second_letter_status` does not yet exist
- `server/scheduler.js` — setInterval pattern, idempotency flags, DelayedProcessingService pattern
- `server/controllers/adminFinancialController.js` — division-by-zero risk in quota calculation (lines 130-141)
- `server/routes/client-portal.js`, `admin-client-creditor.js`, `second-round-api.js` — route patterns
- `src/components/FinancialDataForm.tsx`, `ExtendedFinancialDataWizard.tsx` — CRA portal form patterns
- `MandantenPortalDesign/src/store/api/clientDetailApi.ts` — RTK Query mutation + invalidatesTags pattern
- `MandantenPortalDesign/src/app/types.ts` — ClientDetailData interface to extend
- `MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx` (line 59) — 3rd column scaffold comment
- `server/package.json`, `MandantenPortalDesign/package.json` — confirmed installed package versions
- `.planning/PROJECT.md` — milestone scope, two-frontend architecture confirmation

### Secondary (MEDIUM confidence)
- §305 InsO (out-of-court settlement attempt requirement) — legal basis for 30-day trigger timing
- §850c ZPO Pfändungsfreigrenze 2025-2026 — garnishment table; already implemented, secondary source for threshold validation
- betterstack.com scheduler comparison (node-cron vs. setInterval) — confirms setInterval is appropriate for poll-and-check idempotent tasks on single-server deployments

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
