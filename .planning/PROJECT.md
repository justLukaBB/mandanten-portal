# Mandanten Portal — Creditor Processing

## What This Is

A creditor management system for insolvency cases. Documents are processed by a FastAPI AI service (Gemini), which extracts creditor data, deduplicates it, and sends results to the Node.js/Express backend via webhooks. The backend handles payment status routing, agent review, and client-facing flows.

## Core Value

Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## Current Milestone: v7 FastAPI Webhook Field Integration

**Goal:** Neue Felder aus dem FastAPI Accuracy Milestone (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, Postfach-Flags) werden im Node.js Backend gespeichert und durch Dedup/Merge geleitet — ohne Frontend-Änderungen.

**Target features:**
- Mongoose Schema erweitert um 5 neue Felder (creditorSchema + documentSchema)
- Webhook Controller mapped neue Felder aus dem FastAPI-Payload in MongoDB
- Creditor Dedup/Merge erhält neue Felder (aktenzeichen_glaeubigervertreter merge, Postfach OR-Logik)

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

- [ ] Mongoose Schema speichert alle 5 neuen FastAPI-Felder (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, Postfach-Flags)
- [ ] Webhook Controller extrahiert neue Felder aus FastAPI-Payload und speichert sie in MongoDB
- [ ] Creditor Merge erhält neue Felder korrekt (aktenzeichen longest-wins, Postfach OR-Logik)

### Out of Scope

- Changing the Zendesk checkbox trigger — existing webhook stays as-is
- Email-Status für User sichtbar machen — Admin sieht Status, User nicht nötig
- Email templates redesign — bestehende Templates bleiben
- Frontend-Display der neuen Felder — v7 ist Backend-only, UI folgt später
- Filtered-Bucket-Anzeige (DR II / M-Pattern) — wird nur in FastAPI gefiltert, nicht im Portal

## Context

Shipped v1 (payment status flow), v2 (robust dedup), v2.1 (Aktenzeichen fix), v2.2 (Resend email attachments), v3 (multi-page PDF), v4 (editable creditor table), v5 (1. Rate Bestätigung).
FastAPI AI service repo: `github.com/justLukaBB/Creditor-process-fastAPI` (branch: `fix/over-aggressive-dedup`).
FastAPI currently only processes images (JPG/PNG) — `_load_image_as_part()` has no PDF MIME type mapping.
Gemini 2.5 Pro supports PDF input natively via `Part.from_data(pdf_bytes, "application/pdf")` with 1M input tokens.
Multi-creditor splitting logic already exists in Node.js webhook handler (`creditor_index`, `creditor_count`, `source_document_id`).
Node.js backend already accepts PDF uploads and sends them to FastAPI — FastAPI just can't process them.

Tech stack:
- **Backend**: Node.js/Express, MongoDB
- **AI Service**: Python FastAPI, Google Vertex AI (Gemini 2.5 Pro), deployed on Render
- **Frontend**: React

## Constraints

- **Tech stack**: No new dependencies — PDF support is native in Gemini API
- **Backward compatibility**: Single-image processing must continue to work identically
- **Model**: Gemini 2.5 Pro for extraction (1M input tokens, handles PDFs natively)
- **No physical splitting**: Only extract data + page assignments, don't split PDFs into files

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

---
*Last updated: 2026-02-18 after v7 milestone start*
