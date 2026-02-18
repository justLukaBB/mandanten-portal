# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v7 — FastAPI Webhook Field Integration (Phase 17)

## Current Position

Phase: 17 — Schema and Webhook Field Mapping
Plan: —
Status: Not started
Last activity: 2026-02-18 — v7 roadmap created (phases 17-18)

Progress: [░░░░░░░░░░] 0% (v7)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 26
- Average duration: ~2m
- Total execution time: ~0.75 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1 (1-2) | 4 | ~10m | 2.5m |
| v2 (3-6) | 7 | ~16m | 2.3m |
| v2.1 (7) | 1 | ~2m | 2.0m |
| v3 (8-9) | 5 | ~10m | 2.0m |
| v4 (10-12) | 4 | ~13m | 3.3m |
| v5 (13-15) | 4 | ~11m | 2.8m |
| v6 (16) | 1 | ~1m | 1.0m |
| v7 (17-18) | 0 | — | — |

**Recent Trend:**
- Stable at ~1-5m per plan

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Key decision for v6: confirmCreditors in clientCreditorController.js awaits processClientCreditorConfirmation() and startMonitoringForClient() synchronously — blocking response for minutes with many creditors. Fix: save confirmation first, respond immediately, then fire email sending as fire-and-forget (no await).

16-01 decisions:
- Respond immediately after DB save using fire-and-forget IIFE pattern — `(async () => { ... })()`
- Remove creditor_contact from response since emails not yet sent when response returns
- Background IIFE has independent try/catch; errors are logged but never affect the HTTP response

### v7 Context

**New fields being added (5 total):**
- `aktenzeichen_glaeubigervertreter` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `address_source` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `llm_address_original` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `glaeubiger_adresse_ist_postfach` (Boolean, default false) — creditorSchema + documentSchema.extracted_data.creditor_data
- `glaeubiger_vertreter_adresse_ist_postfach` (Boolean, default false) — creditorSchema + documentSchema.extracted_data.creditor_data

**Key files:**
- `server/models/Client.js` — creditorSchema (lines 80-184), documentSchema (lines 4-78)
- `server/controllers/webhookController.js` — webhook handler, enrichDedupedCreditorFromDb
- `server/utils/creditorDeduplication.js` — mergeCreditorLists (line 422)

**Merge rules:**
- `aktenzeichen_glaeubigervertreter`: longest-wins (longer non-empty string wins)
- `glaeubiger_adresse_ist_postfach`: OR-logic (any true → merged true)
- `glaeubiger_vertreter_adresse_ist_postfach`: OR-logic (any true → merged true)

**address_source logic:**
- FastAPI sets `address_source` on extraction (e.g. "llm", "postfach", etc.)
- Node.js `enrichDedupedCreditorFromDb` must set `address_source = "local_db"` when it overwrites the LLM address with a DB address

### Pending Todos

- Test PDF processing with real documents in live environment
- Verify Gemini 2.5 Pro handles multi-page PDFs correctly in practice

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-18
Stopped at: v7 roadmap created — phases 17 and 18 defined
Resume file: None
Next step: Plan Phase 17 (`/gsd:plan-phase 17`)

---
*Last updated: 2026-02-18 (v7 roadmap created)*
