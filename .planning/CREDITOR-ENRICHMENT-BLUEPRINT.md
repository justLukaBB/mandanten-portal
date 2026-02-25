# Creditor Data Enrichment Service — Finaler Implementierungsplan

> **Version:** 1.1 | **Datum:** 2026-02-24 | **Status:** APPROVED — Ready for Implementation

### Entscheidungen (bestätigt)

| Frage | Entscheidung |
|---|---|
| LLM für Impressum-Extraktion | **Gemini Flash** (günstiger, bereits integriert) |
| Auto-Update Threshold CreditorDB | **≥ 0.8 Confidence** |
| Enrichment-Timing | **Synchron** im Webhook-Processing |
| OffeneRegister Datenhaltung | **API-Calls** (simpler, ~200 Calls/Monat rechtfertigen keinen lokalen Dump) |
| Deployment | **Neuer eigener FastAPI Server** (separater Container, Port 8001) |

---

## 1. Ziel & Kontext

### Was wird gebaut?
Ein FastAPI-Microservice, der fehlende Gläubigerdaten (E-Mail, Adresse, Telefon, Ansprechpartner) automatisch aus dem Internet beschafft, wenn die interne `CreditorDatabase` keinen Match liefert.

### Position in der bestehenden Pipeline

```
┌─────────────────────────┐
│  1. Dokument-Extraktion │  FastAPI/Gemini extrahiert Gläubigerdaten aus PDFs/DOCX
│     (existiert)         │  → webhookController.js empfängt Results
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  2. Lokale DB Lookup    │  creditorLookup.js → findCreditorByName()
│     (existiert)         │  → enrichCreditorContactFromDb() in webhookController.js
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  3. WEB ENRICHMENT      │  ← NEU — Dieses System
│     (wird gebaut)       │  Automatisierte Internetrecherche für fehlende Felder
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  4. Final Creditor List │  Client.final_creditor_list mit angereicherten Daten
│     (existiert)         │  → Zendesk-Tickets, Dokument-Generierung, Settlement
└─────────────────────────┘
```

### Was existiert bereits?

| Komponente | Datei | Status |
|---|---|---|
| CreditorDatabase Model | `server/models/CreditorDatabase.js` | Aktiv — Schema mit `creditor_name`, `email`, `address`, `phone`, `alternative_names` |
| Lokaler Lookup | `server/utils/creditorLookup.js` | Aktiv — Fuzzy Name Matching (Keyword-Overlap + Threshold 65%) |
| Enrichment (lokal) | `server/controllers/webhookController.js:69-168` | Aktiv — `enrichCreditorContactFromDb()` füllt `email`/`address` aus lokaler DB |
| Dedup Enrichment | `server/controllers/webhookController.js:175-242` | Aktiv — `enrichDedupedCreditorFromDb()` für deduplizierte Einträge |
| FastAPI Client | `server/utils/fastApiClient.js` | Aktiv — Rate Limiting, Circuit Breaker, Health Check |
| Creditor Schema | `server/models/Client.js:85-193` | Aktiv — `creditorSchema` mit contact_status, confidence, enrichment-Feldern |

### Was fehlt komplett?
- Kein Google Places API-Zugriff
- Kein Impressum-Scraping
- Kein Handelsregister-Lookup
- Kein externer Enrichment-Service
- Wenn lokale DB keinen Match hat → Creditor wird `needs_review` geflaggt → manuelles Recherchieren

---

## 2. Architektur-Entscheidungen

### 2.1 Deployment-Strategie: Eigenständiger FastAPI Service

```
┌──────────────────────┐        HTTP/REST         ┌─────────────────────────┐
│   Node.js Backend    │ ──────────────────────► │  Enrichment Service     │
│   (Express, Port     │  POST /api/v1/enrich    │  (FastAPI, Port 8001)   │
│    10000)            │ ◄────────────────────── │                         │
│                      │       JSON Response      │  - Google Places        │
│  webhookController   │                          │  - Impressum Scraper    │
│  enrichmentClient.js │                          │  - Handelsregister      │
└──────────────────────┘                          │  - Redis Cache          │
                                                  └─────────────────────────┘
```

**Warum eigener Service statt Integration in bestehenden FastAPI?**
- Bestehender FastAPI Service = Dokument-Extraktion (Gemini, hohe Latenzen, Job-basiert)
- Enrichment = leichtgewichtig, synchron, eigene Rate Limits
- Unabhängiges Deployment und Skalierung
- Separater Redis-Cache mit eigenem TTL

### 2.2 Quellen-Kaskade

```
Eingang: creditor_name + known_data + missing_fields
                    │
                    ▼
        ┌───────────────────────┐
        │  1. Google Places API │  $0.017/req — Adresse, Telefon, Website
        │     (immer zuerst)    │  → Fuzzy Name Match zur Verifikation
        └───────────┬───────────┘
                    │ noch fehlende Felder?
                    ▼
        ┌───────────────────────┐
        │  2. Impressum Scraper │  ~$0.005/req — E-Mail, GF, Telefon, Fax
        │     (wenn Website da) │  → Playwright holt Impressum-HTML
        │                       │  → LLM extrahiert strukturiert
        └───────────┬───────────┘
                    │ noch fehlende Felder?
                    ▼
        ┌───────────────────────┐
        │  3. Handelsregister   │  Kostenlos — Firmensitz, Rechtsform, GF
        │     (OffeneRegister)  │  → REST API, kein Scraping nötig
        └───────────┬───────────┘
                    │
                    ▼
              Ergebnis mit
           Confidence Scores
```

**Abbruch-Logik:** Sobald alle `missing_fields` gefüllt sind → Kaskade stoppt. Keine unnötigen API-Calls.

---

## 3. Integration in bestehenden Code

### 3.1 Integrationspunkt: webhookController.js

Die Web-Enrichment wird als **dritter Schritt** nach dem lokalen DB-Lookup eingefügt. Betroffene Stelle: `webhookController.js` im Processing-Flow.

```
// AKTUELL (Zeile ~350):
await enrichCreditorContactFromDb(docResult, creditorLookupCache);

// NEU (nach lokalem Lookup):
await enrichCreditorContactFromDb(docResult, creditorLookupCache);
await enrichCreditorFromWeb(docResult, webEnrichmentCache);  // ← NEU
```

### 3.2 Neuer Client: `server/utils/enrichmentClient.js`

Analog zum bestehenden `fastApiClient.js`, aber für den Enrichment-Service:

```javascript
// Konfiguration
const ENRICHMENT_URL = process.env.ENRICHMENT_SERVICE_URL || 'http://localhost:8001';
const ENRICHMENT_TIMEOUT = 30000; // 30 Sekunden (vs. 20 Min für Gemini)

// Interface
async function enrichCreditorFromWeb(creditorName, knownData, missingFields, caseId) {
    // POST /api/v1/enrich-creditor
    // Returns: { enriched_data, confidence, sources, status, enrichment_log }
}
```

### 3.3 Enrichment-Ergebnis in Creditor-Schema speichern

Bestehende Felder im `creditorSchema` (`Client.js`) die bereits nutzbar sind:

| Feld | Nutzung für Enrichment |
|---|---|
| `sender_email` | E-Mail aus Web-Enrichment |
| `sender_address` | Adresse aus Web-Enrichment |
| `address_source` | Erweitern: `'local_db'` \| `'google_places'` \| `'impressum'` \| `'handelsregister'` |
| `confidence` | Confidence Score aus Enrichment |
| `validation.requires_manual_review` | `false` wenn Confidence ≥ 0.7 |

**Neue Felder (Schema-Erweiterung nötig):**

```javascript
// Zum creditorSchema in Client.js hinzufügen:
enrichment_source: { type: String },           // 'google_places' | 'impressum' | 'handelsregister'
enrichment_confidence: { type: Number },        // 0.0–1.0
enrichment_status: { type: String },            // 'enriched' | 'partial' | 'not_found' | 'pending'
enriched_at: { type: Date },
enrichment_log: [{
    source: String,
    fields_found: [String],
    confidence: Number,
    timestamp: Date
}],
phone: { type: String },                        // Telefonnummer (aus Google Places / Impressum)
geschaeftsfuehrer: { type: String },            // Geschäftsführer (aus Impressum / Handelsregister)
website: { type: String },                      // Website URL
rechtsform: { type: String },                   // GmbH, AG, etc. (aus Handelsregister)
hrb_nummer: { type: String },                   // Handelsregisternummer
```

### 3.4 CreditorDatabase Rückspeicherung

Wenn der Web-Enrichment-Service Daten findet, werden diese **zurück in die CreditorDatabase** geschrieben, damit zukünftige Lookups direkt greifen:

```javascript
// Nach erfolgreichem Enrichment:
await CreditorDatabase.findOneAndUpdate(
    { creditor_name: creditorName },
    { $set: { email, address, phone, ... } },
    { upsert: true }
);
```

Das ist der **Self-Learning-Effekt**: Jedes erfolgreiche Web-Enrichment verbessert die lokale DB für die Zukunft.

---

## 4. FastAPI Service — Technischer Aufbau

### 4.1 Projektstruktur

```
creditor-enrichment-service/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI App + Middleware
│   ├── config.py                  # Settings (Pydantic BaseSettings)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py              # POST /api/v1/enrich-creditor
│   │   └── schemas.py             # Request/Response Pydantic Models
│   ├── sources/
│   │   ├── __init__.py
│   │   ├── base.py                # Abstract Source-Klasse
│   │   ├── google_places.py       # Google Places API
│   │   ├── impressum_scraper.py   # Impressum Scraping + LLM
│   │   └── handelsregister.py     # OffeneRegister API
│   ├── services/
│   │   ├── __init__.py
│   │   ├── orchestrator.py        # Kaskaden-Logik
│   │   ├── confidence.py          # Confidence Scoring
│   │   └── name_matching.py       # Fuzzy Name Matching (Levenshtein/Jaro-Winkler)
│   └── utils/
│       ├── __init__.py
│       ├── cache.py               # Redis Client
│       └── html_cleaner.py        # HTML → Clean Text
├── tests/
│   ├── test_google_places.py
│   ├── test_impressum_scraper.py
│   ├── test_orchestrator.py
│   └── test_confidence.py
├── Dockerfile
├── docker-compose.yml             # Service + Redis
├── requirements.txt
├── .env.example
└── README.md
```

### 4.2 API Contract

**Request: `POST /api/v1/enrich-creditor`**

```json
{
    "creditor_name": "Vodafone GmbH",
    "known_data": {
        "city": "Düsseldorf",
        "postal_code": "40549"
    },
    "missing_fields": ["email", "address", "phone"],
    "case_id": "2024_001"
}
```

**Response:**

```json
{
    "status": "complete",
    "enriched_data": {
        "email": "kundenservice@vodafone.de",
        "address": "Ferdinand-Braun-Platz 1, 40549 Düsseldorf",
        "phone": "+49 211 533-0",
        "website": "https://www.vodafone.de",
        "geschaeftsfuehrer": "Philippe Rogge",
        "rechtsform": "GmbH"
    },
    "confidence": {
        "email": 0.92,
        "address": 0.95,
        "phone": 0.95,
        "website": 0.98,
        "geschaeftsfuehrer": 0.85,
        "rechtsform": 0.99
    },
    "sources": {
        "email": "impressum",
        "address": "google_places",
        "phone": "google_places",
        "website": "google_places",
        "geschaeftsfuehrer": "impressum",
        "rechtsform": "handelsregister"
    },
    "enrichment_log": [
        {
            "source": "google_places",
            "timestamp": "2026-02-24T10:00:01Z",
            "fields_found": ["address", "phone", "website"],
            "duration_ms": 450
        },
        {
            "source": "impressum",
            "timestamp": "2026-02-24T10:00:03Z",
            "fields_found": ["email", "geschaeftsfuehrer"],
            "duration_ms": 1800
        },
        {
            "source": "handelsregister",
            "timestamp": "2026-02-24T10:00:04Z",
            "fields_found": ["rechtsform"],
            "duration_ms": 600
        }
    ]
}
```

**Fehler-Response:**

```json
{
    "status": "not_found",
    "enriched_data": {},
    "confidence": {},
    "sources": {},
    "enrichment_log": [
        {
            "source": "google_places",
            "timestamp": "2026-02-24T10:00:01Z",
            "fields_found": [],
            "error": "No match found for 'Fantasie-Gläubiger XYZ'"
        }
    ]
}
```

### 4.3 Source Modules

#### 4.3.1 Google Places (Primär)

```python
# app/sources/google_places.py

class GooglePlacesSource(BaseSource):
    """
    API: Google Places API (New) — Text Search
    Query:  "{creditor_name}" + Location Bias (Stadt/PLZ falls bekannt)
    Fields: formatted_address, phone_number, website, business_status
    Cost:   $0.017 pro Request
    """

    async def fetch(self, request, missing_fields):
        # 1. Text Search: "Vodafone GmbH" + locationBias Düsseldorf
        # 2. Fuzzy Name Match auf Top-Ergebnis (Jaro-Winkler ≥ 0.85)
        # 3. Place Details für fehlende Felder (Phone, Website)
        # 4. Return gefundene Felder mit Confidence
        pass

    def calculate_confidence(self, search_name, place_name, place_data):
        # Base: Jaro-Winkler Score (0.85–1.0 → 0.7–1.0 Confidence)
        # Bonus: +0.05 wenn Stadt/PLZ übereinstimmt
        # Bonus: +0.05 wenn business_status = OPERATIONAL
        pass
```

**Google Places API Details:**
- Endpoint: `https://places.googleapis.com/v1/places:searchText`
- Header: `X-Goog-Api-Key`, `X-Goog-FieldMask`
- FieldMask: `places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.businessStatus`
- Location Bias: `locationBias.circle.center` mit Geocoded Stadt/PLZ

#### 4.3.2 Impressum Scraper

```python
# app/sources/impressum_scraper.py

class ImpressumScraperSource(BaseSource):
    """
    Voraussetzung: Website-URL (von Google Places oder known_data)
    Schritte:
    1. Impressum-Seite finden (Common Paths + Link-Text-Suche)
    2. HTML cleanen (nur Text-Content)
    3. LLM extrahiert strukturiert
    Cost: ~$0.005 pro Request (LLM-Kosten)
    """

    IMPRESSUM_PATHS = [
        '/impressum', '/imprint', '/legal',
        '/kontakt', '/contact', '/about/impressum',
        '/de/impressum', '/rechtliches/impressum'
    ]

    async def fetch(self, request, missing_fields):
        website = request.known_data.get('website') or self.context.get('website')
        if not website:
            return EmptyResult()

        # 1. Impressum-URL finden
        impressum_url = await self._find_impressum_page(website)
        if not impressum_url:
            return EmptyResult()

        # 2. HTML holen und cleanen
        html_text = await self._fetch_and_clean(impressum_url)

        # 3. LLM-Extraktion
        extracted = await self._extract_with_llm(html_text, missing_fields)
        return extracted

    async def _extract_with_llm(self, text, missing_fields):
        """
        Gemini 2.0 Flash — bereits im Projekt integriert.
        Prompt extrahiert nur die angeforderten Felder.
        """
        prompt = f"""
        Extrahiere aus diesem Impressum-Text die folgenden Daten:
        Gesuchte Felder: {missing_fields}

        Text:
        {text[:4000]}

        Antworte NUR als JSON:
        {{"email": "...", "address": "...", "phone": "...",
          "geschaeftsfuehrer": "...", "fax": "...", "ust_id": "..."}}
        Felder die nicht gefunden werden: null
        """
        pass
```

**Impressum-Suche Strategie:**
1. Bekannte Pfade durchprobieren (HEAD Request → 200?)
2. Startseite laden → Link-Text-Suche: "Impressum", "Imprint", "Legal Notice"
3. Sitemap.xml durchsuchen (falls vorhanden)
4. Timeout: 10 Sekunden pro Website

**HTML-Cleaning:**
- `beautifulsoup4` → nur Text-Nodes aus `<main>`, `<article>`, `<div>` Bereichen
- Script/Style/Nav/Footer entfernen
- Max 4.000 Zeichen an LLM senden (Kostenoptimierung)

#### 4.3.3 Handelsregister (OffeneRegister)

```python
# app/sources/handelsregister.py

class HandelsregisterSource(BaseSource):
    """
    API: OffeneRegister.de (Open Data, kostenlos)
    Endpoint: https://db.offeneregister.de/openregister.json
    Liefert: Firmensitz, Rechtsform, Geschäftsführer, HRB
    Limitation: Keine E-Mails, nicht immer aktuell
    """

    async def fetch(self, request, missing_fields):
        # Nur abfragen wenn wir address/rechtsform/geschaeftsfuehrer brauchen
        relevant = {'address', 'rechtsform', 'geschaeftsfuehrer', 'hrb_nummer'}
        if not missing_fields.intersection(relevant):
            return EmptyResult()

        # SQLite-basierte Suche auf OffeneRegister
        results = await self._search(request.creditor_name)
        # Fuzzy Match auf Name → bestes Ergebnis
        pass
```

**Hinweis zu OffeneRegister:**
- Datasette-basierte JSON-API (kein lokaler Dump nötig bei ~200 Calls/Monat)
- Enthält ~6 Mio. deutsche Unternehmen
- Daten können veraltet sein (Stand: letzter Dump)
- **Entscheidung:** API-Calls — einfacher zu warten, Volume rechtfertigt keinen lokalen Dump

---

## 5. Confidence Scoring — Detail

### 5.1 Score-Berechnung pro Feld

```python
def calculate_field_confidence(source, name_match_score, cross_validated=False):
    # Basis-Score nach Quelle
    source_scores = {
        'handelsregister': 0.95,   # Offizielles Register
        'google_places':   0.85,   # Google-verifiziert
        'impressum':       0.80,   # Website-Impressum (Pflichtangabe)
    }
    base = source_scores.get(source, 0.5)

    # Name-Match-Qualität (Jaro-Winkler Score 0-1)
    match_factor = name_match_score  # z.B. 0.92

    # Cross-Source-Bonus (+0.1 wenn gleiche Daten aus 2+ Quellen)
    cross_bonus = 0.10 if cross_validated else 0.0

    # Finaler Score (gedeckelt auf 1.0)
    return min(1.0, base * match_factor + cross_bonus)
```

### 5.2 Automatische Aktion nach Score

| Score | Label | Aktion im Node-Backend |
|---|---|---|
| ≥ 0.9 | HIGH | `enrichment_status: 'enriched'`, auto-übernehmen, kein Review nötig |
| 0.7–0.89 | MEDIUM | `enrichment_status: 'enriched'`, übernehmen, `needs_review`-Flag bleibt aktiv |
| 0.5–0.69 | LOW | `enrichment_status: 'partial'`, Daten gespeichert aber als "Vorschlag" markiert |
| < 0.5 | REJECT | `enrichment_status: 'not_found'`, Daten verworfen, manuelles Review nötig |

### 5.3 Cross-Source-Validierung

Wenn Google Places und Impressum die gleiche Adresse liefern → Confidence +0.10.
Matching-Logik: Normalisierte Adresse (ohne Abkürzungen) vergleichen mit Levenshtein ≥ 0.9.

---

## 6. Caching & Performance

### 6.1 Redis Cache

```python
# Cache-Key: Normalisierter Gläubiger-Name
cache_key = f"enrich:{normalize(creditor_name)}"
TTL = 30 * 24 * 60 * 60  # 30 Tage

# Auch negative Ergebnisse cachen (kürzerer TTL)
negative_cache_key = f"enrich:miss:{normalize(creditor_name)}"
NEGATIVE_TTL = 7 * 24 * 60 * 60  # 7 Tage
```

**Warum 30 Tage?** Firmen-Kontaktdaten ändern sich selten. Nach 30 Tagen automatisch re-validieren.

### 6.2 Rate Limiting

```python
# Pro Quelle getrennt
RATE_LIMITS = {
    'google_places': TokenBucket(requests_per_minute=50),
    'impressum_scraper': TokenBucket(requests_per_minute=20),  # Websites nicht DDoSen
    'handelsregister': TokenBucket(requests_per_minute=30),
}
```

### 6.3 Erwartete Latenz

| Szenario | Latenz |
|---|---|
| Cache Hit | < 50ms |
| Nur Google Places nötig | ~500ms |
| Google Places + Impressum | ~2-3 Sekunden |
| Alle 3 Quellen | ~3-5 Sekunden |

**Da der Enrichment im Webhook-Processing passiert (bereits async), sind 3-5 Sekunden akzeptabel.**

---

## 7. Fehlerbehandlung

### 7.1 Source-Level

```python
class BaseSource:
    MAX_RETRIES = 2
    RETRY_DELAY = 1.0  # Sekunden

    async def fetch_with_retry(self, request, missing_fields):
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                return await self.fetch(request, missing_fields)
            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                if attempt == self.MAX_RETRIES:
                    log.warning(f"Source {self.name} failed after {self.MAX_RETRIES} retries", error=str(e))
                    return EmptyResult(error=str(e))
                await asyncio.sleep(self.RETRY_DELAY * (attempt + 1))
```

### 7.2 Service-Level Circuit Breaker

Wenn eine Quelle >5x hintereinander fehlschlägt → für 60 Sekunden deaktivieren. Identisch zum bestehenden Pattern in `fastApiClient.js`.

### 7.3 Graceful Degradation

- Google Places API down → Impressum Scraper + Handelsregister arbeiten weiter
- Redis down → Service funktioniert ohne Cache (jeder Request geht an APIs)
- LLM API down → Impressum Scraper wird übersprungen
- Enrichment Service komplett down → Node-Backend fällt zurück auf lokale DB only (aktuelles Verhalten)

---

## 8. Integration — Node.js Backend Änderungen

### 8.1 Neue Datei: `server/utils/enrichmentClient.js`

```javascript
const httpx = require('axios');

const ENRICHMENT_URL = process.env.ENRICHMENT_SERVICE_URL || 'http://localhost:8001';
const ENRICHMENT_TIMEOUT = 30000;
const ENRICHMENT_ENABLED = process.env.ENRICHMENT_ENABLED !== 'false';

async function callEnrichmentService(creditorName, knownData, missingFields, caseId) {
    if (!ENRICHMENT_ENABLED) return null;

    try {
        const response = await httpx.post(`${ENRICHMENT_URL}/api/v1/enrich-creditor`, {
            creditor_name: creditorName,
            known_data: knownData,
            missing_fields: missingFields,
            case_id: caseId,
        }, { timeout: ENRICHMENT_TIMEOUT });

        return response.data;
    } catch (error) {
        console.warn('[enrichmentClient] Service unavailable, skipping web enrichment', {
            error: error.message,
            creditor: creditorName,
        });
        return null;
    }
}

module.exports = { callEnrichmentService };
```

### 8.2 Neue Funktion: `enrichCreditorFromWeb()` in webhookController.js

```javascript
async function enrichCreditorFromWeb(docResult, cache) {
    if (!docResult?.is_creditor_document) return;

    const creditorData = docResult.extracted_data?.creditor_data || {};

    // Prüfen welche Felder noch fehlen NACH lokalem DB-Lookup
    const missingFields = [];
    if (isMissing(creditorData.email) && isMissing(creditorData.sender_email)) missingFields.push('email');
    if (isMissing(creditorData.address) && isMissing(creditorData.sender_address)) missingFields.push('address');
    if (isMissing(creditorData.phone)) missingFields.push('phone');

    if (missingFields.length === 0) return; // Alles da → nichts zu tun

    const candidateName = creditorData.sender_name || creditorData.glaeubiger_name || ...;
    if (!candidateName) return;

    // Cache-Check (same session)
    const cacheKey = `web:${candidateName.toLowerCase().trim()}`;
    if (cache.has(cacheKey)) {
        applyWebEnrichment(docResult, cache.get(cacheKey));
        return;
    }

    // Web-Enrichment Service aufrufen
    const result = await callEnrichmentService(
        candidateName,
        { city: creditorData.city, postal_code: creditorData.postal_code },
        missingFields,
        docResult.case_id
    );

    cache.set(cacheKey, result);
    if (result && result.status !== 'not_found') {
        applyWebEnrichment(docResult, result);
    }
}
```

### 8.3 CreditorDatabase Auto-Update

Nach erfolgreichem Web-Enrichment wird die lokale DB automatisch angereichert:

```javascript
async function updateCreditorDatabase(creditorName, enrichedData, sources) {
    // Nur bei hoher Confidence (≥ 0.8) automatisch in DB speichern
    const highConfidenceFields = {};
    for (const [field, value] of Object.entries(enrichedData)) {
        if (enrichedData.confidence?.[field] >= 0.8) {
            highConfidenceFields[field] = value;
        }
    }

    if (Object.keys(highConfidenceFields).length === 0) return;

    await CreditorDatabase.findOneAndUpdate(
        { creditor_name: new RegExp(`^${escapeRegex(creditorName)}$`, 'i') },
        {
            $set: highConfidenceFields,
            $setOnInsert: { creditor_name: creditorName, is_active: true }
        },
        { upsert: true }
    );
}
```

---

## 9. Monitoring & Observability

### 9.1 Structured Logging

Jeder Enrichment-Call wird mit Source-Tracking geloggt:

```json
{
    "event": "enrichment_complete",
    "creditor_name": "Vodafone GmbH",
    "case_id": "2024_001",
    "status": "complete",
    "sources_queried": ["google_places", "impressum"],
    "fields_found": ["email", "address", "phone"],
    "total_duration_ms": 2100,
    "from_cache": false
}
```

### 9.2 Metriken (für späteres Admin Dashboard)

- `enrichment_requests_total` — Counter pro Status (complete/partial/not_found)
- `enrichment_source_hits` — Counter pro Quelle
- `enrichment_cache_hit_rate` — Cache-Effizienz
- `enrichment_latency_seconds` — Histogram pro Quelle
- `enrichment_confidence_distribution` — Histogram der Confidence Scores

### 9.3 Admin-Sichtbarkeit

In der bestehenden Admin UserDetailView: Neues Tab/Sektion "Enrichment" das pro Gläubiger zeigt:
- Quelle der Daten (Badge: "Google Places", "Impressum", etc.)
- Confidence Score (visueller Indikator)
- Timestamp der Anreicherung
- Option: "Manuell verifizieren" Button

---

## 10. Environment Variables

### Enrichment Service (Python)

```env
# Google Places API
GOOGLE_PLACES_API_KEY=AIza...
GOOGLE_PLACES_RATE_LIMIT=50    # requests/minute

# LLM für Impressum-Extraktion (Gemini Flash — bestätigt)
GEMINI_API_KEY=...
LLM_MODEL=gemini-2.0-flash

# Redis
REDIS_URL=redis://localhost:6379/0
CACHE_TTL_DAYS=30
NEGATIVE_CACHE_TTL_DAYS=7

# Service
PORT=8001
LOG_LEVEL=info
ENVIRONMENT=production
```

### Node.js Backend (bestehend — neue Vars)

```env
# Enrichment Service
ENRICHMENT_SERVICE_URL=http://localhost:8001
ENRICHMENT_ENABLED=true
ENRICHMENT_TIMEOUT=30000
```

---

## 11. Kostenabschätzung

Basierend auf 200–300 Mandanten/Monat, ~8 Gläubiger/Fall, ~30% Enrichment-Rate (70% lokale DB trifft):

| Posten | Calls/Monat | Kosten/Call | Gesamt/Monat |
|---|---|---|---|
| Google Places | ~720 | $0.017 | ~$12 |
| Impressum Scraping (LLM) | ~720 | ~$0.005 | ~$4 |
| Handelsregister | ~200 | Free | $0 |
| Redis (Upstash/Railway) | — | — | ~$10 |
| **TOTAL** | | | **~$26/Monat** |

**ROI:** 720 Enrichments × 5–10 Min manuelles Recherchieren = **60–120 Stunden/Monat eingespart.**

---

## 12. Implementierungs-Roadmap

### Phase 1: MVP (Woche 1–2)

**Ziel:** End-to-End Flow funktioniert — ein Gläubiger wird erfolgreich angereichert.

| # | Task | Details |
|---|---|---|
| 1.1 | FastAPI Service scaffolden | Projektstruktur, Docker-Setup, Health-Endpoint |
| 1.2 | Google Places Source | Text Search + Place Details + Name Matching |
| 1.3 | Impressum Scraper | httpx/Playwright + HTML-Cleaning + LLM-Extraktion |
| 1.4 | Orchestrator + Kaskade | Source-Kaskade mit Abbruch-Logik |
| 1.5 | Basis Confidence Scoring | Single-Source-Scores |
| 1.6 | Node.js Integration | `enrichmentClient.js` + `enrichCreditorFromWeb()` in webhookController |
| 1.7 | Client.js Schema-Erweiterung | Neue enrichment-Felder zum creditorSchema |
| 1.8 | E2E-Test | Manuell: Dokument hochladen → Gläubiger ohne lokale DB → Web-Enrichment füllt Daten |

**Deliverable:** Service läuft lokal, ein Gläubiger-Name wird erfolgreich über Google Places + Impressum angereichert.

### Phase 2: Robustness (Woche 3–4)

| # | Task | Details |
|---|---|---|
| 2.1 | Redis Caching | Cache-Layer mit 30d TTL + Negative Caching |
| 2.2 | Handelsregister Source | OffeneRegister API Integration |
| 2.3 | Cross-Source-Validation | Confidence-Boost bei Multi-Source-Match |
| 2.4 | Error Handling | Retries, Circuit Breaker, Graceful Degradation |
| 2.5 | CreditorDatabase Auto-Update | Self-Learning: Web-Ergebnisse in lokale DB zurückschreiben |
| 2.6 | Rate Limiting | Token Bucket pro Source |
| 2.7 | Unit + Integration Tests | Test-Suite für alle Sources + Orchestrator |

**Deliverable:** Production-ready Service mit Caching, Fehlerbehandlung, und 3 Quellen.

### Phase 3: Scale & Monitor (Woche 5+)

| # | Task | Details |
|---|---|---|
| 3.1 | Batch Enrichment Endpoint | `POST /api/v1/enrich-batch` für Bestandsgläubiger |
| 3.2 | Admin Dashboard Sektion | Enrichment-Status pro Gläubiger in UserDetailView |
| 3.3 | Metriken & Alerting | Prometheus-Metriken + Alerts bei hoher Fehlerrate |
| 3.4 | Auto-Refresh | Periodische Revalidierung nach TTL-Ablauf |
| 3.5 | North Data API (optional) | Premium-Fallback wenn Volume die Kosten rechtfertigt |

---

## 13. Risiken & Mitigationen

| Risiko | Impact | Wahrscheinlichkeit | Mitigation |
|---|---|---|---|
| Falscher Google Places Match | Falsche Kontaktdaten an Gläubiger gesendet | Mittel | Jaro-Winkler ≥ 0.85 Threshold + Confidence Scoring + LOW-Score → Review Queue |
| Website blockiert Scraper | Impressum nicht abrufbar | Mittel | Fallback auf nächste Quelle, User-Agent Rotation, Retry |
| Google Places API-Kosten steigen | Budget überschritten | Niedrig | Cache reduziert wiederholte Calls, Monitoring |
| DSGVO-Bedenken | Datenschutz-Risiko | Niedrig | Nur öffentlich verfügbare Daten; Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse); keine personenbezogenen Daten von Privatpersonen |
| Veraltete Daten | Gläubiger umgezogen/insolvent | Mittel | TTL-basierter Cache, periodische Revalidierung |
| Service nicht erreichbar | Enrichment fällt aus | Niedrig | Graceful Degradation → Node fällt zurück auf lokalen DB-Lookup (aktueller Zustand) |
| LLM extrahiert falsch | Impressum-Daten inkorrekt | Niedrig | Structured Output Prompt + Confidence < 1.0 für LLM-Daten |

---

## 14. Abgrenzung (Out of Scope)

- **North Data API** → Phase 3, nur wenn Business Case stimmt
- **Personen-Enrichment** → Nur Firmen/Organisationen, keine Privatpersonen
- **Frontend-Enrichment-UI** → Phase 3 (Admin Dashboard Erweiterung)
- **Automatischer Gläubiger-Kontakt nach Enrichment** → Existierendes System, keine Änderung
- **Bulk-Migration aller Bestandsgläubiger** → Phase 3 Batch-Endpoint

---

## 15. Entscheidungslog

Alle offenen Fragen wurden am 2026-02-24 geklärt:

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| 1 | LLM für Impressum-Extraktion | **Gemini Flash** | Günstiger, bereits im Projekt integriert |
| 2 | Auto-Update Threshold (CreditorDB) | **≥ 0.8 Confidence** | Balanciert Automatisierung vs. Datenqualität |
| 3 | Enrichment-Timing | **Synchron** | Im Webhook-Processing, Latenz (3-5s) akzeptabel |
| 4 | OffeneRegister Datenhaltung | **API-Calls** | ~200 Calls/Monat rechtfertigen keinen lokalen SQLite-Dump |
| 5 | Deployment | **Neuer eigener FastAPI Server** | Separater Container, Port 8001, unabhängig vom Dokument-Extraktions-Service |
