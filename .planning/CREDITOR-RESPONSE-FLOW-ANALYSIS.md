# Creditor Response Flow — Ist-Analyse & Umbau-Plan

> Analyse des E2E-Flows: 1. Anschreiben raus (Resend) → Antwort kommt rein → Code analysiert → Daten aktualisiert → Canvas Flow zeigt Status

> **WICHTIG (2026-02-25):** Ursprüngliche Analyse wurde versehentlich auf `creditor-email-matcher-v2` gemacht.
> Alle Phasen (A+B) wurden korrekt auf `creditor-email-matcher` (ohne -v2) neu angewendet.
> Zusätzlich: "Neue Forderung" Spalte in der Gläubiger-Tabelle (client-detail.tsx) hinzugefügt.

---

## 1. Architektur-Überblick: Zwei Systeme

```
┌─────────────────────────────────────────────────────┐
│                MANDANTEN PORTAL                      │
│  (Node.js/Express + MongoDB)                        │
│                                                      │
│  creditorContactService  ──Resend──►  Gläubiger     │
│  creditorEmailService    ──sync──►   Matcher        │
│  creditorResponseProcessor (LOKAL, in-memory)       │
│                                                      │
│  Canvas Flow (React Flow v12) ◄── MongoDB reads     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │  Shared MongoDB
                   │
┌──────────────────▼──────────────────────────────────┐
│           CREDITOR-EMAIL-MATCHER-V2                  │
│  (Python/FastAPI + PostgreSQL + Redis/Dramatiq)      │
│                                                      │
│  Zendesk Webhook ──► 3-Agent Pipeline ──► Matching   │
│  Intent → Extraction → Consolidation → Confidence    │
│                                                      │
│  Dual-Write: PostgreSQL (source) + MongoDB (sync)    │
└─────────────────────────────────────────────────────┘
```

---

## 2. Was funktioniert (Grün)

### 2.1 Anschreiben-Versand (Portal → Gläubiger)
- `creditorContactService.processClientCreditorConfirmation()` — Zendesk-Ticket + Resend-Emails
- `creditorEmailService.sendFirstRoundEmail()` — HTML + DOCX-Attachment per Resend
- `contact_status` wird korrekt auf `'email_sent_with_document'` gesetzt
- Sync zu Matcher: `POST /api/v1/inquiries/` erstellt `CreditorInquiry` für späteres Matching

### 2.2 Matcher-Pipeline (Email → Extraktion → Matching)
- Zendesk-Webhook → FastAPI → Dramatiq Job Queue (async)
- Agent 1: Intent Classification (rule-based + Claude Haiku fallback)
- Agent 2: Content Extraction (PDF/DOCX/XLSX/Images + Email Body)
- Agent 3: Consolidation & Conflict Detection
- MatchingEngineV2: Fuzzy + Exact + Signals, Ambiguity Gap Check
- Confidence Routing: HIGH (≥0.85) / MEDIUM (0.60-0.85) / LOW (<0.60)
- Dual-Write: PostgreSQL Outbox → MongoDB `final_creditor_list` Update

### 2.3 MongoDB-Update durch Matcher (Direkt-Write)
Der Matcher schreibt **direkt in MongoDB** via `MongoDBService.update_creditor_debt_amount()`:
```python
# Felder die der Matcher auf final_creditor_list[i] setzt:
claim_amount = new_debt_amount
creditor_response_amount = new_debt_amount
amount_source = 'creditor_response'
response_received_at = datetime.utcnow()
contact_status = 'responded'
last_contacted_at = datetime.utcnow()
creditor_response_text = response_text  # (Summary, nicht Volltext)
response_reference_numbers = reference_numbers
```

### 2.4 Canvas Flow (Frontend-Visualisierung)
- TrackingCard: Entry-Point im Activity Tab
- TrackingCanvas: React Flow v12 mit EmailNode + ResponseNode
- CreditorDetailPanel: Slide-in bei Node-Klick
- Filters, Search, Summary Stats, MiniMap
- Korrekte Status-Badge-Varianten für alle `contact_status` Werte

---

## 3. Was NICHT funktioniert / Lücken (Rot)

### 3.1 KRITISCH: Zwei parallele Response-Processor die sich nicht kennen

| Komponente | Ort | Status | Problem |
|---|---|---|---|
| `CreditorResponseProcessor` | `server/services/creditorResponseProcessor.js` | **In-Memory, kein DB** | Arbeitet mit `creditorContacts` Map — wird nicht persistiert, geht bei Restart verloren |
| `MongoDBService.update_creditor_debt_amount()` | `creditor-email-matcher-v2/app/services/mongodb_client.py` | **Produktionsreif** | Schreibt direkt in MongoDB, kennt aber Node.js Backend nicht |

**Problem:** Der Node.js `CreditorResponseProcessor` hat eine komplett eigene In-Memory-Datenstruktur (`this.creditorContactService.creditorContacts`). Wenn der Matcher direkt in MongoDB schreibt, weiß das Node.js Backend nichts davon. Der Response Processor im Portal ist effektiv **tot** — er wird nie mit echten Daten aufgerufen.

### 3.2 KRITISCH: Kein Webhook vom Matcher zum Portal

Der Matcher schreibt direkt in MongoDB, aber **benachrichtigt das Node.js Backend nicht**. Das bedeutet:
- Keine real-time Updates im Portal
- Node.js Backend kann keine Folgeaktionen auslösen (Status-History, Notifications, Workflow-Transitions)
- `status_history` wird nicht aktualisiert wenn Matcher-Responses reinkommen
- Keine Möglichkeit für das Portal, auf Response-Events zu reagieren

### 3.3 KRITISCH: Feld-Mapping-Konflikte

| Feld | Matcher schreibt | Portal erwartet | Canvas liest | Match? |
|---|---|---|---|---|
| `contact_status` | `'responded'` | `'responded'` | `contact_status` | OK |
| `claim_amount` | Überschreibt mit neuem Betrag | Original-Forderung | `claim_amount` als "Original" | **FALSCH** — Original geht verloren |
| `creditor_response_amount` | `new_debt_amount` | `creditor_response_amount` | `current_debt_amount` | **MISMATCH** — Canvas liest falsches Feld |
| `current_debt_amount` | Wird NICHT gesetzt | `current_debt_amount` | `currentDebtAmount` | **FEHLT** — Canvas zeigt nichts |
| `creditor_response_text` | Summary (kurz) | Volltext | `creditor_response_text` | **INKOMPLETT** — nur Summary, nicht Original |
| `amount_source` | `'creditor_response'` | `'creditor_response'` | `amount_source` | OK |

**Kernproblem:** Der Matcher überschreibt `claim_amount` (Original-Forderung) mit dem neuen Betrag. Das Canvas zeigt dann "Ursprünglich: X€" mit dem NEUEN Betrag statt dem Original. Und `current_debt_amount` (was das Canvas für "Neue Forderung" verwendet) wird gar nicht gesetzt.

### 3.4 MITTEL: creditorResponseProcessor.js ist obsolet

Die Klasse `CreditorResponseProcessor` in `server/services/creditorResponseProcessor.js`:
- Arbeitet rein In-Memory (`this.creditorContactService.creditorContacts` Map)
- Hat eigene `DebtAmountExtractor` (Regex-basiert) — redundant zum Matcher's Claude-Extraction
- `syncResponseToClientCreditorList()` macht das gleiche wie der Matcher's MongoDB-Write, aber doppelt und mit anderem Feld-Mapping
- Simulation-Templates die nur für Entwicklung nützlich sind

### 3.5 MITTEL: `creditorContactService` In-Memory State

`creditorContactService.js` verwaltet `creditorContacts` als JavaScript Map. Diese Map:
- Wird beim Serverstart NICHT aus der DB geladen
- Geht bei jedem Restart verloren
- Enthält Duplikat-Daten die bereits in `final_creditor_list` sind
- Die `processCreditorResponse()` Methode (Zeile 897) sucht in dieser Map — findet nichts wenn Server restartet wurde

### 3.6 NIEDRIG: Canvas liest nicht alle Matcher-Felder

Das Canvas kann diese vom Matcher gesetzten Felder nicht anzeigen:
- `response_reference_numbers` — Aktenzeichen aus der Antwort
- `extraction_confidence` — Wie sicher die Extraktion war
- `pipeline_metadata` — Intent, Quellen, Tokens, Konflikte
- Kein Hinweis ob Response manuelles Review braucht (`needs_review`)

### 3.7 NIEDRIG: Kein Polling/Refresh im Canvas

Wenn der Matcher eine Response verarbeitet und MongoDB updatet, sieht der Admin das erst nach manuellem Page-Refresh. Kein:
- WebSocket für Live-Updates
- Polling-Intervall auf dem Canvas
- Refetch-Trigger nach bekannten Events

---

## 4. Datenfluss-Diagnose: Wo bricht es?

```
1. Anschreiben raus (Resend)
   ✅ creditorContactService → Resend API → Gläubiger-E-Mail
   ✅ creditorEmailService → POST /api/v1/inquiries/ → Matcher

2. Antwort kommt rein
   ✅ Gläubiger antwortet → Zendesk
   ✅ Zendesk Webhook → Matcher /api/v1/zendesk/webhook
   ✅ Matcher: Intent → Extraction → Consolidation → Matching → Confidence

3. Code analysiert den
   ✅ Matcher: 3-Agent-Pipeline extrahiert Betrag, Name, Referenz
   ✅ Matcher: MatchingEngineV2 matcht zur CreditorInquiry
   ✅ Matcher: Confidence-Routing bestimmt Action (auto/review)

4. Aktualisiert die Daten
   ✅ Matcher: PostgreSQL Outbox → MongoDB Update (Dual-Write)
   ⚠️ Matcher setzt claim_amount statt current_debt_amount
   ⚠️ Matcher überschreibt Original-Forderung
   ❌ Kein Webhook an Portal-Backend → keine status_history
   ❌ Node.js CreditorResponseProcessor wird nie aufgerufen

5. Ich sehe es im Canvas Flow
   ⚠️ contact_status = 'responded' → Badge richtig
   ❌ "Neue Forderung" leer (current_debt_amount nicht gesetzt)
   ❌ "Ursprünglich" zeigt neuen Betrag (claim_amount überschrieben)
   ❌ Kein Auto-Refresh → manuelles F5 nötig
   ❌ Keine Confidence-Anzeige
```

---

## 5. Umbau-Plan: Was muss passieren

### Phase A: Feld-Mapping fixen (Matcher-Seite)

**Ziel:** Der Matcher schreibt die richtigen Felder, die das Canvas erwartet.

**Datei:** `creditor-email-matcher-v2/app/services/mongodb_client.py` Zeile 223-236

```python
# AKTUELL (falsch):
update_data = {
    f'final_creditor_list.{idx}.claim_amount': new_debt_amount,          # ← Überschreibt Original!
    f'final_creditor_list.{idx}.creditor_response_amount': new_debt_amount,
    f'final_creditor_list.{idx}.contact_status': 'responded',
    ...
}

# NEU (korrekt):
update_data = {
    # NICHT claim_amount überschreiben — das ist der Original-Betrag!
    f'final_creditor_list.{idx}.current_debt_amount': new_debt_amount,       # Canvas liest das
    f'final_creditor_list.{idx}.creditor_response_amount': new_debt_amount,  # Backup-Feld
    f'final_creditor_list.{idx}.contact_status': 'responded',
    f'final_creditor_list.{idx}.amount_source': 'creditor_response',
    f'final_creditor_list.{idx}.response_received_at': datetime.utcnow(),
    f'final_creditor_list.{idx}.creditor_response_text': response_text,
    f'final_creditor_list.{idx}.extraction_confidence': confidence_score,     # NEU
    f'final_creditor_list.{idx}.response_reference_numbers': reference_numbers,
    f'final_creditor_list.{idx}.last_contacted_at': datetime.utcnow(),
}
```

**Aufwand:** Klein, 1 Datei, ~20 Zeilen

---

### Phase B: Webhook Matcher → Portal (Notification)

**Ziel:** Nach erfolgreichem MongoDB-Write sendet der Matcher einen HTTP-Callback an das Portal-Backend, damit:
1. `status_history` Eintrag erstellt wird
2. Folgeaktionen ausgelöst werden können (z.B. alle beantwortet → nächster Schritt)
3. (Optional) WebSocket-Push an verbundene Admin-Clients

**Matcher-Seite:**
- Neuer Config: `PORTAL_WEBHOOK_URL` (z.B. `http://localhost:10000/api/webhook/matcher-response`)
- Nach `execute_mongodb_write()` Success → `POST` an Portal mit Payload:

```json
{
  "event": "creditor_response_processed",
  "email_id": 123,
  "client_aktenzeichen": "1381_25",
  "creditor_name": "Deutsche Bank AG",
  "creditor_email": "inkasso@db.com",
  "new_debt_amount": 3890.50,
  "amount_source": "creditor_response",
  "extraction_confidence": 0.92,
  "match_status": "auto_matched",
  "confidence_route": "high",
  "needs_review": false,
  "reference_numbers": ["AZ-2024-883742"],
  "processed_at": "2026-02-25T14:30:00Z"
}
```

**Portal-Seite:**
- Neuer Route: `POST /api/webhook/matcher-response`
- Handler erstellt `status_history` Eintrag
- Prüft ob alle Gläubiger beantwortet → Trigger nächste Phase
- (Optional) Emitted WebSocket Event für Live-Canvas-Update

**Aufwand:** Mittel, je 1 neue Datei pro Seite + Config

---

### Phase C: Canvas-Feld-Alignment (Frontend)

**Ziel:** Canvas liest die korrekten Felder nach Phase A.

**Dateien:**
- `MandantenPortalDesign/src/app/components/tracking/nodes/ResponseNode.tsx`
- `MandantenPortalDesign/src/app/types.ts`

**Änderungen:**

1. **ResponseNode** zeigt `current_debt_amount` als "Neue Forderung" (nach Phase A korrekt gefüllt)
2. **ResponseNode** zeigt `claim_amount` als "Ursprünglich" (wird nicht mehr überschrieben)
3. **Neues Feld:** Confidence-Indikator (optional, Dot oder Text)
4. **Neues Feld:** `needs_review` Badge wenn Matcher Review braucht

**Types ergänzen:**
```typescript
interface ClientDetailCreditor {
  // Existing...

  // NEU: Matcher-Response-Felder
  extraction_confidence?: number;       // 0.0-1.0
  response_reference_numbers?: string[];
  needs_review?: boolean;
  match_status?: 'auto_matched' | 'needs_review' | 'no_match';
}
```

**Aufwand:** Klein, 2-3 Dateien

---

### Phase D: creditorResponseProcessor.js aufräumen — DONE

**Ziel:** Dead Code entfernen, Verantwortlichkeiten klären.

**Ergebnis:**
- `creditorResponseProcessor.js` auf stateless Utility reduziert — nur `extractReferenceNumber()` behalten
- Klasse komplett entfernt (in-memory Map, DebtAmountExtractor-Instanz, alle Map-basierten Methoden)
- `creditorContactService.js`: Lazy-Load Init + 4 Proxy-Methoden entfernt (`processCreditorResponse`, `simulateCreditorResponses`, `getResponseStats`, `processIncomingCreditorResponse`)
- Live-Verarbeitung läuft jetzt über `matcherWebhookController.js` (Phase B)
- Keine Imports mehr auf die alte Klasse im aktiven Code

---

### Phase E: Canvas Auto-Refresh (Optional)

**Ziel:** Canvas aktualisiert sich automatisch wenn neue Responses reinkommen.

**Option 1: Polling (Einfach)**
```typescript
// In LetterTrackingPage.tsx
const { data: client } = useGetClientDetailQuery(id!, {
  pollingInterval: 30000, // Alle 30 Sekunden
});
```

**Option 2: WebSocket (Komplex, für später)**
- Portal-Backend emitted Event bei Matcher-Webhook
- Frontend hört auf Client-spezifische Events
- RTK Query Cache wird invalidated

**Empfehlung:** Option 1 (Polling) als Quick Win, Option 2 für Milestone v10+.

**Aufwand:** Klein (Polling), Groß (WebSocket)

---

## 6. Priorisierte Reihenfolge

| Prio | Phase | Was | Warum | Aufwand | Status |
|---|---|---|---|---|---|
| 1 | **A** | Feld-Mapping im Matcher fixen | Ohne das zeigt Canvas falsche Daten | Klein | DONE |
| 2 | **C** | Canvas Feld-Alignment | Nutzt die korrekten Felder von Phase A | Klein | DONE |
| 3 | **B** | Webhook Matcher → Portal | Ermöglicht status_history + Folgeaktionen | Mittel | DONE |
| 4 | **D** | creditorResponseProcessor aufräumen | Dead Code weg, klare Verantwortlichkeiten | Mittel | |
| 5 | **E** | Canvas Auto-Refresh (Polling) | UX-Verbesserung, kein F5 mehr nötig | Klein | DONE |

---

## 7. Schema-Empfehlung: Finale Feld-Zuordnung

```
final_creditor_list[i]:
  ┌─────────────────────────────────────────────────────────────┐
  │ ORIGINAL (beim Anschreiben gesetzt)                         │
  │   claim_amount          → Forderung aus Dokument            │
  │   sender_name           → Gläubiger-Name                    │
  │   sender_email          → Gläubiger-E-Mail                  │
  │   reference_number      → Aktenzeichen (von uns)            │
  │   contact_status        → 'email_sent_with_document'        │
  │   email_sent_at         → Wann gesendet                     │
  │   document_sent_at      → Wann Dokument gesendet            │
  │   first_round_document_filename → DOCX-Name                 │
  ├─────────────────────────────────────────────────────────────┤
  │ RESPONSE (vom Matcher nach Analyse gesetzt)                 │
  │   contact_status        → 'responded'                       │
  │   current_debt_amount   → Neue Forderung aus Antwort        │  ← Canvas: "Neue Forderung"
  │   creditor_response_amount → Backup (= current_debt_amount) │
  │   creditor_response_text → Zusammenfassung                  │
  │   response_received_at  → Wann Antwort kam                  │
  │   amount_source         → 'creditor_response'               │
  │   extraction_confidence → 0.0-1.0                           │
  │   response_reference_numbers → AZ aus der Antwort           │
  │   match_status          → 'auto_matched' | 'needs_review'   │
  │   last_contacted_at     → Letzter Kontaktzeitpunkt          │
  ├─────────────────────────────────────────────────────────────┤
  │ CANVAS LIEST                                                │
  │   EmailNode:  claim_amount, contact_status, email_sent_at   │
  │   ResponseNode: current_debt_amount, claim_amount (als      │
  │                 "Ursprünglich"), response_received_at,       │
  │                 creditor_response_text, amount_source        │
  └─────────────────────────────────────────────────────────────┘
```

---

## 8. Risiken & Offene Fragen

| # | Risiko/Frage | Impact | Empfehlung |
|---|---|---|---|
| 1 | Matcher und Portal laufen auf verschiedenen Servern — MongoDB-Latenz? | Niedrig | Outbox-Pattern im Matcher handelt das bereits |
| 2 | Was passiert bei Matcher-Downtime? | Mittel | Zendesk retried Webhooks; Dramatiq hat Retry-Logic |
| 3 | Was wenn Matcher falsch matcht? | Mittel | Confidence-Routing + Manual Review Queue fängt das ab |
| 4 | creditorContactService In-Memory Map — andere Features betroffen? | Prüfen | Audit: Wer ruft `creditorContacts` Map noch auf? |
| 5 | Mehrfach-Antworten vom gleichen Gläubiger? | Mittel | Matcher hat Idempotency; Portal muss "letzte Antwort gewinnt" implementieren |
| 6 | Bestehende Daten wo `claim_amount` schon überschrieben wurde? | Hoch | Backfill-Script nötig: Original aus `creditor_response_amount` oder Dokument restaurieren |

---

*Erstellt: 2026-02-25 | Basierend auf Analyse von creditor-email-matcher-v2 (Phase 9, 92.9% complete) und Mandanten Portal (v7 branch)*
