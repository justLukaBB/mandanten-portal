# Mandanten Portal — Creditor Processing

## What This Is

A creditor management system for insolvency cases. Documents are processed by a FastAPI AI service (Gemini), which extracts creditor data, deduplicates it, and sends results to the Node.js/Express backend via webhooks. The backend handles payment status routing, agent review, and client-facing flows.

## Core Value

Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## Current Milestone: v8 Admin Frontend Migration

**Goal:** Das neue Design aus MandantenPortalDesign (Vite + shadcn/ui + Tailwind 4) als Admin-Frontend aufsetzen und die bestehenden Design-Views (Client-Liste + Client-Detail) an das Node.js Backend anbinden.

**Target features:**
- Vite-Projekt mit Routing, Auth und API-Layer aufsetzen
- Admin-Login mit bestehendem Backend-Auth-System
- Client-Liste mit Echtdaten (Suche, Filter, Pagination) via /api/admin/clients
- Client-Detail-View mit Tabs (Übersicht, Dokumente, Gläubiger) an Backend-Endpoints

## Requirements

### Validated

- ✓ AI deduplication merges creditors and sets `needs_manual_review` flags — existing
- ✓ Payment handler routes to `creditor_review` or `awaiting_client_confirmation` — v1
- ✓ Agent portal shows clients needing review — existing
- ✓ Zendesk ticket created on creditor review — existing
- ✓ Document processing pipeline extracts creditors with flags — existing
- ✓ Payment handler checks `creditor.needs_manual_review` flag — v1
- ✓ AI deduplication triggers after last document is processed instead of 30-minute timer — v1
- ✓ Race condition eliminated: creditor list is finalized before payment status decision — v1
- ✓ Aktenzeichen displays empty instead of "N/A" in first Anschreiben Word template — v2.1
- ✓ Creditor emails sent via Resend with PDF attachments — v2.2
- ✓ Sent emails synced to creditor-email-matcher — v2.2
- ✓ FastAPI processes multi-page PDFs natively — v3
- ✓ Gemini extraction handles multi-page documents with page assignments — v3
- ✓ Payment handler sends Resend email when 1. Rate paid without documents — v5
- ✓ After document upload + processing, payment flow auto-continues — v5
- ✓ Admin dashboard button triggers full payment handler flow — v5
- ✓ Editable creditor table with inline edit, add, delete — v4
- ✓ German field support in creditor management — v4
- ✓ Creditor details shown in portal with German field fallbacks — v5-fix

### Active

- [ ] Vite-Projekt mit React Router, Redux/RTK Query aufsetzen
- [ ] Admin-Authentifizierung (Login, Token-Management, Protected Routes)
- [ ] Client-Liste mit Backend-Anbindung (Suche, Filter, Pagination)
- [ ] Client-Detail-View mit echten Daten (Übersicht, Dokumente, Gläubiger, Workflow-Status)

### Out of Scope

- Client Portal (Mandanten-Ansicht) — kommt in späterem Milestone
- Agent Portal — kommt in späterem Milestone
- Neue Admin-Features über bestehende Design-Views hinaus — nur was im Design existiert
- Analytics Dashboard — Design existiert noch nicht
- User-Erstellung / Settings — Design existiert noch nicht
- Backend-Änderungen — bestehendes API bleibt unverändert

## Context

Shipped v1-v7 backend features (payment flow, dedup, PDF, creditor table, email, webhook fields).
New frontend design exists in `MandantenPortalDesign/` — Vite + React 18.3 + Tailwind CSS 4 + shadcn/ui.
Design has 48 UI components, Client-Liste, Client-Detail mit Tabs, Sidebar, Status/Flow-Badges.
Design is a Figma-generated prototype with mock data — no routing, no API, no auth.
Backend API already has all needed endpoints (admin/clients, workflow-status, documents, creditors).

Tech stack:
- **Backend**: Node.js/Express, MongoDB (unchanged)
- **AI Service**: Python FastAPI, Google Vertex AI (Gemini 2.5 Pro), deployed on Render
- **Old Frontend**: React (CRA), Redux/RTK Query, Tailwind 3
- **New Frontend**: React (Vite), shadcn/ui, Tailwind 4, DM Sans + JetBrains Mono

Design repo: `MandantenPortalDesign/` (lokal geklont)

## Constraints

- **Backend unverändert**: Keine API-Änderungen — Frontend passt sich an bestehende Endpoints an
- **Design-System**: Nur bestehende Design-Komponenten verwenden, keine neuen Designs bauen
- **Lokal testen**: Erstmal nur lokale Entwicklung, kein Deployment
- **Tech stack**: Vite + React + Tailwind 4 + shadcn/ui (wie im Design-Repo)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Check `needs_manual_review` flag in payment handler | Flag is set by dedup and document processing but ignored at decision point | ✓ Good — v1 |
| Trigger dedup after last document processed instead of 30-min timer | Eliminates race condition between dedup and payment | ✓ Good — v1 |
| MongoDB atomic update for dedup guard | Prevents race conditions without Redis/application locks | ✓ Good — v1 |
| OR logic for needs_manual_review preservation | Creditors never lose manual review flag during dedup | ✓ Good — v1 |
| LLM identifies groups only, merging in code | Reduces token usage dramatically, makes merging deterministic | ✓ Good — v2 |
| Retry + flag on dedup failure | Prevents silent duplicate pass-through | ✓ Good — v2 |
| Let Gemini decide page grouping | Simpler than pre-splitting; Gemini 2.5 Pro handles PDFs natively with 1M input tokens | — Pending |

| Use MandantenPortalDesign as new frontend base | Modern stack (Vite, Tailwind 4, shadcn/ui), professional design system | — Pending |

---
*Last updated: 2026-02-18 after v8 milestone start*
