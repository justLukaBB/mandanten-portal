# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.
**Current focus:** v7 — FastAPI Webhook Field Integration (Phase 18)

## Current Position

Phase: 18 — Merge Logic for New Fields
Plan: 01 (complete)
Status: Plan 01 done — ready for next plan
Last activity: 2026-02-18 — 18-01 executed: merge logic for 3 new FastAPI fields in creditorDeduplication.js

Progress: [##░░░░░░░░] 20% (v7, 2 of ~10 estimated plans)

## Performance Metrics

**Velocity (cumulative):**
- Total plans completed: 27
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
| v7 (17-18) | 2 | ~5m | 2.5m |

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

17-01 decisions:
- address_source = 'local_db' set only when address was actually replaced — email-only enrichment does not set it
- 5 new fields added to BOTH creditorSchema and documentSchema.extracted_data.creditor_data for full flow coverage
- No additional mapping code needed in webhook handler — Mongoose schema acceptance is sufficient for fields to flow through existing spread/assign patterns
- [Phase 18]: aktenzeichen_glaeubigervertreter uses longest-wins merge; Postfach flags use OR-logic; both dedup functions receive identical merge blocks

### v7 Context

**New fields added (5 total) — DONE in 17-01:**
- `aktenzeichen_glaeubigervertreter` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `address_source` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `llm_address_original` (String) — creditorSchema + documentSchema.extracted_data.creditor_data
- `glaeubiger_adresse_ist_postfach` (Boolean, default false) — creditorSchema + documentSchema.extracted_data.creditor_data
- `glaeubiger_vertreter_adresse_ist_postfach` (Boolean, default false) — creditorSchema + documentSchema.extracted_data.creditor_data

**Key files:**
- `server/models/Client.js` — creditorSchema (lines 80-189), documentSchema (lines 4-78)
- `server/controllers/webhookController.js` — enrichCreditorContactFromDb (sets address_source), enrichDedupedCreditorFromDb (sets address_source)
- `server/utils/creditorDeduplication.js` — mergeCreditorLists (line 422) — Phase 18 target

**Merge rules (Phase 18 — DONE in 18-01):**
- `aktenzeichen_glaeubigervertreter`: longest-wins — IMPLEMENTED in deduplicateCreditors + deduplicateCreditorsStrict
- `glaeubiger_adresse_ist_postfach`: OR-logic — IMPLEMENTED in both dedup functions
- `glaeubiger_vertreter_adresse_ist_postfach`: OR-logic — IMPLEMENTED in both dedup functions
- Field extraction: all 3 fields propagated through deduplicateCreditorsFromDocuments

**address_source status:**
- FastAPI sets `address_source` on extraction (e.g. "llm", "postfach", etc.)
- Node.js enrichment now sets `address_source = "local_db"` in BOTH enrichment functions when address is overwritten

### Pending Todos

- Test PDF processing with real documents in live environment
- Verify Gemini 2.5 Pro handles multi-page PDFs correctly in practice

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 18-01-PLAN.md — merge logic for 3 new FastAPI fields in creditorDeduplication.js
Resume file: None
Next step: Phase 18 complete — proceed to next phase

---
*Last updated: 2026-02-18 (18-01 complete)*
