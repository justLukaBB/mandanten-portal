# Phase 31: Financial Calculation Engine - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

After form submission (Phase 30), the system calculates garnishable amount using existing §850c ZPO logic, determines plan type (RATENPLAN/NULLPLAN), and computes pro-rata quota and Tilgungsangebot per creditor — all from snapshot data only. No live financial_data access.

</domain>

<decisions>
## Implementation Decisions

### Berechnungsablauf
- Berechnung läuft **synchron als Teil des Form-Submit-Handlers** — ein einziger API-Call: Formular speichern + berechnen + Snapshot updaten (atomisch)
- Bei **Berechnungsfehler**: Formulardaten werden trotzdem gespeichert, Berechnung wird als fehlgeschlagen markiert — Admin kann manuell nachtriggern
- Admin bekommt einen **Recalculate-Button** im Client Detail, um Berechnung nach Datenkorrektur neu auszulösen

### Tilgungsangebot-Formel
- **Fester Betrag pro Monat**: Tilgungsangebot pro Gläubiger = (claim_amount / total_debt) * monatlicher pfändbarer Betrag
- **Kein Mindestbetrag** — auch 0.12€/Monat wird als Tilgungsangebot ausgewiesen
- Bei **NULLPLAN**: Tilgungsangebot = 0€ explizit für jeden Gläubiger (einheitliche Datenstruktur)

### Edge Cases & Validierung
- **Fehlende claim_amount**: Berechnung bricht ab — Admin muss Daten korrigieren bevor Berechnung laufen kann
- Negativer pfändbarer Betrag, Validierung vor Berechnung, Einzelgläubiger-Handling: Claude's Discretion

### Claude's Discretion
- Rundungsmethode (kaufmännisch vs. abrunden) — konsistent mit bestehendem germanGarnishmentCalculator
- Rundungsreste bei Quote-Verteilung — pragmatischste Variante wählen
- Berechnungspräzision (spät runden vs. pro Schritt) — basierend auf Genauigkeitsanforderungen
- Speicherformat (Euro Float vs. Cent Integer) — konsistent mit bestehendem Datenmodell
- Gesamt-Quote als Prozentwert — basierend auf Template-Anforderungen aus Phase 32
- Validierung aller Eingabedaten vor Berechnung vs. Guards am Ende
- Negative pfändbare Beträge: clampen oder abbrechen
- Einzelgläubiger: Normal berechnen (100% Quote) oder Sonderbehandlung

</decisions>

<specifics>
## Specific Ideas

- Bestehende Logik aus `germanGarnishmentCalculator.js` für §850c ZPO wiederverwenden — nicht neu implementieren
- Recalculate-Button ermöglicht iteratives Korrigieren durch Admin
- Atomischer Submit-Handler: entweder alles gespeichert oder Fehler mit klarer Markierung

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 31-financial-calculation-engine*
*Context gathered: 2026-03-02*
