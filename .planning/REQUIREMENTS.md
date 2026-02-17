# Requirements: Mandanten Portal — Creditor Processing

**Defined:** 2026-02-17
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v4 Requirements

Requirements for editable Gläubiger-Tabelle. Each maps to roadmap phases.

### Inline Editing

- [ ] **EDIT-01**: Admin can click any cell in the Gläubiger-Tabelle to edit it inline
- [ ] **EDIT-02**: Changes auto-save when the cell loses focus (blur event)
- [ ] **EDIT-03**: Visual feedback per cell on save (success indicator, error state)
- [ ] **EDIT-04**: Backend controller accepts all German fields (glaeubiger_name, glaeubiger_adresse, glaeubigervertreter_name, glaeubigervertreter_adresse, forderungbetrag, email_glaeubiger, email_glaeubiger_vertreter, dokumenttyp, needs_manual_review, review_reasons)

### Row Management

- [ ] **ROW-01**: Admin can add a new creditor row via "Hinzufügen" button
- [ ] **ROW-02**: Admin can delete a creditor row with confirmation dialog
- [ ] **ROW-03**: Table updates immediately after add/delete without page reload

## Future Requirements

### Bulk Operations

- **BULK-01**: Import creditors from Excel/CSV
- **BULK-02**: Bulk delete selected creditors
- **BULK-03**: Undo/redo for recent changes

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drag-and-drop row reordering | Not needed for creditor management |
| Undo/redo history | Auto-save with visual feedback is sufficient for v4 |
| Excel/CSV import | XLSX export exists, import deferred to future |
| Agent portal editing | Admin-only for now, agent portal is read-only |
| Column resizing/hiding | Table layout is fixed, all columns relevant |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EDIT-04 | Phase 10 | Pending |
| EDIT-01 | Phase 11 | Pending |
| EDIT-02 | Phase 11 | Pending |
| EDIT-03 | Phase 11 | Pending |
| ROW-01 | Phase 12 | Pending |
| ROW-02 | Phase 12 | Pending |
| ROW-03 | Phase 12 | Pending |

**Coverage:**
- v4 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
