# Plan: 1. Rate Feature ausklammern + 30-Tage Upload-Fenster

## Ziel-Flow (Soll)

```
Portal Link gesendet
  → Upload-Fenster: 30 Tage ab portal_link_sent_at
  → Mandant lädt Dokumente hoch (innerhalb 30 Tage)
  → AI Processing (wie bisher)
  → Documents Completed
  → Prüfung nötig?
      JA  → Admin/Agent Review → Approved → Client Confirmation
      NEIN → Auto-Approve → Client Confirmation (direkt)
  → Mandant bestätigt Gläubigerliste
  → Creditor Contact (wie bisher)
  → ... (Rest bleibt gleich)
```

**Was wegfällt:** `waiting_for_payment` → `payment_confirmed` Step. Nach Document Processing geht es direkt in Review/Confirmation.

**Was neu ist:** 30-Tage Upload-Fenster ab Portal-Zusendung.

---

## Phase 1: 30-Tage Upload-Fenster implementieren

### 1.1 Client Model erweitern
**Datei:** `server/models/Client.js`

- Neues Feld: `upload_deadline: Date` (berechnet: `portal_link_sent_at + 30 Tage`)
- Alternativ: kein neues Feld, sondern dynamisch berechnen aus `portal_link_sent_at`
- **Empfehlung:** Dynamisch berechnen — weniger Schema-Drift, `portal_link_sent_at` existiert bereits

### 1.2 Upload-Guard im Backend
**Datei:** `server/controllers/clientPortalController.js` → `handleUploadDocuments` (~Zeile 897)

- Vor Upload prüfen: `new Date() - portal_link_sent_at <= 30 Tage`
- Bei Überschreitung: HTTP 403 mit Message "Upload-Zeitraum abgelaufen"
- Edge Case: Kein `portal_link_sent_at` → Upload erlauben (Legacy-Clients)

### 1.3 Frontend Upload-Sperre
**Datei:** `src/components/CreditorUploadComponent.tsx` (altes Portal)

- Upload-Button deaktivieren wenn Deadline überschritten
- Countdown/Info anzeigen: "Noch X Tage zum Hochladen"
- Nach Ablauf: Info-Banner "Upload-Zeitraum abgelaufen. Bitte kontaktieren Sie uns."

### 1.4 API: Upload-Status Endpoint
**Datei:** `server/routes/client-portal.js`

- Neuer oder erweiterter Endpoint: `GET /api/clients/:clientId/upload-status`
- Returns: `{ deadline: Date, days_remaining: Number, expired: Boolean }`
- Wird vom Frontend gepollt/gecheckt

---

## Phase 2: Payment-Gate entfernen (Backend)

### 2.1 Status-Enum bereinigen
**Datei:** `server/models/Client.js` (Zeile 322-351)

- `waiting_for_payment` aus `current_status` Enum entfernen
- `payment_confirmed` aus `current_status` Enum entfernen
- Feld `first_payment_received` auf `default: true` setzen ODER komplett ignorieren
- **Empfehlung:** Felder NICHT löschen (Datenbank hat existierende Dokumente), stattdessen bypassen

### 2.2 Portal Webhook: Documents Complete Flow
**Datei:** `server/controllers/portalWebhookController.js` (Zeile 386-475)

- **Aktuell:** Wenn Dokumente fertig → `waiting_for_payment` setzen, warten auf Payment
- **Neu:** Wenn Dokumente fertig → direkt in Creditor Analysis/Review
- Die Logik aus `handleUserPaymentConfirmed()` (Zeilen 627-721) muss hierher migriert werden:
  - Creditor-Check: Braucht manuelles Review?
  - JA → `creditor_review` / `admin_review`
  - NEIN → Auto-Approve → `awaiting_client_confirmation` + Email senden

### 2.3 conditionCheckService anpassen
**Datei:** `server/services/conditionCheckService.js`

- `checkAndScheduleIfBothConditionsMet()`: Payment-Check entfernen
- `handlePaymentConfirmed()`: Kann deprecated werden
- `handleDocumentUploaded()`: Soll direkt den Flow triggern (ohne auf Payment zu warten)
- 7-Tage Review-Delay: Bleibt bestehen, aber wird nur durch Documents getriggert

### 2.4 Zendesk Webhook Payment Handler
**Datei:** `server/controllers/zendeskWebhookController.js` (Zeile 448-847)

- `handleUserPaymentConfirmed()` wird zum No-Op / Logging-Only
- Webhook-Route kann bestehen bleiben (Zendesk könnte noch feuern), aber Logik wird neutralisiert
- Kernlogik (Creditor Analysis, Auto-Approve) wird nach Document-Complete verschoben

### 2.5 Admin Dashboard: Payment Marking entfernen
**Datei:** `server/controllers/adminDashboardController.js`

- `markPaymentReceived()` (Zeile 582-712): Auf No-Op setzen oder entfernen
- `batchMarkPaymentReceived()` (Zeile 714-812): Ebenfalls
- Routes in `admin-dashboard.js` können bleiben (404 oder success-stub)

### 2.6 Creditor Confirmation: Payment-Guard entfernen
**Datei:** `server/controllers/clientCreditorController.js`

- Zeile 61-76: `first_payment_received` Check entfernen (teilweise schon gemacht laut Git)
- Auto-Approval soll nur auf `seven_day_review_triggered` + Document-Status prüfen

---

## Phase 3: Payment-Gate entfernen (Frontend)

### 3.1 PhasePrerequisites anpassen
**Datei:** `MandantenPortalDesign/src/app/components/phase-prerequisites.tsx`

- "1. Rate bezahlt" Badge entfernen (Zeile 102-108)
- Completion Counter anpassen (1/2 → nur Creditor Confirmation)

### 3.2 OverviewSections anpassen
**Datei:** `MandantenPortalDesign/src/app/components/overview-sections.tsx`

- `getNextStepInfo()`: `waiting_for_payment` Case entfernen (Zeile 131-137)
- `payment_confirmed` Case entfernen (Zeile 150-157)
- Nach `documents_completed` direkt zu "Gläubigerliste prüfen" / "Warte auf Bestätigung" leiten

### 3.3 Client Detail anpassen
**Datei:** `MandantenPortalDesign/src/app/components/client-detail.tsx`

- `firstPaymentReceived` Prop: Immer als `true` behandeln oder entfernen
- Phase-Order: `payment_confirmed` Step überspringen

### 3.4 Client Portal (Legacy)
**Datei:** `src/pages/PersonalPortal.tsx`

- Payment-Step aus der Phase-Anzeige entfernen
- Upload-Deadline Countdown hinzufügen

---

## Phase 4: Transition-Logik für existierende Mandanten

### 4.1 Migration Script
**Datei:** `server/scripts/migrate-remove-payment-gate.js` (neu)

- Alle Clients mit `current_status === 'waiting_for_payment'`:
  → Status auf `documents_completed` setzen
  → Creditor-Analysis triggern
- Alle Clients mit `first_payment_received === false` und Dokumente vorhanden:
  → `first_payment_received = true` setzen (für Backward Compat)

### 4.2 Backward Compatibility
- `first_payment_received` Feld bleibt im Schema (existierende Daten)
- Neue Clients bekommen `first_payment_received: true` als Default
- Workflow-Code ignoriert das Feld

---

## Risiken & Edge Cases

| Risiko | Mitigation |
|--------|------------|
| Existierende Clients im `waiting_for_payment` Status | Migration Script (Phase 4.1) |
| Zendesk sendet weiterhin Payment-Webhooks | Handler wird No-Op, loggt nur |
| Admin drückt "Mark Payment" für alten Client | Endpoint gibt Success zurück, macht aber nichts Neues |
| Upload nach 30 Tagen nötig (Dokument vergessen) | Admin-Override Endpoint: `POST /api/admin/clients/:id/extend-upload` |
| Legacy-Clients ohne `portal_link_sent_at` | Kein Upload-Limit für diese Clients |

---

## Reihenfolge der Umsetzung

```
Phase 2 (Backend Payment-Gate entfernen)  ← ZUERST
  ↓
Phase 3 (Frontend Payment-Gate entfernen)
  ↓
Phase 1 (30-Tage Upload-Fenster)          ← Feature Addition
  ↓
Phase 4 (Migration existierender Daten)   ← Vor Deployment
```

**Begründung:** Payment-Gate entfernen ist das Kernziel. Upload-Fenster ist neues Feature, kann danach kommen.

---

## Betroffene Dateien (Zusammenfassung)

### Backend (Muss ändern)
1. `server/controllers/portalWebhookController.js` — Document-Complete Flow
2. `server/controllers/zendeskWebhookController.js` — Payment Handler → No-Op
3. `server/controllers/adminDashboardController.js` — Payment Marking
4. `server/controllers/clientCreditorController.js` — Payment Guards
5. `server/controllers/clientPortalController.js` — Upload Guard (neu)
6. `server/services/conditionCheckService.js` — Payment Condition
7. `server/models/Client.js` — Status Enum Cleanup

### Frontend (Muss ändern)
8. `MandantenPortalDesign/src/app/components/phase-prerequisites.tsx`
9. `MandantenPortalDesign/src/app/components/overview-sections.tsx`
10. `MandantenPortalDesign/src/app/components/client-detail.tsx`
11. `src/pages/PersonalPortal.tsx` (Legacy Portal)
12. `src/components/CreditorUploadComponent.tsx` (Upload Deadline)

### Neu
13. `server/scripts/migrate-remove-payment-gate.js`
