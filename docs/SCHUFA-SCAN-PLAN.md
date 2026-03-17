# SCHUFA-Scan Feature — Implementierungsplan

## Status: ENTWURF — Warte auf Review

---

## 1. Überblick

SCHUFA-Auskünfte haben ein komplett anderes Layout als Gläubiger-Dokumente (Briefe, Mahnungen, Inkasso). Statt einem Briefkopf + Fließtext enthalten sie:
- Tabellarische Einträge (Kredite, Konten, Bürgschaften)
- Bonitätsscore (0–100%)
- Branchenscores
- Negativmerkmale mit Kennzeichnungen
- Erledigungsvermerke
- Löschfristen

→ Der bestehende Creditor-Dokument-Parser (Gemini-Prompt in `document_processor.py`) ist dafür **nicht geeignet**. Wir brauchen einen eigenen SCHUFA-Parser innerhalb der bestehenden FastAPI-Pipeline.

---

## 2. Architektur-Entscheidung

**Empfehlung: Neuer Router + Processor im bestehenden FastAPI-Service**

Kein separater Service. Wir erweitern `Creditor-process-fastAPI` um:
- `app/routers/schufa.py` — Neuer Endpoint `POST /schufa/scan`
- `app/services/schufa_processor.py` — SCHUFA-spezifischer Gemini-Prompt + Parser
- `app/models.py` — Neue Pydantic-Models für SCHUFA-Daten

**Warum kein separater Service?**
- Gleiche Infrastruktur (GCS Download, Gemini API, Webhook, Rate Limiting)
- Gleicher Deployment-Prozess (Cloud Run)
- 80/20: Neuer Router reicht, kein Overengineering

---

## 2.1 Auto-Erkennung: SCHUFA vs. Gläubiger-Dokument

### Problem
Wenn ein Admin oder Client eine SCHUFA-Auskunft über den **normalen** Dokument-Upload hochlädt (statt den dedizierten SCHUFA-Upload zu nutzen), muss das System das automatisch erkennen und zur SCHUFA-Pipeline routen.

### Lösung: Regel-Filter + Gemini-Classifier (Option A + B kombiniert)

Zweistufige Erkennung im bestehenden Processing-Flow:

```
Dokument-Upload (normaler Weg)
    │
    ▼
┌─────────────────────────────────────┐
│  STUFE 1: Regel-basierter Pre-Filter │
│  (gratis, <1ms, kein API-Call)       │
│                                      │
│  Prüft:                             │
│  - Filename: "schufa", "bonitäts-   │
│    auskunft", "datenübersicht",      │
│    "meineschufa", "schufa_auskunft" │
│  - MIME-Type: nur PDF (SCHUFA ist    │
│    immer PDF, nie einzelnes Bild)    │
│                                      │
│  Match? → Direkt SCHUFA-Pipeline    │
│  Kein Match? → Weiter zu Stufe 2    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  STUFE 2: Gemini Classification      │
│  (läuft eh schon für jedes Dokument) │
│                                      │
│  Erweiterter Prompt erkennt 3 Typen: │
│  - "creditor_document"  → Standard   │
│  - "schufa_auskunft"    → SCHUFA     │
│  - "other"              → Ignorieren │
│                                      │
│  Erkennungsmerkmale für SCHUFA:      │
│  - "SCHUFA Holding AG" Logo/Text     │
│  - "Basisscore" / "Branchenscore"    │
│  - "Datenübersicht nach §34 BDSG"   │
│  - Tabellarisches Score-Layout       │
│  - "Negativmerkmale" Sektion         │
│  - "SCHUFA-Vertragsnummer"           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ROUTING                             │
│                                      │
│  "creditor_document"                 │
│   → Bestehende Creditor-Pipeline     │
│     (extract_data, validate, dedup)  │
│                                      │
│  "schufa_auskunft"                   │
│   → SCHUFA-Pipeline                  │
│     (schufa_processor.py)            │
│   → Webhook: /webhooks/schufa-proc.  │
│                                      │
│  "other"                             │
│   → non_creditor markieren           │
└─────────────────────────────────────┘
```

### Implementierung im Detail

**Stufe 1 — Regel-Filter** (`app/services/schufa_detector.py`):

```python
SCHUFA_FILENAME_KEYWORDS = [
    "schufa", "bonitätsauskunft", "bonitaetsauskunft",
    "datenübersicht", "datenuebersicht", "meineschufa",
    "schufa_auskunft", "schufa-auskunft", "selbstauskunft"
]

def detect_schufa_by_filename(filename: str) -> bool:
    """Schneller Regel-Check auf Dateinamen."""
    name_lower = filename.lower()
    return any(kw in name_lower for kw in SCHUFA_FILENAME_KEYWORDS)
```

**Stufe 2 — Gemini Classification** (Erweiterung `classify_document` in `document_processor.py`):

Bestehender Prompt wird um SCHUFA-Erkennung erweitert:

```
Dokumenttyp bestimmen. Antworte mit EINEM dieser Typen:

- "creditor_document": Gläubiger-Brief, Mahnung, Inkasso, Forderung, Rechnung
- "schufa_auskunft": SCHUFA-Bonitätsauskunft (erkennbar an: SCHUFA Holding AG,
  Basisscore, Branchenscore, Datenübersicht §34 BDSG, Negativmerkmale-Tabelle)
- "other": Alles andere (Werbung, persönliche Dokumente, etc.)
```

**Kosten:** Null extra. Der Classification-Call (`classify_document`) läuft bereits für jedes Dokument. Wir ändern nur den Prompt-Text und werten den neuen Typ `schufa_auskunft` aus.

**Routing-Logik** (Erweiterung `process_documents_task` in `processing.py`):

```python
# Nach Classification, vor Extraction:
if schufa_detected_by_filename or classification.document_type == "schufa_auskunft":
    # SCHUFA-Pipeline statt Creditor-Pipeline
    schufa_processor = SchufaProcessor(api_key=api_key)
    schufa_result = await schufa_processor.process_schufa(
        file_path=image_path,
        existing_creditors=request.options.get("existing_creditors", [])
    )
    # Eigenes Result-Format + eigener Webhook
    ...
else:
    # Bestehende Creditor-Pipeline (unverändert)
    result = await processor.process_document(image_path, filename, document_id)
```

### Warum kein eigenes ML-Model?

- Gemini erkennt SCHUFA-Auskünfte sofort anhand visueller + textueller Merkmale
- Zu wenig Trainingsdaten (SCHUFA-Auskünfte sind selten vs. Gläubiger-Briefe)
- Zusätzliche Infrastruktur (Model-Hosting, Training-Pipeline) lohnt sich nicht
- Der Regel-Filter + Gemini-Classifier deckt 99%+ der Fälle ab

---

## 3. Datenmodell

### 3.1 SCHUFA-Eintrag (einzelne Verbindlichkeit)

```python
class SchufaEntry(BaseModel):
    """Ein einzelner SCHUFA-Eintrag (Kredit, Konto, etc.)"""
    entry_type: str          # kredit, girokonto, kreditkarte, buergschaft,
                             # mahnbescheid, titulierte_forderung,
                             # privatinsolvenz, eidesstattliche_versicherung
    creditor_name: str       # Gläubiger-Name aus SCHUFA
    status: str              # aktiv, erledigt, negativ

    # Finanzdaten
    original_amount: float | None = None      # Ursprünglicher Betrag
    outstanding_amount: float | None = None   # Offener Betrag

    # Referenzen
    contract_number: str | None = None    # Vertragsnummer
    reference_number: str | None = None   # SCHUFA-Referenz

    # Zeitdaten
    entry_date: str | None = None         # Eintragsdatum
    settlement_date: str | None = None    # Erledigungsdatum
    deletion_date: str | None = None      # Berechnetes Löschdatum

    # Negativmerkmale
    is_negative: bool = False
    negative_feature: str | None = None   # Art des Negativmerkmals

    # Matching
    matched_creditor_id: str | None = None  # ID aus final_creditor_list
    match_confidence: float | None = None
    match_status: str = "unmatched"         # unmatched, matched, new, discrepancy
    amount_discrepancy: float | None = None # Differenz SCHUFA vs. Akte
```

### 3.2 SCHUFA-Report (Gesamtdokument)

```python
class SchufaReport(BaseModel):
    """Gesamte SCHUFA-Auskunft eines Mandanten"""
    # Score-Daten
    base_score: float | None = None           # Basisscore (0-100%)
    base_score_rating: str | None = None      # z.B. "erhöhtes Risiko"
    branch_scores: dict[str, float] = {}      # {branche: score}

    # Metadaten
    schufa_contract_number: str | None = None # SCHUFA-Vertragsnummer
    report_date: str | None = None            # Auskunftsdatum
    person_name: str | None = None            # Name der Person
    person_dob: str | None = None             # Geburtsdatum
    person_address: str | None = None         # Aktuelle Anschrift

    # Einträge
    entries: list[SchufaEntry] = []

    # Zusammenfassung
    total_entries: int = 0
    negative_entries: int = 0
    active_entries: int = 0
    settled_entries: int = 0
    total_outstanding: float = 0.0

    # Löschfristen
    deletable_entries: list[dict] = []  # Einträge die löschbar sind/werden

    # Processing
    confidence: float = 0.0
    page_count: int = 0
    processing_notes: list[str] = []
```

### 3.3 MongoDB-Erweiterung (Client-Model)

```javascript
// Neue Felder in Client Schema (server/models/Client.js)
schufa_report: {
    // Upload-Info
    document_id: String,        // Referenz zum uploaded document
    uploaded_at: Date,
    processing_status: String,  // pending, processing, completed, error

    // Score
    base_score: Number,
    base_score_rating: String,
    branch_scores: mongoose.Schema.Types.Mixed,

    // Metadaten
    schufa_contract_number: String,
    report_date: Date,

    // Einträge
    entries: [{
        entry_type: String,
        creditor_name: String,
        status: String,
        original_amount: Number,
        outstanding_amount: Number,
        contract_number: String,
        reference_number: String,
        entry_date: Date,
        settlement_date: Date,
        deletion_date: Date,
        is_negative: Boolean,
        negative_feature: String,
        matched_creditor_id: String,
        match_confidence: Number,
        match_status: String,
        amount_discrepancy: Number
    }],

    // Zusammenfassung
    total_entries: Number,
    negative_entries: Number,
    total_outstanding: Number,
    deletable_entries: [mongoose.Schema.Types.Mixed],

    // Processing
    confidence: Number,
    processing_notes: [String],
    processed_at: Date
}
```

---

## 4. FastAPI — SCHUFA Processing

### 4.1 Neuer Router: `app/routers/schufa.py`

```
POST /schufa/scan
```

**Request:**
```json
{
    "client_id": "CLIENT_123",
    "file": {
        "filename": "schufa-auskunft.pdf",
        "gcs_path": "gs://automation_scuric/clients/CLIENT_123/schufa/schufa-auskunft.pdf",
        "mime_type": "application/pdf"
    },
    "webhook_url": "https://backend.com/api/webhooks/schufa-processing",
    "existing_creditors": [
        {
            "id": "cred_001",
            "name": "Deutsche Telekom AG",
            "claim_amount": 1234.56
        }
    ]
}
```

**Warum `existing_creditors` mitsenden?**
Damit der SCHUFA-Parser direkt das Gläubiger-Mapping machen kann (SCHUFA-Name ↔ Akten-Gläubiger), ohne einen zweiten API-Call.

**Response:**
```json
{
    "job_id": "schufa_job_a1b2c3",
    "status": "accepted",
    "message": "SCHUFA scan accepted. Processing 1 file."
}
```

**Webhook-Result:**
```json
{
    "job_id": "schufa_job_a1b2c3",
    "client_id": "CLIENT_123",
    "status": "completed",
    "schufa_report": { ... },  // Vollständiger SchufaReport
    "creditor_mapping": [
        {
            "schufa_entry_index": 0,
            "schufa_creditor_name": "Dt. Telekom",
            "matched_creditor_id": "cred_001",
            "matched_creditor_name": "Deutsche Telekom AG",
            "match_confidence": 0.95,
            "amount_schufa": 1234.56,
            "amount_akte": 1234.56,
            "discrepancy": 0
        },
        {
            "schufa_entry_index": 3,
            "schufa_creditor_name": "Barclays Bank",
            "matched_creditor_id": null,
            "match_confidence": 0,
            "match_status": "new",
            "amount_schufa": 5678.90,
            "suggested_action": "add_to_creditor_list"
        }
    ],
    "new_creditors": [
        {
            "name": "Barclays Bank",
            "amount": 5678.90,
            "source": "schufa",
            "entry_type": "kreditkarte"
        }
    ],
    "deletion_analysis": [
        {
            "creditor_name": "Alte Forderung GmbH",
            "entry_date": "2020-01-15",
            "settlement_date": "2022-06-01",
            "deletion_date": "2025-06-01",
            "is_deletable_now": true,
            "days_until_deletion": -289
        }
    ]
}
```

### 4.2 SCHUFA-Processor: `app/services/schufa_processor.py`

Verwendet Gemini mit **SCHUFA-spezifischem Prompt**:

```python
class SchufaProcessor:
    """
    SCHUFA-Auskunft Parser mit Gemini Vision.

    Unterschied zum Creditor-Parser:
    - Tabellarisches Layout statt Briefformat
    - Score-Grafik auslesen
    - Mehrere Sektionen (Konten, Kredite, Negativmerkmale)
    - Löschfristen berechnen
    """

    async def process_schufa(self, file_path, existing_creditors=None):
        # 1. OCR + Strukturerkennung via Gemini
        # 2. Score-Extraktion
        # 3. Einträge parsen (tabellarisch)
        # 4. Negativmerkmale identifizieren
        # 5. Gläubiger-Mapping (wenn existing_creditors vorhanden)
        # 6. Löschfristen berechnen
        pass
```

**Gemini-Prompt-Strategie:**
Ein einziger multimodaler Call (PDF → Gemini 2.5 Flash) mit strukturiertem JSON-Output. Kein Tesseract/Textract nötig — Gemini kann PDFs nativ lesen und das tabellarische Layout verstehen.

**Warum kein Tesseract/AWS Textract?**
- Gemini 2.5 Flash versteht bereits Tabellen, Scores und Layout
- Kein zusätzlicher Service/Kosten nötig
- Konsistent mit bestehendem Creditor-Processing
- Tesseract als Fallback nur wenn Gemini-Qualität nicht reicht (Phase 2)

### 4.3 Löschfristen-Berechnung

```python
def calculate_deletion_dates(entries: list[SchufaEntry]) -> list[dict]:
    """
    SCHUFA-Löschfristen nach §35 BDSG:

    - Anfragen: 12 Monate
    - Kredit-/Kontodaten: nach Vertragsende + 3 Jahre
    - Titulierte Forderungen: 3 Jahre nach Erledigung
    - Mahnbescheide: 3 Jahre nach Erledigung
    - Privatinsolvenz: 3 Jahre nach Erteilung Restschuldbefreiung
    - Eidesstattliche Versicherung: 3 Jahre nach Abgabe
    - Haftbefehl zur Abgabe EV: sofort nach Aufhebung
    """
```

---

## 5. Node.js Backend — Integration

### 5.1 Neuer Route-File: `server/routes/schufa.js`

| Method | Endpoint | Zweck |
|--------|----------|-------|
| POST | `/api/clients/:clientId/schufa/upload` | SCHUFA-Dokument hochladen |
| GET | `/api/clients/:clientId/schufa/report` | SCHUFA-Report abrufen |
| POST | `/api/clients/:clientId/schufa/apply-mapping` | Gläubiger-Mapping anwenden |
| GET | `/api/clients/:clientId/schufa/deletion-check` | Löschbare Einträge prüfen |

### 5.2 Upload-Flow

```
1. Admin lädt SCHUFA-PDF hoch
   POST /api/clients/:clientId/schufa/upload

2. Upload zu GCS (wie bestehende Dokumente)
   → gs://automation_scuric/clients/{clientId}/schufa/{filename}

3. FastAPI-Job erstellen
   POST /schufa/scan (mit existing_creditors aus final_creditor_list)

4. Webhook empfangen
   POST /api/webhooks/schufa-processing

5. Daten in Client.schufa_report speichern

6. Admin sieht Report im Dashboard
```

### 5.3 Webhook-Handler: Erweiterung `server/routes/webhooks.js`

Neuer Handler für `POST /api/webhooks/schufa-processing`:
- SCHUFA-Report in Client speichern
- Neue Gläubiger aus SCHUFA automatisch zur `final_creditor_list` hinzufügen (mit `source: "schufa"`)
- Diskrepanzen flaggen (SCHUFA-Betrag ≠ Akten-Betrag)
- Client-Status updaten

---

## 6. Frontend — Admin Dashboard

### 6.1 Neue Komponenten in `MandantenPortalDesign/src/`

```
app/
  admin/
    clients/
      [id]/
        schufa/
          page.tsx                    — SCHUFA-Tab im Client-Detail
          components/
            schufa-upload.tsx         — Upload-Dropzone für SCHUFA-PDF
            schufa-score-card.tsx     — Score-Anzeige (Basisscore + Branchen)
            schufa-entries-table.tsx  — Tabellarische Einträge
            schufa-mapping-table.tsx  — Gläubiger-Mapping mit Aktionen
            schufa-deletion-card.tsx  — Löschbare Einträge
            schufa-summary-card.tsx   — Zusammenfassung für Anwalt
```

### 6.2 UI-Konzept (kurz)

**Tab "SCHUFA" im Client-Detail:**

1. **Upload-Bereich** — Drag & Drop, PDF-Vorschau
2. **Score-Karte** — Basisscore groß, Branchenscores klein, Rating-Text
3. **Einträge-Tabelle** — Alle SCHUFA-Einträge, filterbar nach Typ/Status
4. **Gläubiger-Mapping** — SCHUFA-Name ↔ Akten-Gläubiger, "Hinzufügen"-Button für neue
5. **Löschfristen** — Ampel-System (löschbar jetzt / bald / nicht)
6. **Anwalts-Report** — Ein-Klick-Export als PDF

---

## 7. Implementierungs-Phasen

### Phase 1: Auto-Erkennung + FastAPI SCHUFA-Processor (Kern) — ERLEDIGT
**Status: DONE**

- [x] `app/services/schufa_detector.py` — Regel-basierter Filename-Filter (Stufe 1)
- [x] `app/services/document_processor.py` — Classification-Prompt erweitern um `schufa_auskunft` Typ (Stufe 2)
- [x] `app/routers/processing.py` — Routing-Logik: SCHUFA erkannt → SCHUFA-Pipeline
- [x] `app/models.py` — SchufaEntry, SchufaReport, Request/Response Models + Enums
- [x] `app/services/schufa_processor.py` — Gemini-Prompt für SCHUFA-Layout (Vertex AI)
- [x] `app/services/schufa_matcher.py` — Gläubiger-Name-Matching (Normalisierung + Token-Overlap + Abkürzungen)
- [x] `app/services/deletion_calculator.py` — Löschfristen nach §35 BDSG (End-of-Year Regel)
- [x] `app/routers/schufa.py` — `POST /schufa/scan` Endpoint (dedizierter Upload + Webhook)
- [x] `app/main.py` — SCHUFA Router registriert
- [ ] Tests mit echten SCHUFA-PDFs (anonymisiert)

### Phase 2: Node.js Backend Integration — ERLEDIGT
**Status: DONE**

- [x] `server/models/Client.js` — schufa_report Schema (Score, Entries, Mapping, Deletion, New Creditors)
- [x] `server/routes/schufa.js` — 4 Endpoints: Upload, Report, Apply-New-Creditors, Deletion-Check
- [x] `server/routes/webhooks.js` — SCHUFA Webhook Handler (Acknowledge-First, Socket emit)
- [x] `server/utils/fastApiClient.js` — `createSchufaScanJob()` mit Auth + Timeout
- [x] `server/server.js` — Route registriert unter `/api/admin/schufa`
- [x] GCS-Upload-Pfad: `clients/{clientId}/schufa/{timestamp}_{filename}`

### Phase 3: Frontend Admin-Dashboard — ERLEDIGT
**Status: DONE**

- [x] SCHUFA-Tab im Client-Detail (`client-detail.tsx`: TabType, tabs array, render)
- [x] `schufa-section.tsx` — Eigenständige Komponente (Upload, Score, Tabelle, Mapping, Löschfristen)
- [x] Upload-Dropzone (Drag & Drop + Click, PDF-only, Processing-State)
- [x] Score-Anzeige (Basisscore gross, Branchenscores als Pills, Metadaten)
- [x] Einträge-Tabelle (filterbar: Alle/Negativ/Aktiv/Erledigt, Status-Badges, Matching-Status)
- [x] Neue Gläubiger aus SCHUFA (Checkbox-Auswahl + "Hinzufügen"-Button)
- [x] Löschfristen-Ampel (grün=jetzt, gelb=bald, grau=nicht)
- [x] TypeScript Types (`types.ts`: SchufaReportData, SchufaEntryData, etc.)
- [x] RTK Query API Hooks (`clientDetailApi.ts`: Upload, Report, ApplyCreditors, DeletionCheck)
- [x] TypeScript Build: 0 Fehler

### Phase 4: Reports & Insolvenzantrag-Integration
**Aufwand: ~1 Tag**

- [ ] Anwalts-Summary-Report (PDF-Export)
- [ ] SCHUFA-Daten in Insolvenzantrag übernehmen
- [ ] Automatische Gläubigerliste aus SCHUFA generieren
- [ ] Diskrepanzen-Report

---

## 8. Offene Entscheidungen

| # | Frage | Entscheidung |
|---|-------|------------|
| 1 | OCR-Engine: Gemini-only oder Tesseract-Fallback? | **Gemini-only** starten, Tesseract nur bei nachgewiesener Qualitätslücke |
| 2 | SCHUFA-Upload durch Client oder nur Admin? | **Nur Admin** (Phase 1). Client-Upload ist DSGVO-sensitiver |
| 6 | Auto-Erkennung von SCHUFA im normalen Upload? | **Ja** — Regel-Filter (Filename) + Gemini-Classifier kombiniert. Kein eigenes ML-Model. |
| 3 | Automatisch Gläubiger hinzufügen oder nur vorschlagen? | **Vorschlagen** mit Admin-Bestätigung. Zu viele False Positives bei Auto-Add |
| 4 | Verschlüsselung SCHUFA-Daten at-rest? | **Ja** — GCS Customer-Managed Encryption Key (CMEK). SCHUFA-Daten sind hochsensibel |
| 5 | Löschfristen: nur anzeigen oder aktiv Löschanträge generieren? | **Nur anzeigen** (Phase 1). Automatische Löschanträge = Phase 2 |

---

## 9. Risiken & Mitigations

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| SCHUFA-Layout variiert je nach Auskunftstyp (Eigenauskunft vs. Vermieterauskunft vs. Bankauskunft) | Hoch | Prompt muss robust sein. Testset mit allen Varianten aufbauen |
| Gemini erkennt tabellarische Daten nicht korrekt | Mittel | Prompt-Engineering + manuelle QA. Fallback: Textract für Tabellen |
| Gläubiger-Names in SCHUFA weichen stark von Akten-Namen ab (z.B. "Dt. Tlkm." vs "Deutsche Telekom AG") | Mittel | Fuzzy-Matching + Gemini-basiertes Matching (LLM kennt Abkürzungen) |
| DSGVO: SCHUFA-Daten sind besonders schützenswert | Hoch | CMEK-Verschlüsselung, Access-Logging, Löschkonzept |

---

## 10. Dateien die geändert/erstellt werden

### Neu erstellen:
```
# FastAPI
Creditor-process-fastAPI/app/services/schufa_detector.py      — Regel-Filter (Stufe 1)
Creditor-process-fastAPI/app/routers/schufa.py                 — Dedizierter SCHUFA-Endpoint
Creditor-process-fastAPI/app/services/schufa_processor.py      — SCHUFA Gemini-Parser
Creditor-process-fastAPI/app/services/schufa_matcher.py        — Gläubiger Fuzzy-Matching
Creditor-process-fastAPI/app/services/deletion_calculator.py   — Löschfristen-Berechnung

# Node.js
server/routes/schufa.js

# Frontend
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/page.tsx
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/components/schufa-upload.tsx
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/components/schufa-score-card.tsx
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/components/schufa-entries-table.tsx
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/components/schufa-mapping-table.tsx
MandantenPortalDesign/src/app/admin/clients/[id]/schufa/components/schufa-deletion-card.tsx
```

### Erweitern:
```
# FastAPI
Creditor-process-fastAPI/app/models.py                    — SchufaEntry, SchufaReport Models
Creditor-process-fastAPI/app/main.py                       — SCHUFA Router registrieren
Creditor-process-fastAPI/app/services/document_processor.py — Classification-Prompt: "schufa_auskunft" Typ
Creditor-process-fastAPI/app/routers/processing.py         — Routing-Logik nach Classification

# Node.js
server/models/Client.js                          — schufa_report Schema
server/routes/webhooks.js                        — SCHUFA Webhook Handler
server/utils/fastApiClient.js                    — createSchufaScanJob()
server/app.js                                    — Route registrieren

# Frontend
MandantenPortalDesign/src/store/api/clientDetailApi.ts  — SCHUFA API Calls
```
