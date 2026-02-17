# Requirements: Mandanten Portal — 1. Rate Bestätigung

**Defined:** 2026-02-17
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v5 Requirements

### Payment Flow — No Documents Case

- [ ] **PAY-01**: When 1. Rate is confirmed and no documents exist, system sends email via Resend asking client to upload documents
- [ ] **PAY-02**: When 1. Rate is confirmed and no documents exist, no Zendesk review ticket is created
- [ ] **PAY-03**: When 1. Rate is confirmed and documents exist, existing flow continues unchanged (Gläubigeranalyse, Zendesk Ticket, ggf. Auto-Approval Email)

### Auto-Continuation After Document Upload

- [ ] **CONT-01**: After client uploads documents and AI processing completes, full payment flow runs automatically if 1. Rate was already paid
- [ ] **CONT-02**: Auto-continuation performs identical logic to webhook-triggered payment handler (dedup wait, creditor analysis, Zendesk ticket, email)

### Admin Dashboard Button

- [ ] **ADMIN-01**: Admin can trigger full payment handler from button in Client-Detail view
- [ ] **ADMIN-02**: Button is always visible regardless of payment status
- [ ] **ADMIN-03**: Button shows warning/confirmation if client already has first_payment_received = true
- [ ] **ADMIN-04**: Admin-triggered payment flow runs identical logic to Zendesk webhook (Gläubigeranalyse, Zendesk Ticket, Email, 7-Tage-Review)

## Future Requirements

### Editable Creditor Table (deferred from v4)

- **EDIT-01**: Admin can inline-edit all cells in Gläubiger-Tabelle
- **EDIT-02**: Auto-save on blur with success/error feedback
- **EDIT-03**: Admin can add new creditor rows
- **EDIT-04**: Admin can delete creditor rows with confirmation

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
| PAY-01 | Phase 13 | Pending |
| PAY-02 | Phase 13 | Pending |
| PAY-03 | Phase 13 | Pending |
| CONT-01 | Phase 14 | Pending |
| CONT-02 | Phase 14 | Pending |
| ADMIN-01 | Phase 15 | Pending |
| ADMIN-02 | Phase 15 | Pending |
| ADMIN-03 | Phase 15 | Pending |
| ADMIN-04 | Phase 15 | Pending |

**Coverage:**
- v5 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
