# Requirements: Mandanten Portal — 2. Anschreiben Automatisierung

**Defined:** 2026-03-02
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v10 Requirements

Requirements for 2. Anschreiben Automatisierung. Each maps to roadmap phases.

### Schema & State Machine

- [x] **SCHEMA-01**: Client Model hat `second_letter_status` Enum (IDLE, PENDING, FORM_SUBMITTED, SENT) mit Default IDLE
- [x] **SCHEMA-02**: Client Model hat `second_letter_financial_snapshot` Subdokument (Einkommen, Familienstand, Unterhaltspflichten, Einkommensquelle, Lohnpfändungen, neue Gläubiger, Plan-Typ, pfändbarer Betrag, monatliche Rate)
- [x] **SCHEMA-03**: Client Model hat `second_letter_triggered_at`, `second_letter_form_submitted_at`, `second_letter_sent_at` Timestamps
- [x] **SCHEMA-04**: Creditor-Schema hat `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` Felder

### Trigger & Scheduler

- [x] **TRIG-01**: Scheduler prüft täglich: Clients mit MAX(email_sent_at) + 30 Tage <= heute AND second_letter_status == IDLE → setzt PENDING
- [x] **TRIG-02**: Admin kann manuell 2. Anschreiben triggern (Button im Dashboard) → setzt PENDING + sendet Client-Notification
- [x] **TRIG-03**: Trigger ist idempotent — atomic findOneAndUpdate mit Status-Guard verhindert Doppelversand
- [x] **TRIG-04**: Jede Trigger-Aktion wird mit User/System + Timestamp im Audit-Log erfasst

### Client Notification

- [x] **NOTIF-01**: Client bekommt Email via Resend: "Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben"
- [ ] **NOTIF-02**: Email enthält Deep-Link zum Portal-Formular (mit Token für Authentifizierung)
- [x] **NOTIF-03**: Keine doppelten Notifications — Guard prüft ob bereits PENDING

### Client Portal Formular

- [x] **FORM-01**: Formular im alten Portal (/src/) mit vorausgefüllten Finanzdaten aus financial_data + extended_financial_data
- [x] **FORM-02**: Pflichtfelder: Monatliches Nettoeinkommen, Einkommensquelle (Select), Familienstand (Select), Anzahl Unterhaltspflichten, Lohnpfändungen aktiv (Boolean), neue Gläubiger (Boolean + konditionell Name/Betrag), Bestätigung Richtigkeit (Checkbox)
- [x] **FORM-03**: Bei Submit: financial_data in DB aktualisiert + immutabler Snapshot in second_letter_financial_snapshot erstellt
- [x] **FORM-04**: Status-Übergang PENDING → FORM_SUBMITTED nach erfolgreichem Submit
- [x] **FORM-05**: Formular nur sichtbar/zugänglich wenn second_letter_status == PENDING

### Berechnung

- [x] **CALC-01**: Pfändbarer Betrag nach § 850c ZPO berechnet aus Snapshot-Daten (existierende garnishable_amount Logik)
- [x] **CALC-02**: Plan-Typ bestimmt: RATENPLAN (pfändbarer Betrag > 0) oder NULLPLAN (pfändbarer Betrag == 0)
- [x] **CALC-03**: Quote pro Gläubiger berechnet: (claim_amount / total_debt) * pfändbarer Betrag — mit Zero-Division-Guard
- [x] **CALC-04**: Tilgungsangebot pro Gläubiger berechnet und im Snapshot gespeichert

### Dokument-Generierung

- [ ] **DOC-01**: SecondLetterDocumentGenerator erstellt (spiegelt FirstRoundDocumentGenerator — docxtemplater + pizzip)
- [ ] **DOC-02**: Template-Branching: plan_type == RATENPLAN → Ratenplan-Template, sonst → Nullplan-Template
- [ ] **DOC-03**: Template-Variablen befüllt: Gläubiger-Daten (Name, Adresse, Aktenzeichen, Forderung, Quote, Auszahlung), Schuldner-Daten (Name, Geburtsdatum, Familienstand, Unterhaltspflichtige, Einkommen), Plan-Daten (Plan-Typ, monatliche Rate, Startdatum, Frist), Kanzlei-Daten (Aktenzeichen)
- [ ] **DOC-04**: Ein DOCX pro Gläubiger generiert, gespeichert in generated_documents/second_round/

### Versand

- [x] **SEND-01**: Resend Email pro Gläubiger mit DOCX Attachment — identische Pipeline wie 1. Anschreiben (creditorEmailService.sendSecondRoundEmail)
- [ ] **SEND-02**: Per-Creditor Tracking: second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename aktualisiert
- [x] **SEND-03**: Zendesk Audit-Comment pro erfolgreichem Versand an Haupt-Ticket
- [x] **SEND-04**: Status-Übergang FORM_SUBMITTED → SENT nach erfolgreichem Versand aller Gläubiger-Emails
- [x] **SEND-05**: Error Handling: Retry 3x bei Fehler, dann Admin-Alert + Status bleibt FORM_SUBMITTED
- [x] **SEND-06**: Demo-Mode respektiert — Emails gehen an Test-Adresse statt echte Gläubiger

### Admin UI

- [ ] **UI-01**: Trigger-Button "2. Anschreiben starten" in Client Detail — visible wenn IDLE, disabled wenn PENDING/FORM_SUBMITTED/SENT — mit Bestätigungs-Modal
- [ ] **UI-02**: Status-Badge für second_letter_status im Client Detail und Client-Liste (Countdown bei IDLE nach 1. Anschreiben, Wartet bei PENDING, In Bearbeitung bei FORM_SUBMITTED, Gesendet bei SENT)
- [ ] **UI-03**: TrackingCanvas erweitert um 3. Spalte für 2. Anschreiben Status pro Gläubiger
- [ ] **UI-04**: Plan-Typ Admin-Override Möglichkeit in Client Detail vor Versand-Trigger

## Future Requirements

### Extended Tracking

- **TRACK-01**: Snapshot-Diff Anzeige im Admin — Vergleich original vs. bestätigte Finanzdaten
- **TRACK-02**: Gläubiger-Antwort-Tracking für 2. Anschreiben (analog zu 1. Anschreiben)

### Client Portal Redesign

- **PORT-01**: Mandanten-Formular im neuen Vite Design-System (MandantenPortalDesign) — eigener Milestone

## Out of Scope

| Feature | Reason |
|---------|--------|
| 3. Anschreiben oder weitere Runden | Nicht im v10 Scope — ggf. separater Milestone |
| Client Portal Redesign (Vite) | Eigener Milestone per PROJECT.md |
| Admin Approval Gate | User hat direkt-senden gewählt — kein IN_REVIEW Status |
| Snapshot-Diff Anzeige | v2+ Feature — nicht für MVP nötig |
| Automatischer Versand ohne Admin-Trigger | Scheduler setzt nur PENDING, Versand nach Client-Bestätigung |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 28 | Complete |
| SCHEMA-02 | Phase 28 | Complete |
| SCHEMA-03 | Phase 28 | Complete |
| SCHEMA-04 | Phase 28 | Complete |
| TRIG-01 | Phase 29 | Complete |
| TRIG-02 | Phase 29 | Complete |
| TRIG-03 | Phase 29 | Complete |
| TRIG-04 | Phase 29 | Complete |
| NOTIF-01 | Phase 29 | Complete |
| NOTIF-02 | Phase 35 | Pending |
| NOTIF-03 | Phase 29 | Complete |
| FORM-01 | Phase 30 | Complete |
| FORM-02 | Phase 30 | Complete |
| FORM-03 | Phase 30 (verified Phase 37) | Complete |
| FORM-04 | Phase 30 | Complete |
| FORM-05 | Phase 30 | Complete |
| CALC-01 | Phase 31 | Complete |
| CALC-02 | Phase 31 | Complete |
| CALC-03 | Phase 31 | Complete |
| CALC-04 | Phase 31 | Complete |
| DOC-01 | Phase 36 | Pending |
| DOC-02 | Phase 36 | Pending |
| DOC-03 | Phase 35 | Pending |
| DOC-04 | Phase 35 | Pending |
| SEND-01 | Phase 36 | Pending |
| SEND-02 | Phase 35 | Pending |
| SEND-03 | Phase 36 | Pending |
| SEND-04 | Phase 36 | Pending |
| SEND-05 | Phase 33 | Complete |
| SEND-06 | Phase 33 | Complete |
| UI-01 | Phase 34 | Pending |
| UI-02 | Phase 34 | Pending |
| UI-03 | Phase 34 | Pending |
| UI-04 | Phase 34 | Pending |

**Coverage:**
- v10 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — traceability complete after roadmap creation*
