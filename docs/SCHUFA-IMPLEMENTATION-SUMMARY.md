# SCHUFA-Scan Feature — Implementation Summary

## Status: Phase 1-3 DONE, Phase 4 OFFEN

---

## Was gebaut wurde

### Gesamtarchitektur

```
Mandant/Admin laedt Dokument hoch
        |
        v
  ┌─────────────────────────┐
  │  Stufe 1: Filename-Check │  (< 1ms, gratis)
  │  "schufa" im Dateinamen? │
  └────────┬────────────────┘
           │ nein
           v
  ┌─────────────────────────┐
  │  Stufe 2: Gemini Class.  │  (laeuft eh fuer jedes Dokument)
  │  "schufa_auskunft" Typ?  │
  └────────┬────────────────┘
           │
     ┌─────┴──────┐
     v            v
  SCHUFA       Creditor
  Pipeline     Pipeline (unveraendert)
     │
     v
  SchufaProcessor (Gemini 2.5 Pro)
  → Score, Eintraege, Negativmerkmale
  → Glaeubiger-Matching (fuzzy)
  → Loeschfristen (§35 BDSG)
     │
     v
  Webhook → Node.js → MongoDB → Frontend
```

---

## Alle Dateien

### FastAPI Service (`Creditor-process-fastAPI/`)

| Datei | Status | Beschreibung |
|-------|--------|-------------|
| `app/services/schufa_detector.py` | NEU | Stufe 1: 12 Filename-Keywords fuer Regel-Filter |
| `app/services/schufa_processor.py` | NEU | Kern: Gemini SCHUFA-Prompt, Pipeline (OCR → Parse → Match → Deletion) |
| `app/services/schufa_matcher.py` | NEU | Fuzzy Name-Matching (Normalisierung, Abkuerzungen, Token-Overlap) |
| `app/services/deletion_calculator.py` | NEU | Loeschfristen nach §35 BDSG mit End-of-Year-Regel |
| `app/routers/schufa.py` | NEU | `POST /schufa/scan` Endpoint + Background-Task + Webhook |
| `app/models.py` | GEAENDERT | +8 Models: SchufaEntry, SchufaReport, Enums, Request/Response, Webhook |
| `app/services/document_processor.py` | GEAENDERT | Classification-Prompt erkennt `schufa_auskunft` + Early-Return |
| `app/routers/processing.py` | GEAENDERT | Routing: SCHUFA erkannt → SchufaProcessor statt Creditor-Pipeline |
| `app/main.py` | GEAENDERT | SCHUFA Router registriert |

### Node.js Backend (`server/`)

| Datei | Status | Beschreibung |
|-------|--------|-------------|
| `server/routes/schufa.js` | NEU | 4 Admin-Endpoints: Upload, Report, Apply-Creditors, Deletion-Check |
| `server/models/Client.js` | GEAENDERT | `schufa_report` Subdocument mit Entries, Mapping, Deletion, New Creditors |
| `server/utils/fastApiClient.js` | GEAENDERT | +`createSchufaScanJob()` fuer `POST /schufa/scan` |
| `server/routes/webhooks.js` | GEAENDERT | +`POST /webhooks/schufa-processing` Handler (Acknowledge-First, Socket emit) |
| `server/server.js` | GEAENDERT | Route registriert: `/api/admin/schufa` |

### Frontend (`MandantenPortalDesign/src/`)

| Datei | Status | Beschreibung |
|-------|--------|-------------|
| `app/components/schufa-section.tsx` | NEU | Komplette SCHUFA-UI: Upload, Score, Tabelle, Mapping, Loeschfristen |
| `app/types.ts` | GEAENDERT | +6 Interfaces: SchufaReportData, SchufaEntryData, SchufaNewCreditor, etc. |
| `store/api/clientDetailApi.ts` | GEAENDERT | +4 RTK Query Hooks: Upload, Report, ApplyCreditors, DeletionCheck |
| `app/components/client-detail.tsx` | GEAENDERT | SCHUFA Tab hinzugefuegt (TabType, tabs array, SchufaSection render) |

---

## API-Endpoints

### FastAPI (Python)

| Method | Endpoint | Zweck |
|--------|----------|-------|
| POST | `/schufa/scan` | Dedizierter SCHUFA-Scan (Admin, mit Creditor-Matching) |
| POST | `/processing/jobs` | Normaler Upload (Auto-Erkennung routet zu SCHUFA wenn erkannt) |

### Node.js Backend

| Method | Endpoint | Zweck |
|--------|----------|-------|
| POST | `/api/admin/schufa/:clientId/upload` | SCHUFA-PDF hochladen |
| GET | `/api/admin/schufa/:clientId/report` | Report abrufen |
| POST | `/api/admin/schufa/:clientId/apply-new-creditors` | Neue Glaeubiger aus SCHUFA zur Akte |
| GET | `/api/admin/schufa/:clientId/deletion-check` | Loeschbare Eintraege pruefen |
| POST | `/api/webhooks/schufa-processing` | Webhook von FastAPI empfangen |

---

## Datenfluss

### Dedizierter Admin-Upload:
```
Admin klickt "SCHUFA hochladen"
→ POST /api/admin/schufa/:clientId/upload
→ Upload zu GCS (clients/{id}/schufa/{timestamp}_{file})
→ createSchufaScanJob() → POST /schufa/scan (FastAPI)
→ SchufaProcessor: Gemini OCR → Entries + Score + Matching + Deletion
→ Webhook: POST /api/webhooks/schufa-processing
→ MongoDB: Client.schufa_report gespeichert
→ Socket: 'schufa-report-ready' emittiert
→ Frontend: Report angezeigt
```

### Auto-Erkennung im normalen Upload:
```
Mandant laedt "SCHUFA-Auskunft.pdf" hoch
→ POST /api/clients/:clientId/documents (normaler Weg)
→ FastAPI: POST /processing/jobs
→ Stufe 1: Filename "schufa" erkannt → SchufaProcessor
  ODER Stufe 2: Gemini Classifier → "schufa_auskunft" → SchufaProcessor
→ Ergebnis als schufa_detected markiert
→ Webhook zurueck an Node.js
```

---

## Was NICHT gebaut wurde (Phase 4 — offen)

- [ ] Anwalts-Summary-Report (PDF-Export)
- [ ] SCHUFA-Daten automatisch in Insolvenzantrag uebernehmen
- [ ] Automatische Glaeubierliste aus SCHUFA generieren
- [ ] Diskrepanzen-Report (SCHUFA-Betrag vs. Akten-Betrag)

---

## Verifizierung

| Check | Status |
|-------|--------|
| Python Module importierbar | OK |
| schufa_detector Tests (5 Cases) | OK |
| deletion_calculator Tests | OK |
| schufa_matcher Tests (Dt. Telekom) | OK |
| Pydantic Models valide | OK |
| Node.js Module ladbar | OK |
| TypeScript Build (0 Fehler) | OK |
| Frontend kompiliert | OK |
