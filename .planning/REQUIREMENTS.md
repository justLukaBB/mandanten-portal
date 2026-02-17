# Requirements: Mandanten Portal — Async Creditor Confirm

**Defined:** 2026-02-17
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v6 Requirements

### Async Confirmation

- [ ] **CONF-01**: Gläubiger-Bestätigung speichert sofort in DB und antwortet dem User in <2 Sekunden
- [ ] **CONF-02**: Creditor-Contact-Emails werden asynchron im Hintergrund nach Bestätigung verschickt (fire-and-forget)
- [ ] **CONF-03**: Frontend zeigt sofort "Bestätigt" Success-State ohne auf Email-Versand zu warten

## Previous Milestone Requirements (all satisfied)

### v5 — 1. Rate Bestätigung (Phases 13-15)

- [x] **PAY-01**: When 1. Rate is confirmed and no documents exist, system sends email via Resend
- [x] **PAY-02**: No Zendesk review ticket when no documents exist
- [x] **PAY-03**: Existing flow unchanged when documents exist
- [x] **CONT-01**: Auto-continuation after document upload + AI processing
- [x] **CONT-02**: Auto-continuation identical to webhook-triggered handler
- [x] **ADMIN-01**: Admin can trigger full payment handler from Client-Detail
- [x] **ADMIN-02**: Button always visible regardless of payment status
- [x] **ADMIN-03**: Warning if first_payment_received = true
- [x] **ADMIN-04**: Admin-triggered flow identical to Zendesk webhook

### v4 — Editable Creditor Table (Phases 10-12)

- [x] **EDIT-01**: Admin can inline-edit all cells in Gläubiger-Tabelle
- [x] **EDIT-02**: Auto-save on blur with success/error feedback
- [x] **EDIT-03**: Admin can add new creditor rows
- [x] **EDIT-04**: Admin can delete creditor rows with confirmation

## Future Requirements

None planned.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email-Status im User-Portal | Admin sieht Status, User braucht das nicht |
| Email-Templates ändern | Bestehende Templates bleiben |
| Retry-Logik für fehlgeschlagene Emails | Bestehendes Error-Handling reicht |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | TBD | Pending |
| CONF-02 | TBD | Pending |
| CONF-03 | TBD | Pending |

**Coverage:**
- v6 requirements: 3 total
- Mapped to phases: 0
- Unmapped: 3 ⚠️

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after initial definition*
