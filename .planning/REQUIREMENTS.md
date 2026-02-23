# Requirements: Mandanten Portal — Review Dashboard

**Defined:** 2026-02-23
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v9 Requirements

Requirements for Review Dashboard rebuild. Each maps to roadmap phases.

### Grundlagen (Foundation)

- [x] **FOUND-01**: Review Nav-Item in Sidebar zwischen Mandanten und Gläubiger-DB navigiert zu /review
- [x] **FOUND-02**: Admin-Token wird auf allen agent-review Endpoints akzeptiert (authenticateAdminOrAgent)
- [x] **FOUND-03**: Review-Queue-Seite zeigt paginierte Liste wartender Fälle mit 3 KPI-Cards
- [x] **FOUND-04**: Admin kann Queue nach Priorität filtern und nach Name/Aktenzeichen durchsuchen

### Review-Workflow

- [x] **FLOW-01**: Admin sieht Split-Pane Workspace mit Dokument links und Korrekturformular rechts (ResizablePanelGroup)
- [ ] **FLOW-02**: Admin kann zwischen Gläubigern navigieren und Formularfelder sind mit AI-Daten vorausgefüllt
- [ ] **FLOW-03**: Admin kann Gläubiger bestätigen (confirm), korrigieren (correct) oder überspringen (skip mit Grund)
- [ ] **FLOW-04**: Admin sieht Review-Zusammenfassung aller bearbeiteten Gläubiger und kann Review abschließen

### Queue-Management

- [ ] **QUEUE-01**: Admin kann Review-Fälle einzelnen Agents zuweisen (assign/unassign)
- [ ] **QUEUE-02**: Admin kann Batch-Operationen ausführen (Bulk-Bestätigung, Bulk-Zuweisung, Bulk-Priorität)
- [ ] **QUEUE-03**: Prioritäts-Score wird automatisch berechnet (Tage seit Zahlung, Confidence, Gläubiger-Anzahl)

### Viewer & Analytics

- [ ] **VIEW-01**: PDF.js rendert Dokumente mit Zoom/Pan statt iframe
- [ ] **VIEW-02**: Analytics-Seite zeigt Review-Statistiken mit Recharts (Reviews/Tag, Confidence-Verteilung, Ergebnisse)
- [ ] **VIEW-03**: Admin kann Review-Einstellungen konfigurieren (Confidence-Schwellenwert, Auto-Assignment)

### Polish & Migration

- [ ] **POLISH-01**: CSV/XLSX Export der Review-Queue-Daten
- [ ] **POLISH-02**: Real-time Queue-Updates via 30s Polling mit Sidebar-Badge
- [ ] **POLISH-03**: Altes Agent-Portal /agent/review redirected zu /review

## Previous Milestone Requirements (all satisfied)

### v8 — Admin Frontend Migration (Phases 19-22)

- [x] **SETUP-01**: Vite-Projekt mit React, TypeScript und Tailwind 4 ist konfiguriert und startet lokal
- [x] **SETUP-02**: React Router mit Sidebar-Navigation und Route-Struktur ist eingerichtet
- [x] **SETUP-03**: RTK Query API-Layer mit Base-URL-Konfiguration (dev/prod) ist aufgesetzt
- [x] **SETUP-04**: Design-System (shadcn/ui Komponenten, Fonts, Theme-Variablen) ist integriert
- [x] **AUTH-01**: Admin kann sich über Login-Seite mit Email/Passwort anmelden
- [x] **AUTH-02**: Admin-Token wird in localStorage gespeichert und bei API-Requests als Bearer-Token gesendet
- [x] **AUTH-03**: Nicht-authentifizierte Nutzer werden auf Login-Seite weitergeleitet (Protected Routes)
- [x] **LIST-01**: Admin sieht paginierte Client-Liste mit Echtdaten aus /api/admin/clients
- [x] **LIST-02**: Admin kann Clients nach Name, Fall-ID oder Email durchsuchen
- [x] **LIST-03**: Admin kann Clients nach Status filtern (Active, Pending, In Review, Blocked, Closed)
- [x] **LIST-04**: Admin kann Clients nach Flow filtern (Portal zugesendet, 1. Anschreiben, etc.)
- [x] **LIST-05**: Client-Zeilen zeigen Status-Badge und Flow-Badges korrekt an
- [x] **DETAIL-01**: Admin sieht Client-Übersicht mit Workflow-Status und Phase-Timeline
- [x] **DETAIL-02**: Admin sieht Client-Profil mit Stammdaten
- [x] **DETAIL-03**: Admin sieht Dokumente-Tab mit hochgeladenen Dokumenten und AI-Confidence-Scores
- [x] **DETAIL-04**: Admin sieht Gläubiger-Tab mit Gläubiger-Tabelle (alle Felder inkl. neue v7-Felder)
- [x] **DETAIL-05**: Admin sieht Aktivitäts-Tab mit Workflow-Verlauf

### v7 — FastAPI Webhook Field Integration (Phases 17-18)

- [x] **SCHEMA-01**: Mongoose creditorSchema enthält 5 neue FastAPI-Felder
- [x] **SCHEMA-02**: Mongoose documentSchema enthält die gleichen 5 Felder
- [x] **HOOK-01**: Webhook Controller extrahiert neue Felder aus FastAPI-Payload
- [x] **HOOK-02**: Enrichment-Logik setzt address_source="local_db"
- [x] **MERGE-01**: mergeCreditorLists() merged aktenzeichen_glaeubigervertreter mit longest-wins
- [x] **MERGE-02**: mergeCreditorLists() merged Postfach-Flags mit OR-Logik

### v6 — Async Creditor Confirm (Phase 16)

- [x] **CONF-01**: Gläubiger-Bestätigung speichert sofort in DB und antwortet in <2 Sekunden
- [x] **CONF-02**: Creditor-Contact-Emails werden asynchron im Hintergrund verschickt
- [x] **CONF-03**: Frontend zeigt sofort "Bestätigt" Success-State

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Client Portal

- **PORTAL-01**: Mandanten-Login und persönliches Portal
- **PORTAL-02**: Dokument-Upload und Gläubiger-Bestätigung
- **PORTAL-03**: Finanzformular und Settlement-Plan-Status

### Erweiterte Admin-Features

- **EADM-01**: User-Erstellung und -Verwaltung
- **EADM-02**: Creditor Database (globale Suche)
- **EADM-03**: Admin-Actions (Dedup triggern, Review triggern, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Client Portal Migration | Eigener Milestone |
| Vollständiges Agent Portal | Nur Review wird migriert |
| User-Verwaltung | Eigener Milestone |
| Creditor Database | Eigener Milestone |
| Deployment | Erstmal nur lokal testen |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 23 | Complete |
| FOUND-02 | Phase 23 | Complete |
| FOUND-03 | Phase 23 | Complete |
| FOUND-04 | Phase 23 | Complete |
| FLOW-01 | Phase 24 | Complete |
| FLOW-02 | Phase 24 | Pending |
| FLOW-03 | Phase 24 | Pending |
| FLOW-04 | Phase 24 | Pending |
| QUEUE-01 | Phase 25 | Pending |
| QUEUE-02 | Phase 25 | Pending |
| QUEUE-03 | Phase 25 | Pending |
| VIEW-01 | Phase 26 | Pending |
| VIEW-02 | Phase 26 | Pending |
| VIEW-03 | Phase 26 | Pending |
| POLISH-01 | Phase 27 | Pending |
| POLISH-02 | Phase 27 | Pending |
| POLISH-03 | Phase 27 | Pending |

**Coverage:**
- v9 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 (100% coverage)

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 — traceability updated after roadmap creation*
