# Mandanten Portal — Creditor Processing

## What This Is

A creditor management system for insolvency cases. Documents are processed by a FastAPI AI service (Gemini), which extracts creditor data, deduplicates it, and sends results to the Node.js/Express backend via webhooks. The backend handles payment status routing, agent review, and client-facing flows.

## Core Value

Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## Current Milestone: v2.1 Aktenzeichen Display Fix

**Goal:** When a creditor has no Aktenzeichen (reference number), the first Anschreiben (Word template) should display nothing instead of "N/A".

**Target features:**
- Aktenzeichen field in first Anschreiben Word template shows empty string instead of "N/A" when missing

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

### Active

- [ ] Aktenzeichen displays empty instead of "N/A" in first Anschreiben Word template

### Out of Scope

- Agent portal UX changes — not needed, portal already shows review clients correctly
- Zendesk ticket creation changes — existing logic works
- Frontend admin panel changes — dedup button behavior unchanged
- Changing the document processing / extraction pipeline — working correctly
- Switching away from Gemini — model works, just need to use it smarter

## Context

Shipped v1 (payment status flow fix) with 7 files modified across Node.js/Express backend.
FastAPI AI service lives at `/Users/luka.s/Cursor : Mandanten - Portal/Creditor-process-fastAPI`.
Current dedup sends full creditor JSON (~53KB for 47 creditors) to Gemini and expects full JSON back.
gemini-2.0-flash has 8192 max output tokens — insufficient for large creditor tables.
When dedup fails, cases fall through with duplicate creditors (silent failure).

Tech stack:
- **Backend**: Node.js/Express, MongoDB
- **AI Service**: Python FastAPI, Google Vertex AI (Gemini), deployed on Render
- **Frontend**: React

## Constraints

- **Tech stack**: No new dependencies — work within existing FastAPI + Node.js setup
- **Backward compatibility**: Dedup results must match the same schema the Node.js backend expects
- **Model limits**: gemini-2.0-flash caps at 8192 output tokens — solution must stay well within this
- **Both paths**: Auto pipeline dedup and admin manual trigger must use identical logic

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Check `needs_manual_review` flag in payment handler | Flag is set by dedup and document processing but ignored at decision point | ✓ Good — v1 |
| Trigger dedup after last document processed instead of 30-min timer | Eliminates race condition between dedup and payment | ✓ Good — v1 |
| MongoDB atomic update for dedup guard | Prevents race conditions without Redis/application locks | ✓ Good — v1 |
| OR logic for needs_manual_review preservation | Creditors never lose manual review flag during dedup | ✓ Good — v1 |
| LLM identifies groups only, merging in code | Reduces token usage dramatically, makes merging deterministic | ✓ Good — v2 |
| Retry + flag on dedup failure | Prevents silent duplicate pass-through | ✓ Good — v2 |

---
*Last updated: 2026-02-02 after v2.1 milestone start*
