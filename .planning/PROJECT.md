# Mandanten Portal — Creditor Processing

## What This Is

A creditor management system for insolvency cases. Documents are processed by a FastAPI AI service (Gemini), which extracts creditor data, deduplicates it, and sends results to the Node.js/Express backend via webhooks. The backend handles payment status routing, agent review, and client-facing flows.

## Core Value

Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## Current Milestone: v10 2. Anschreiben Automatisierung

**Goal:** End-to-End Workflow für automatisches Erstellen und Versenden des 2. Anschreibens an Gläubiger. Scheduler triggert nach 30 Tagen oder Admin manuell, Mandant bestätigt Finanzdaten im Portal-Formular, System berechnet Pfändung/Quote/Plan-Typ, generiert DOCX-Templates (Ratenplan/Nullplan) und versendet per Resend.

**Target features:**
- 30-Tage Scheduler-Trigger basierend auf MAX(email_sent_at) + manueller Admin-Button
- Mandanten-Portal Formular (altes Portal /src/) — Finanzdaten vorausgefüllt, bestätigen/korrigieren, Snapshot
- Pfändungsberechnung (§ 850c ZPO existiert), Plan-Typ Bestimmung (Ratenplan/Nullplan), Quote pro Gläubiger
- DOCX-Generierung via docxtemplater — zwei Templates (Ratenplan + Nullplan), geliefert vom User
- Versand via Resend SDK — identische Pipeline wie 1. Anschreiben
- Admin Dashboard (MandantenPortalDesign): Trigger-Button, Status-Badge, Tracking-Ansicht
- Separates second_letter_status Feld mit State Machine (FIRST_SENT → SECOND_PENDING → SECOND_IN_REVIEW → SECOND_SENT)
- Email-Benachrichtigung an Mandant via Resend mit Link zum Portal-Formular

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

- [ ] 30-Tage Scheduler + manueller Admin-Trigger für 2. Anschreiben
- [ ] Mandanten-Portal Formular: Finanzdaten vorausfüllen, bestätigen, Snapshot
- [ ] Pfändungsberechnung, Plan-Typ, Quote pro Gläubiger
- [ ] DOCX-Template Pipeline (Ratenplan + Nullplan) via docxtemplater
- [ ] Versand via Resend — identisch zum 1. Anschreiben
- [ ] Admin Dashboard: Trigger-Button, Status-Badge, Tracking
- [ ] second_letter_status State Machine auf Client Model
- [ ] Email-Benachrichtigung an Mandant mit Portal-Link

### Out of Scope

- Client Portal Redesign (neues Design-System für Mandanten) — eigener Milestone
- Vollständiges Agent Portal Migration — nur Review-Funktionalität bisher migriert
- User-Erstellung / Verwaltung — eigener Milestone
- Creditor Database (globale Suche) — eigener Milestone
- 3. Anschreiben oder weitere Anschreiben-Runden — nicht in v10

## Context

Shipped v1-v8 backend + admin frontend (22 phases), v9 Review Dashboard (phases 23-27).
Admin portal (MandantenPortalDesign) has: login, client list, client detail (5 tabs), full review dashboard.
Old client portal (`/src/`) has: FinancialDataForm, ExtendedFinancialDataWizard, creditor confirmation flow.

**1. Anschreiben Pipeline (existing, to replicate for 2. Anschreiben):**
- Trigger: `POST /api/clients/:id/confirm-creditors` → background fire-and-forget
- Generator: `server/services/firstRoundDocumentGenerator.js` — docxtemplater + pizzip
- Template: `server/templates/1.Schreiben.docx` — {Name}, {Adresse}, {Creditor}, {Datum}, etc.
- Sender: `server/services/creditorEmailService.js` — Resend SDK, DOCX attachment, 2s delay
- Tracking: per-creditor `contact_status`, `email_sent_at`, `document_sent_at` in `final_creditor_list[]`

**Financial data (already in Client model):**
- `financial_data`: monthly_net_income, number_of_children, marital_status, garnishable_amount, recommended_plan_type
- `extended_financial_data`: berufsstatus, arbeitgeber, unterhaltsberechtigte, sozialleistungen, vermögen, planlaufzeit
- `determined_plan_type`: nullplan / ratenzahlung / einmalzahlung

**Scheduler:** `server/scheduler.js` — plain setInterval (document reminder, login reminder, auto-confirmation, etc.)

Tech stack:
- **Backend**: Node.js/Express, MongoDB (Mongoose)
- **Old Frontend** (Client Portal): React (CRA), Redux/RTK Query, Tailwind 3
- **Admin Portal**: React (Vite), shadcn/ui, Tailwind 4, DM Sans + JetBrains Mono, RTK Query
- **Email**: Resend SDK v6
- **Documents**: docxtemplater + pizzip (DOCX generation)

Design guidelines: `MandantenPortalDesign/guidelines/Guidelines.md`

## Constraints

- **Design-System**: Guidelines.md einhalten für Admin-Portal (BG #FAFAFA, keine Shadows, pill Badges, max 1 orange CTA)
- **Altes Portal**: Mandanten-Formular in /src/ (CRA) — bestehende Patterns (FinancialDataForm, axios) verwenden
- **Lokal testen**: Erstmal nur lokale Entwicklung, kein Deployment
- **Templates**: DOCX-Templates werden vom User geliefert (nicht selbst erstellen)
- **Bestehende Pipeline**: 1. Anschreiben Pipeline (docxtemplater, Resend, Zendesk) als Vorlage nutzen
- **§ 850c ZPO**: Bestehende garnishable_amount Berechnung nutzen

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
*Last updated: 2026-03-02 after v10 milestone start*
