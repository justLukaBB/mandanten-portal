# Feature Research

**Domain:** German insolvency management — 2. Anschreiben (second creditor letter) automation
**Researched:** 2026-03-02
**Confidence:** HIGH — based on direct codebase inspection and existing 1. Anschreiben pipeline as reference

---

## What Already Exists (Do Not Rebuild)

These are fully shipped and must be treated as inputs, not tasks.

| Existing Component | Location | Relevance to 2. Anschreiben |
|---|---|---|
| 1. Anschreiben pipeline | `server/services/firstRoundDocumentGenerator.js`, `creditorEmailService.js` | Direct template for 2. Anschreiben pipeline |
| GermanGarnishmentCalculator | `server/services/germanGarnishmentCalculator.js` | §850c ZPO table, quota per creditor — already works |
| `financial_data` on Client | `monthly_net_income`, `number_of_children`, `marital_status`, `garnishable_amount`, `recommended_plan_type` | Data source for portal pre-fill |
| `extended_financial_data` on Client | `berufsstatus`, `arbeitgeber`, `unterhaltsberechtigte`, `sozialleistungen`, `vermögen`, `planlaufzeit` | Data source for portal pre-fill |
| `determined_plan_type` on Client | `nullplan / ratenzahlung / einmalzahlung` | Plan type already stored after ExtendedFinancialDataWizard |
| FinancialDataForm | `src/components/FinancialDataForm.tsx` | Basic income/family form — pre-fill and confirm pattern |
| ExtendedFinancialDataWizard | `src/components/ExtendedFinancialDataWizard.tsx` | 5-step extended wizard — reuse flow model |
| PersonalPortal | `src/pages/PersonalPortal.tsx` | Mounts all client-facing forms; new step added here |
| SecondRoundManager | `server/services/secondRoundManager.js` | Orchestration class exists (Zendesk-based, needs adapt) |
| SecondRoundDocumentService | `server/services/secondRoundDocumentService.js` | Document generation exists (pfaendbares_einkommen, Schuldenbereinigungsplan) |
| SecondRoundEmailSender | `server/services/secondRoundEmailSender.js` | Email sender exists (Resend-based) |
| second-round-api routes | `server/routes/second-round-api.js` | REST API exists (trigger, check, status, execute) |
| DOCX templates | `server/templates/` | Nullplan_Text_Template.docx, Template-Word-Pfaendbares-Einkommen.docx present |
| Resend SDK v6 | `creditorEmailService.js` | Already used for creditor emails |
| Scheduler | `server/scheduler.js` | setInterval-based; add new task here |
| TrackingCanvas comment | `MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx:59` | Already has explicit note to add 3rd column for 2. Anschreiben |

**Key gap:** The existing SecondRoundManager is Zendesk-centric and does not follow the new milestone's design — no `second_letter_status` state machine, no client portal form step, no 30-day scheduler trigger based on `email_sent_at`, no admin trigger button in MandantenPortalDesign. The existing code is exploratory scaffolding, not the final implementation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the admin and the workflow process require. Missing any of these makes the 2. Anschreiben workflow non-functional.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| `second_letter_status` state machine on Client model | Tracks workflow progression independently from `current_status`; required for all guards, UI badges, and scheduler logic | LOW | New field: `FIRST_SENT → SECOND_PENDING → SECOND_IN_REVIEW → SECOND_SENT`. Must be atomic. |
| 30-day scheduler trigger | Automatically sets `SECOND_PENDING` after 30 days post last `email_sent_at`; industry-standard insolvency practice (OutOfCourt period) | MEDIUM | Add to `scheduler.js` via setInterval (hourly check). Query: `creditor_contact_started: true`, max `email_sent_at` across `final_creditor_list` ≥ 30 days ago, `second_letter_status` not yet set. |
| Manual admin trigger button | Admin must be able to trigger 2. Anschreiben early (client urgency, test, exception handling) | LOW | Button in MandantenPortalDesign client detail view. Calls existing `POST /api/second-round/trigger/:clientReference` or a new dedicated route. Must require `FIRST_SENT` guard. |
| Client notification email (Resend) | Mandant must be notified to log in and confirm financial data; without this the portal form is never found | LOW | Send via Resend (not Zendesk side conversation). Include deep link to portal with `clientId` param. Mirror pattern from `welcomeEmailService.js`. |
| Pre-filled client portal form | Client confirms/corrects existing financial data snapshot before 2. Anschreiben is generated; data may have changed since 1. Anschreiben | MEDIUM | New step in `PersonalPortal.tsx`. Pre-fill from `financial_data` + `extended_financial_data`. On submit: save snapshot to `second_letter_financial_snapshot` sub-document on Client, set `second_letter_status = SECOND_IN_REVIEW`. |
| Financial data snapshot on submit | Calculation must be based on data at time of confirmation, not live `financial_data` (which agents may update separately) | LOW | Store as `second_letter_financial_snapshot: { ...fields, confirmed_at }` on Client model. One-time write, never overwritten. |
| Pfändungsberechnung (§850c ZPO) | Core legal requirement — garnishable income determines whether Ratenplan or Nullplan applies | LOW | Already implemented in `germanGarnishmentCalculator.js`. Call `calculateGarnishableAmount(income, children, maritalStatus)` using snapshot data. |
| Plan type determination | Ratenplan if `garnishable_amount >= 1 €/month`, Nullplan if `< 1 €/month` | LOW | Logic already in `secondRoundDocumentService.js` (`pfaendbarAmount < 1`). Surface result clearly. |
| Pro-rata quota per creditor | Each creditor receives proportional share of monthly garnishable amount based on their debt vs total debt | LOW | Already in `germanGarnishmentCalculator.js` (`monthly_quota`). Must use snapshot-confirmed data. |
| DOCX generation — Ratenplan template | Letter to each creditor showing their individual quota and payment plan | MEDIUM | Template `Template-Word-Pfaendbares-Einkommen.docx` exists. Pipe through docxtemplater with snapshot data. One document per creditor. |
| DOCX generation — Nullplan template | Separate letter for cases with zero garnishable income, informing creditors | MEDIUM | Template `Nullplan_Text_Template.docx` exists. `nullplanCreditorLetterGenerator.js` partially handles this. |
| Resend email dispatch to creditors | Send generated DOCX to each creditor via email with 2s delay between sends | LOW | Fully reuse `creditorEmailService.js` pattern. Update per-creditor `contact_status` and add `second_round_email_sent_at`. |
| Admin status badge for `second_letter_status` | Admin must see workflow state at a glance on client list and detail view | LOW | Use existing `status-badge.tsx` component with new enum values. |
| Admin tracking view extension | 2. Anschreiben column in ReactFlow tracking canvas | MEDIUM | TrackingCanvas.tsx already has a comment at line 59 describing exactly this. Add 3rd column of nodes. |

### Differentiators (Competitive Advantage)

Features that improve the quality or auditability of the workflow beyond minimum.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Idempotency guard on trigger | Prevents double-sending if scheduler and admin both trigger simultaneously | LOW | Atomic MongoDB `findOneAndUpdate` with `second_letter_status: { $exists: false }` condition. Same pattern as existing dedup guard. |
| Snapshot diff display in admin | Admin can see what changed between original `financial_data` and `second_letter_financial_snapshot` before approving | MEDIUM | Compare two objects, highlight changed fields. Useful for review step. Could reuse `review_diffs` pattern. |
| Per-creditor second round tracking fields | Audit trail: `second_round_email_sent_at`, `second_round_document_sent_at` per creditor in `final_creditor_list[]` | LOW | Extend creditor schema. Needed for tracking view and re-send logic. |
| SECOND_IN_REVIEW admin approval step | Admin reviews snapshot + plan type before documents are generated and sent | MEDIUM | `SECOND_PENDING → SECOND_IN_REVIEW` (client confirms) → admin approves → `SECOND_SENT`. Prevents sending wrong plan type without human check. |
| Plan type override by admin | Admin can override system-determined plan type (Ratenplan ↔ Nullplan) before sending | LOW | Simple select in admin detail view. Common in practice when edge cases arise. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Rebuild SecondRoundManager from scratch | Old code is Zendesk-centric and doesn't match new milestone | Risk of losing working document generation logic | Adapt existing services: keep `secondRoundDocumentService.js` doc generation, replace Zendesk upload step with Resend-based send, add state machine on top |
| Auto-approve and send without admin review | Faster workflow | Wrong plan type gets sent to all creditors; requires manual correction with each creditor individually | Keep `SECOND_IN_REVIEW` state; admin approves before final dispatch |
| Bulk trigger all eligible clients at once | Seems efficient | Masks eligibility edge cases, overwhelming email volume, no per-client audit | Manual trigger per client in admin, plus scheduler with guards |
| Store generated DOCX files on disk long-term | Simple approach used in current `secondRoundDocumentService.js` | Files accumulate, no cleanup, breaks on server restart, not accessible from other services | Generate on-demand, stream to email, discard. Or GCS if persistence needed (already integrated). |
| Client portal redesign as part of this milestone | Portal redesign is a separate milestone in PROJECT.md | Scope creep; delays 2. Anschreiben by weeks | Use existing CRA portal `/src/` with its existing patterns (axios, CRA components). New step only. |
| 3. Anschreiben or multi-round loop | Natural extension | Explicitly out of scope in PROJECT.md | Design state machine to accommodate future rounds, but do not implement |

---

## Feature Dependencies

```
[30-day Scheduler / Admin Trigger]
    └──requires──> [second_letter_status field on Client model]
                       └──requires──> [Client model migration/update]

[Client Notification Email (Resend)]
    └──requires──> [second_letter_status = SECOND_PENDING set by trigger]

[Client Portal Form (pre-filled confirm)]
    └──requires──> [Client Notification Email sent with portal link]
    └──requires──> [financial_data + extended_financial_data already in DB]
                       └──already fulfilled by ExtendedFinancialDataWizard (existing)

[Financial Data Snapshot]
    └──requires──> [Client Portal Form submitted]

[Pfändungsberechnung + Plan Type]
    └──requires──> [Financial Data Snapshot]
    └──uses──> [germanGarnishmentCalculator.js (existing)]

[DOCX Generation — Ratenplan or Nullplan]
    └──requires──> [Plan Type Determination]
    └──requires──> [Financial Data Snapshot]
    └──requires──> [final_creditor_list with claim_amount per creditor]
    └──uses──> [docxtemplater + pizzip (existing)]

[Resend Email Dispatch to Creditors]
    └──requires──> [DOCX Generation complete]
    └──requires──> [Admin approval (SECOND_IN_REVIEW → approved)]
    └──uses──> [creditorEmailService.js (existing)]
    └──sets──> [second_letter_status = SECOND_SENT]

[Admin Tracking View Extension]
    └──requires──> [per-creditor second_round_email_sent_at fields]
    └──enhances──> [TrackingCanvas 3rd column (commented out, ready)]

[Admin Status Badge]
    └──requires──> [second_letter_status field]
    └──uses──> [status-badge.tsx (existing)]
```

### Dependency Notes

- **`second_letter_status` is the critical prerequisite:** Every other feature depends on this field existing on the Client model. It must be added first.
- **Snapshot must precede calculation:** Pfändung and quota are computed from the snapshot, not live data. Snapshot write and calculation must be transactional (or at minimum sequential and flagged).
- **Admin approval gates sending:** Without the `SECOND_IN_REVIEW` → approved transition, documents could be sent with incorrect plan type. This guard is the most important correctness feature.
- **Existing document services are reusable but not plug-and-play:** `secondRoundDocumentService.js` generates the right documents but expects `settlementData` in a specific shape and writes to local disk. Adapter layer needed.

---

## MVP Definition

### Launch With (v1 of this milestone)

Minimum viable workflow: admin can trigger, client confirms, system calculates and sends.

- [ ] `second_letter_status` field on Client model (`FIRST_SENT → SECOND_PENDING → SECOND_IN_REVIEW → SECOND_SENT`) — prerequisite for everything
- [ ] 30-day scheduler trigger — sets `SECOND_PENDING` automatically; without this admins must do it all manually
- [ ] Manual admin trigger button in MandantenPortalDesign client detail — needed for exceptions and testing
- [ ] Client notification email via Resend with portal link — client must be informed to confirm data
- [ ] New portal form step in `/src/PersonalPortal.tsx` — pre-fill from existing `financial_data` + `extended_financial_data`, allow corrections, write snapshot
- [ ] `second_letter_financial_snapshot` sub-document on Client model — stores confirmed data immutably
- [ ] Pfändungsberechnung using snapshot data → plan type determination (Ratenplan/Nullplan) — core legal requirement
- [ ] Pro-rata quota calculation per creditor — required for Ratenplan letter content
- [ ] DOCX generation for determined plan type (Ratenplan: one per creditor, Nullplan: one per creditor) — the actual letters
- [ ] Resend email dispatch to creditors with DOCX attachment — the 2. Anschreiben itself
- [ ] `second_letter_status = SECOND_SENT` + per-creditor `second_round_email_sent_at` after dispatch — audit trail
- [ ] Admin status badge for `second_letter_status` in client list and detail — visibility into state

### Add After Validation (v1.x)

- [ ] Admin approval step (`SECOND_IN_REVIEW` gate before sending) — desirable but can start with auto-approve on snapshot submit for speed
- [ ] Plan type override by admin — useful edge case handling; add after first real cases
- [ ] TrackingCanvas 3rd column for 2. Anschreiben nodes — UX enhancement; comment already exists in code

### Future Consideration (v2+)

- [ ] Snapshot diff display in admin detail — nice-to-have; aids review quality
- [ ] Client portal redesign (Vite-based) for the data confirmation form — separate milestone (confirmed in PROJECT.md)
- [ ] 3. Anschreiben or further rounds — explicitly out of scope for v10

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| `second_letter_status` state machine | HIGH | LOW | P1 |
| 30-day scheduler trigger | HIGH | MEDIUM | P1 |
| Manual admin trigger button | HIGH | LOW | P1 |
| Client notification email | HIGH | LOW | P1 |
| Client portal form (pre-fill + confirm) | HIGH | MEDIUM | P1 |
| Financial data snapshot | HIGH | LOW | P1 |
| Pfändungsberechnung + plan type | HIGH | LOW | P1 — calculator exists |
| Quota per creditor | HIGH | LOW | P1 — calculator exists |
| DOCX generation (Ratenplan) | HIGH | MEDIUM | P1 — templates exist |
| DOCX generation (Nullplan) | HIGH | MEDIUM | P1 — templates exist |
| Resend email dispatch | HIGH | LOW | P1 — service exists |
| Admin status badge | MEDIUM | LOW | P1 — component exists |
| Idempotency guard on trigger | HIGH | LOW | P1 — learned from dedup |
| Per-creditor second round tracking fields | MEDIUM | LOW | P2 |
| Admin approval gate (SECOND_IN_REVIEW) | MEDIUM | MEDIUM | P2 |
| TrackingCanvas 3rd column | MEDIUM | MEDIUM | P2 |
| Plan type admin override | MEDIUM | LOW | P2 |
| Snapshot diff display | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — workflow is broken without it
- P2: Should have — improves correctness and visibility significantly
- P3: Nice to have — deferred to after validation

---

## Domain-Specific Behavior Notes

### How 2. Anschreiben Works in German Insolvency Practice

The 2. Anschreiben (second creditor letter) is sent after the initial 30-day creditor response period following the 1. Anschreiben. Its purpose is to present the formal Schuldenbereinigungsplan (debt settlement plan) to creditors.

**Trigger timing:** §305 InsO requires the debtor's attorney to attempt an out-of-court settlement before filing for insolvency. The 30-day window after the 1. Anschreiben is the standard response collection period. After this, updated financial data is gathered and the plan is formalized.

**Data confirmation requirement:** The client must re-confirm financial data because circumstances may have changed since the initial intake (income change, new dependents, change in assets). This confirmation also creates the legal basis for the plan figures.

**Ratenplan vs Nullplan determination:**
- `garnishable_amount >= 1 €/month` → Ratenplan (installment plan): creditors receive pro-rata monthly payments over 36, 48, or 60 months (`gewuenschte_planlaufzeit`)
- `garnishable_amount < 1 €/month` → Nullplan (zero plan): creditors receive nothing, agreeing to debt discharge in exchange for 6-year good-faith period
- The §850c ZPO Pfändungstabelle 2025-2026 (July 2025 – June 2026) is already implemented in `germanGarnishmentCalculator.js`

**Quota calculation:** Each creditor's monthly quota = `(creditor_claim_amount / total_debt) * garnishable_amount`. Total quotas sum to `garnishable_amount`. Rounding is applied per creditor, last creditor absorbs rounding residual.

**Document structure:**
- Ratenplan: One letter per creditor showing their specific quota, plan duration, monthly amount, and payment schedule
- Nullplan: One letter per creditor explaining zero distribution and requesting acceptance

### Existing Code Assessment

The `secondRoundDocumentService.js` and `secondRoundManager.js` are exploratory services built before the current milestone was specified. They contain useful document generation logic but have three key problems for the v10 milestone:

1. They depend on `debt_settlement_plan` and `creditor_calculation_table` fields, not the new `second_letter_financial_snapshot` approach
2. The orchestration goes through Zendesk for document upload, which is not the new approach
3. There is no `second_letter_status` state machine — the current code only has in-memory processing state

**Recommendation:** Retain the document generation core from `secondRoundDocumentService.generateSecondRoundDocuments()`, write a new orchestration service that uses the state machine and the confirmed snapshot, and discard the Zendesk upload step.

---

## Sources

- Direct codebase inspection: `server/services/secondRoundManager.js`, `secondRoundDocumentService.js`, `germanGarnishmentCalculator.js`, `firstRoundDocumentGenerator.js`, `creditorEmailService.js`
- Client model inspection: `server/models/Client.js` (full schema)
- Old portal: `src/components/FinancialDataForm.tsx`, `ExtendedFinancialDataWizard.tsx`, `src/pages/PersonalPortal.tsx`
- Admin portal: `MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx` (line 59 comment)
- Project specification: `.planning/PROJECT.md`
- German insolvency law reference: §305 InsO (out-of-court settlement attempt), §850c ZPO (Pfändungsfreigrenze)

---

*Feature research for: 2. Anschreiben Automatisierung (v10 milestone)*
*Researched: 2026-03-02*
