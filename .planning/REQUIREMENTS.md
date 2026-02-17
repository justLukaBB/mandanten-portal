# Requirements: Mandanten Portal — 1. Rate Bestätigung

**Defined:** 2026-02-17
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v5 Requirements

### Payment Flow — No Documents Case

- [x] **PAY-01**: When 1. Rate is confirmed and no documents exist, system sends email via Resend asking client to upload documents
- [x] **PAY-02**: When 1. Rate is confirmed and no documents exist, no Zendesk review ticket is created
- [x] **PAY-03**: When 1. Rate is confirmed and documents exist, existing flow continues unchanged (Gläubigeranalyse, Zendesk Ticket, ggf. Auto-Approval Email)

### Auto-Continuation After Document Upload

- [x] **CONT-01**: After client uploads documents and AI processing completes, full payment flow runs automatically if 1. Rate was already paid
- [x] **CONT-02**: Auto-continuation performs identical logic to webhook-triggered payment handler (dedup wait, creditor analysis, Zendesk ticket, email)

### Admin Dashboard Button

- [x] **ADMIN-01**: Admin can trigger full payment handler from button in Client-Detail view
- [x] **ADMIN-02**: Button is always visible regardless of payment status
- [x] **ADMIN-03**: Button shows warning/confirmation if client already has first_payment_received = true
- [x] **ADMIN-04**: Admin-triggered payment flow runs identical logic to Zendesk webhook (Gläubigeranalyse, Zendesk Ticket, Email, 7-Tage-Review)

## Future Requirements

### Editable Creditor Table (deferred from v4)

- [x] **EDIT-01**: Admin can inline-edit all cells in Gläubiger-Tabelle
- [x] **EDIT-02**: Auto-save on blur with success/error feedback
- [x] **EDIT-03**: Admin can add new creditor rows
- [x] **EDIT-04**: Admin can delete creditor rows with confirmation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changing Zendesk checkbox trigger | Existing webhook stays, admin button is additive |
| Email template redesign | Simple "bitte Dokumente hochladen" text sufficient |
| Multiple rate tracking | Only 1. Rate confirmation needed |
| Payment provider integration | Rate confirmation is manual, no Stripe/etc. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAY-01 | Phase 13 | Satisfied |
| PAY-02 | Phase 13 | Satisfied |
| PAY-03 | Phase 13 | Satisfied |
| CONT-01 | Phase 14 | Satisfied |
| CONT-02 | Phase 14 | Satisfied |
| ADMIN-01 | Phase 15 | Satisfied |
| ADMIN-02 | Phase 15 | Satisfied |
| ADMIN-03 | Phase 15 | Satisfied |
| ADMIN-04 | Phase 15 | Satisfied |
| EDIT-01 | Phase 11 | Satisfied |
| EDIT-02 | Phase 11 | Satisfied |
| EDIT-03 | Phase 12 | Satisfied |
| EDIT-04 | Phase 12 | Satisfied |

**Coverage:**
- v5 requirements: 9 total → Satisfied: 9/9 ✓
- v4 requirements: 4 total → Satisfied: 4/4 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after gap closure (documentation fixes)*
