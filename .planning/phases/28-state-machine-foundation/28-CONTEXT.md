# Phase 28: State Machine Foundation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Schema-Erweiterungen am Client- und Creditor-Model fuer das 2. Anschreiben: Status-Enum, Financial Snapshot Subdokument, Timestamps, und Creditor-Tracking-Felder. Die State Machine existiert und ist idempotent gegen Double-Triggers bevor irgendein Service-Code laeuft. Keine Trigger-Logik, kein Formular, keine DOCX-Generierung — nur Datenstruktur.

</domain>

<decisions>
## Implementation Decisions

### Snapshot-Felder
- Die 9 definierten Felder (Einkommen, Familienstand, Unterhaltspflichten, Einkommensquelle, Lohnpfaendungen, neue Glaeubiger, Plan-Typ, pfaendbarer Betrag, monatliche Rate) sind die Basis
- Weitere Felder die fuer die Briefe noetig sind (Name, Adresse etc.) kommen direkt vom Client-Model, nicht aus dem Snapshot
- Neue Glaeubiger: Array-Struktur mit je Name und Betrag — ein Mandant kann MEHRERE neue Glaeubiger haben
- Ein Snapshot pro Client reicht (kein Versionierungs-Array) — wird bei erneutem Durchlauf ueberschrieben

### Migration bestehender Clients
- Alle bestehenden Clients bekommen IDLE — der Scheduler/Admin entscheidet spaeter wer getriggert wird
- Kein Sonderstatus fuer manuell bearbeitete Clients — erstmal alle auf IDLE, manuelle Korrektur bei Bedarf
- Creditor-Felder sind optional/nullable — kein explizites Setzen in der Migration noetig

### Status-Lifecycle
- 4 Status bleiben: IDLE, PENDING, FORM_SUBMITTED, SENT — kein ERROR/CANCELLED Status
- Kuendigungs-Logik ist irrelevant fuer Phase 28 — spaetere Phasen pruefen ob Client aktiv ist
- Erstmal als einmaliger Durchlauf bauen — SENT ist Endzustand, Erweiterung kommt wenn noetig

### Creditor-Felder
- Die 3 definierten Felder reichen: second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename
- Kein delivery_status Tracking — sent_at reicht, Resend-Webhook-Handling ist Overkill
- Alle Creditors eines Clients werden angeschrieben — keine Filterkriterien/Exclude-Logik

### Claude's Discretion
- Creditor-Daten im Snapshot einfrieren vs. Live-Referenzen — Claude waehlt den sichereren Ansatz
- Migration-Timing: einmaliges Script vs. Mongoose Defaults — Claude waehlt basierend auf bestehendem Pattern
- Creditor-Email-Feld: Claude prueft das bestehende Creditor-Schema und ergaenzt was fehlt
- Berechnete Werte (Quota, Tilgungsangebot) auf Creditor-Subdokument vs. nur im Snapshot — Claude waehlt basierend auf Zugriffsmuster
- Status-Zuruecksetzbarkeit durch Admin — Claude entscheidet ob sinnvoll

</decisions>

<specifics>
## Specific Ideas

- Schema-Felder sollen dem bestehenden Pattern im Client-Model folgen (Naming, Verschachtelung)
- Idempotenz-Guards via atomic findOneAndUpdate mit Status-Check — kein separater Read-then-Write
- Die State Machine muss stehen BEVOR Phase 29 (Trigger/Scheduler) anfaengt

</specifics>

<deferred>
## Deferred Ideas

- Delivery-Status-Tracking (DELIVERED/BOUNCED per Creditor) — evtl. Phase 33 oder Backlog
- Snapshot-Versionierung fuer wiederholte Durchlaeufe — Backlog
- Creditor-Filterkriterien (Ausschluss bestimmter Glaeubiger) — Backlog
- Status-Zuruecksetzung SENT → IDLE fuer erneuten Durchlauf — Backlog

</deferred>

---

*Phase: 28-state-machine-foundation*
*Context gathered: 2026-03-02*
