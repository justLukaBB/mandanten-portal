# Requirements: Mandanten Portal — FastAPI Webhook Field Integration

**Defined:** 2026-02-18
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v7 Requirements

### Schema

- [ ] **SCHEMA-01**: Mongoose creditorSchema enthält aktenzeichen_glaeubigervertreter, address_source, llm_address_original, glaeubiger_adresse_ist_postfach, glaeubiger_vertreter_adresse_ist_postfach mit korrekten Defaults
- [ ] **SCHEMA-02**: Mongoose documentSchema.extracted_data.creditor_data enthält die gleichen 5 Felder

### Webhook

- [ ] **HOOK-01**: Webhook Controller extrahiert alle 5 neuen Felder aus dem FastAPI-Payload und speichert sie in documents[] und final_creditor_list[]
- [ ] **HOOK-02**: Enrichment-Logik (enrichDedupedCreditorFromDb) setzt address_source="local_db" wenn sie eine Adresse ersetzt

### Merge

- [ ] **MERGE-01**: mergeCreditorLists() merged aktenzeichen_glaeubigervertreter mit longest-wins Logik (längster non-empty String gewinnt)
- [ ] **MERGE-02**: mergeCreditorLists() merged Postfach-Flags mit OR-Logik (any true → merged true)

## Previous Milestone Requirements (all satisfied)

### v6 — Async Creditor Confirm (Phase 16)

- [x] **CONF-01**: Gläubiger-Bestätigung speichert sofort in DB und antwortet dem User in <2 Sekunden
- [x] **CONF-02**: Creditor-Contact-Emails werden asynchron im Hintergrund nach Bestätigung verschickt (fire-and-forget)
- [x] **CONF-03**: Frontend zeigt sofort "Bestätigt" Success-State ohne auf Email-Versand zu warten

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

- Frontend-Display der neuen Felder (Aktenzeichen Gläubigervertreter, Postfach-Warnung, Adressquelle)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend-Display neuer Felder | v7 ist Backend-only, UI folgt in späterem Milestone |
| Filtered-Bucket-Anzeige (DR II / M-Pattern) | Filterung passiert nur in FastAPI, nicht im Portal |
| Excel-Import/Parsing | Excel wird direkt aus FastAPI geliefert, Node.js verarbeitet es nicht |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 17 | Pending |
| SCHEMA-02 | Phase 17 | Pending |
| HOOK-01 | Phase 17 | Pending |
| HOOK-02 | Phase 17 | Pending |
| MERGE-01 | Phase 18 | Pending |
| MERGE-02 | Phase 18 | Pending |

**Coverage:**
- v7 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after v7 roadmap creation*
