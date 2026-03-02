# Phase 30: Client Portal Form - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Mandant öffnet das Formular per E-Mail-Deep-Link, sieht vorausgefüllte Finanzdaten aus financial_data + extended_financial_data, kann Korrekturen vornehmen und einreichen. Bei Submit wird ein immutabler second_letter_financial_snapshot erstellt, financial_data aktualisiert, und second_letter_status wechselt von PENDING zu FORM_SUBMITTED. Das Formular lebt im alten Portal (/src/), da dort das Client-Portal liegt.

Nicht in Scope: Berechnung der pfändbaren Beträge (Phase 31), DOCX-Generierung (Phase 32), E-Mail-Versand (Phase 33).

</domain>

<decisions>
## Implementation Decisions

### Formular-Aufbau & Layout
- Logische Abschnitte mit Überschriften: z.B. "Einkommensdaten", "Persönliche Daten", "Gläubiger-Informationen" — visuell getrennt
- Mobile-first Design — Mandanten öffnen den E-Mail-Link häufig am Smartphone
- Oben im Formular: Kanzlei-Branding (Name/Logo) + kurzer Erklärtext warum der Mandant das ausfüllt

### Submit-Flow
- Vor dem Absenden: Bestätigungsdialog ("Ihre Daten können nach dem Absenden nicht mehr geändert werden.") mit Bestätigen/Abbrechen
- Beim Absenden: Submit-Button wird zum Spinner, Formular bleibt sichtbar aber nicht editierbar
- Nach erfolgreichem Submit: Formular verschwindet, Erfolgsmeldung mit Häkchen auf gleicher Seite
- Bei Fehler (Netzwerk etc.): Rote Fehlermeldung oben, Daten bleiben im Formular, erneut versuchen möglich

### Bereits-eingereicht-Ansicht
- Nur Statusmeldung: "Ihre Daten wurden am [Datum] eingereicht." — keine Datenanzeige
- Gleiches Kanzlei-Branding wie im Formular (konsistentes Erscheinungsbild)
- Einreichungsdatum wird im Text angezeigt

### Zugangsschutz
- Formular nur zugänglich wenn second_letter_status == PENDING
- Bei anderem Status: Freundliche Fehlermeldung "Dieses Formular ist derzeit nicht verfügbar." — keine technischen Details

### Bedingte Felder
- "Neue Gläubiger" Toggle auf Ja → Felder für Name + Betrag gleiten smooth ein (Animation)
- Mehrere neue Gläubiger möglich: "Weiteren Gläubiger hinzufügen"-Button, dynamische Liste

### Validierung
- Kombination: Inline-Validierung beim Verlassen des Feldes für offensichtliche Fehler (leere Pflichtfelder), restliche Validierung beim Submit
- Pflichtfelder gemäß FORM-02: Nettoeinkommen, Einkommensquelle, Familienstand, Unterhaltspflichten, Lohnpfändungen aktiv, neue Gläubiger, Richtigkeitsbestätigung

### Claude's Discretion
- Visuelle Unterscheidung vorausgefüllter vs. leerer Felder (dezenter Hinweis oder gleiches Styling)
- Fehlerdarstellung (Stil der Validierungsfehlermeldungen)
- Exaktes Spacing und Typografie innerhalb der Abschnitte
- Animationstiming für konditionelle Felder

</decisions>

<specifics>
## Specific Ideas

- Kanzlei-Logo und Name oben für Vertrauen/Wiedererkennung — Mandant soll wissen woher das kommt
- Bestätigungsdialog vor Submit weil Daten danach unveränderbar sind (immutabler Snapshot)
- Bei bereits eingereicht: Datum anzeigen gibt dem Mandanten Orientierung ("wann hab ich das gemacht?")

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 30-client-portal-form*
*Context gathered: 2026-03-02*
