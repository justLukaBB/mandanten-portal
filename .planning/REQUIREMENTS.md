# Requirements: Mandanten Portal — Admin Frontend Migration

**Defined:** 2026-02-18
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v8 Requirements

Requirements for Admin Frontend Migration. Each maps to roadmap phases.

### Setup & Infrastruktur

- [ ] **SETUP-01**: Vite-Projekt mit React, TypeScript und Tailwind 4 ist konfiguriert und startet lokal
- [ ] **SETUP-02**: React Router mit Sidebar-Navigation und Route-Struktur ist eingerichtet
- [ ] **SETUP-03**: RTK Query API-Layer mit Base-URL-Konfiguration (dev/prod) ist aufgesetzt
- [ ] **SETUP-04**: Design-System (shadcn/ui Komponenten, Fonts, Theme-Variablen) ist integriert

### Authentifizierung

- [ ] **AUTH-01**: Admin kann sich über Login-Seite mit Email/Passwort anmelden
- [ ] **AUTH-02**: Admin-Token wird in localStorage gespeichert und bei API-Requests als Bearer-Token gesendet
- [ ] **AUTH-03**: Nicht-authentifizierte Nutzer werden auf Login-Seite weitergeleitet (Protected Routes)

### Client-Liste

- [ ] **LIST-01**: Admin sieht paginierte Client-Liste mit Echtdaten aus /api/admin/clients
- [ ] **LIST-02**: Admin kann Clients nach Name, Fall-ID oder Email durchsuchen
- [ ] **LIST-03**: Admin kann Clients nach Status filtern (Active, Pending, In Review, Blocked, Closed)
- [ ] **LIST-04**: Admin kann Clients nach Flow filtern (Portal zugesendet, 1. Anschreiben, etc.)
- [ ] **LIST-05**: Client-Zeilen zeigen Status-Badge und Flow-Badges korrekt an

### Client-Detail

- [ ] **DETAIL-01**: Admin sieht Client-Übersicht mit Workflow-Status und Phase-Timeline
- [ ] **DETAIL-02**: Admin sieht Client-Profil mit Stammdaten
- [ ] **DETAIL-03**: Admin sieht Dokumente-Tab mit hochgeladenen Dokumenten und AI-Confidence-Scores
- [ ] **DETAIL-04**: Admin sieht Gläubiger-Tab mit Gläubiger-Tabelle (alle Felder inkl. neue v7-Felder)
- [ ] **DETAIL-05**: Admin sieht Aktivitäts-Tab mit Workflow-Verlauf

## Previous Milestone Requirements (all satisfied)

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

### Agent Portal

- **AGENT-01**: Agent-Login und Dashboard
- **AGENT-02**: Creditor Review mit Dokument-Viewer

### Erweiterte Admin-Features

- **EADM-01**: Analytics Dashboard mit Charts
- **EADM-02**: User-Erstellung und -Verwaltung
- **EADM-03**: Settings und Konfiguration
- **EADM-04**: Creditor Database (globale Suche)
- **EADM-05**: Admin-Actions (Dedup triggern, Review triggern, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Client Portal Migration | Eigener Milestone — v8 ist nur Admin |
| Agent Portal Migration | Eigener Milestone — v8 ist nur Admin |
| Neue Admin-Features | Nur bestehende Design-Views umsetzen |
| Backend-Änderungen | API bleibt unverändert |
| Deployment | Erstmal nur lokal testen |
| Neue Design-Komponenten | Nur verwenden was im Design-Repo existiert |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | — | Pending |
| SETUP-02 | — | Pending |
| SETUP-03 | — | Pending |
| SETUP-04 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| LIST-01 | — | Pending |
| LIST-02 | — | Pending |
| LIST-03 | — | Pending |
| LIST-04 | — | Pending |
| LIST-05 | — | Pending |
| DETAIL-01 | — | Pending |
| DETAIL-02 | — | Pending |
| DETAIL-03 | — | Pending |
| DETAIL-04 | — | Pending |
| DETAIL-05 | — | Pending |

**Coverage:**
- v8 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
