# Mandanten Portal — Creditor Processing

## What This Is

A creditor management system for insolvency cases. Documents are processed by a FastAPI AI service (Gemini), which extracts creditor data, deduplicates it, and sends results to the Node.js/Express backend via webhooks. The backend handles payment status routing, agent review, and client-facing flows.

## Core Value

Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## Current Milestone: v9 Review Dashboard

**Goal:** Das alte Agent-Portal Review Dashboard (`src/agent/pages/ReviewDashboard.tsx`) wird komplett neu aufgebaut und ins Admin-Portal (MandantenPortalDesign) integriert. Die bestehenden agent-review Endpoints werden für Admin-Tokens geöffnet, eine Queue-Seite mit KPI-Cards und Filtern gebaut, der Review-Workflow mit Split-Pane Workspace implementiert, und Queue-Management, Analytics und Export ergänzt.

**Target features:**
- Review Queue mit paginierter Liste, KPI-Cards, Prioritäts-Filter und Suche
- Split-Pane Review Workspace (Dokument-Viewer + Korrekturformular)
- Gläubiger-Navigation mit Bestätigen/Korrigieren/Überspringen-Workflow
- Queue-Management: Zuweisung, Batch-Operationen, Auto-Priorität
- PDF.js Dokument-Rendering, Analytics mit Recharts, CSV/XLSX Export
- Real-time Queue-Polling und altes Agent-Portal Redirect

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

- [ ] Review Nav-Item in Sidebar, Routing, Auth-Middleware auf authenticateAdminOrAgent
- [ ] Review Queue mit KPI-Cards, paginierter Tabelle, Prioritäts-Filter und Suche
- [ ] Split-Pane Review Workspace mit Dokument-Viewer und Korrekturformular
- [ ] Queue-Management: Zuweisung, Batch-Operationen, Auto-Priorität
- [ ] PDF.js Viewer, Analytics Dashboard mit Recharts, Review-Settings
- [ ] CSV/XLSX Export, Real-time Polling, altes Agent-Portal Redirect

### Out of Scope

- Client Portal (Mandanten-Ansicht) — eigener Milestone
- Vollständiges Agent Portal — nur Review-Funktionalität wird migriert
- User-Erstellung / Verwaltung — eigener Milestone
- Creditor Database (globale Suche) — eigener Milestone

## Context

Shipped v1-v7 backend features and v8 admin frontend migration (22 phases total).
Admin portal (MandantenPortalDesign) is live with login, client list with filters, and client detail with 5 tabs wired to real backend data.
Old Agent Portal Review Dashboard exists at `src/agent/pages/ReviewDashboard.tsx` — needs rebuilding into admin portal.
Backend has 5 agent-review endpoints under `server/routes/agent-review.js` with `authenticateAgent` middleware.
`authenticateAdminOrAgent` middleware already exists in `server/middleware/auth.js` — single auth change unlocks all endpoints.
Detailed spec: `.planning/REVIEW-DASHBOARD-PLAN.md`

Tech stack:
- **Backend**: Node.js/Express, MongoDB
- **AI Service**: Python FastAPI, Google Vertex AI (Gemini 2.5 Pro), deployed on Render
- **Old Frontend**: React (CRA), Redux/RTK Query, Tailwind 3
- **Admin Portal**: React (Vite), shadcn/ui, Tailwind 4, DM Sans + JetBrains Mono, RTK Query
- **Available UI**: ResizablePanelGroup, Table, Form, Dialog, Skeleton, Badge, Pagination, Recharts

Design guidelines: `MandantenPortalDesign/guidelines/Guidelines.md`

## Constraints

- **Backend-Änderungen erlaubt**: Auth-Middleware-Änderung in Phase 23, neue Endpoints ab Phase 25
- **Design-System**: Guidelines.md einhalten (BG #FAFAFA, keine Shadows, pill Badges, max 1 orange CTA)
- **Lokal testen**: Erstmal nur lokale Entwicklung, kein Deployment
- **Tech stack**: Vite + React + Tailwind 4 + shadcn/ui + Recharts + PDF.js
- **Bestehende Patterns**: RTK Query injectEndpoints, useSearchParams, motion-utils Varianten

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
*Last updated: 2026-02-23 after v9 milestone start*
