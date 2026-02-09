# Requirements: Multi-Page PDF Support

**Defined:** 2026-02-09
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v3 Requirements

### PDF Processing

- [x] **PDF-01**: FastAPI akzeptiert und verarbeitet `application/pdf` MIME-Type neben bestehenden Bildformaten
- [ ] **PDF-02**: Gemini extrahiert alle Gläubiger aus mehrseitigen PDFs (Sammel-Scans mit mehreren Briefen)
- [ ] **PDF-03**: Mehrseitige Gläubiger-Briefe (1 Gläubiger über 2-3 Seiten) werden als ein Gläubiger erkannt

### Backward Compatibility

- [x] **COMPAT-01**: Bestehender Single-Image Upload-Flow funktioniert unverändert
- [ ] **COMPAT-02**: Webhook-Ergebnisse für PDFs nutzen identische Datenstruktur wie für Bilder (`creditor_index`, `creditor_count`, `source_document_id`)

### Error Handling

- [x] **ERR-01**: Korrupte/passwortgeschützte PDFs liefern klare Fehlermeldung statt Crash

## Future Requirements

### Page Assignment

- **PAGE-01**: Seitenzuordnung pro Gläubiger (`pages: [1,2,3]`) in Extraction-Ergebnissen
- **PAGE-02**: Confidence Scoring per Page Group

### Scalability

- **SCALE-01**: Batching/chunking for 100+ creditor lists
- **SCALE-02**: Alert/notification on repeated dedup failures

## Out of Scope

| Feature | Reason |
|---------|--------|
| Physisches PDF Page-Splitting in separate Dateien | Nur Daten-Extraktion nötig, kein Seiten-Splitting |
| PDF→Image Konvertierung vor Gemini | Gemini verarbeitet PDFs nativ |
| OCR Preprocessing Layer | Gemini macht OCR nativ |
| Separater Upload-Flow für PDFs | Bestehender Upload akzeptiert PDFs bereits |
| PDF Viewer/Preview im Frontend | Bestehende Document Links reichen |
| Page Range Assignment | Deferred to future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PDF-01 | Phase 8 | Complete |
| PDF-02 | Phase 9 | Pending |
| PDF-03 | Phase 9 | Pending |
| COMPAT-01 | Phase 8 | Complete |
| COMPAT-02 | Phase 9 | Pending |
| ERR-01 | Phase 8 | Complete |

**Coverage:**
- v3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after v3 roadmap creation*
