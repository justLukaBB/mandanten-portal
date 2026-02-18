---
phase: 17-schema-webhook-field-mapping
plan: 01
subsystem: database
tags: [mongoose, schema, webhook, fastapi, creditor, enrichment]

# Dependency graph
requires: []
provides:
  - Mongoose creditorSchema extended with 5 new FastAPI fields
  - Mongoose documentSchema.extracted_data.creditor_data extended with 5 new FastAPI fields
  - address_source enrichment logic in enrichCreditorContactFromDb and enrichDedupedCreditorFromDb
affects:
  - 17-02 (if applicable)
  - 18-merge-logic (merge rules for aktenzeichen_glaeubigervertreter and postfach booleans)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "address_source provenance tracking: local_db set when DB overwrites LLM-extracted address"
    - "Optional field pattern: String fields default null, Boolean fields default false — no validation errors on omission"

key-files:
  created: []
  modified:
    - server/models/Client.js
    - server/controllers/webhookController.js

key-decisions:
  - "address_source set only when address was actually missing and then filled — not set if email-only enrichment occurs"
  - "5 new fields added to BOTH creditorSchema and documentSchema.extracted_data.creditor_data for full payload-to-DB flow"
  - "Condition in enrichCreditorContactFromDb: OR logic — set local_db if either address or sender_address was replaced"

patterns-established:
  - "Address provenance: whenever local DB overwrites an LLM address, address_source = 'local_db' is set immediately inside the replacement block"

requirements-completed:
  - SCHEMA-01
  - SCHEMA-02
  - HOOK-01
  - HOOK-02

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 17 Plan 01: Schema and Webhook Field Mapping Summary

**5 FastAPI fields (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, and 2 postfach booleans) added to Mongoose creditor and document schemas with address_source = "local_db" enrichment logic in both enrichment functions**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T15:42:03Z
- **Completed:** 2026-02-18T15:44:45Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 5 new FastAPI fields accepted by Mongoose without validation errors when omitted (String defaults null, Boolean defaults false)
- Fields flow through webhook payload to both `final_creditor_list` creditors and `documents.extracted_data.creditor_data` documents
- `enrichCreditorContactFromDb` sets `address_source = 'local_db'` when it fills a missing address or sender_address from local DB
- `enrichDedupedCreditorFromDb` sets `address_source = 'local_db'` inside the `needAddr && match.address` block (both German/English field formats set simultaneously)
- Email-only enrichment does NOT set address_source — provenance is address-specific

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 new fields to creditorSchema and documentSchema** - `3216227` (feat)
2. **Task 2: Set address_source to local_db when enrichment overwrites address** - `5aea448` (feat)

## Files Created/Modified
- `server/models/Client.js` - Added 5 new fields to creditorSchema (after glaeubigervertreter_adresse) and documentSchema.extracted_data.creditor_data (after actual_creditor)
- `server/controllers/webhookController.js` - Added address_source = 'local_db' assignment in enrichCreditorContactFromDb and enrichDedupedCreditorFromDb

## Decisions Made
- `address_source = 'local_db'` is set only when address was replaced — not when only email is enriched. This preserves the semantic: address_source tracks address provenance, not general enrichment.
- In `enrichCreditorContactFromDb`, the condition uses OR logic (`missingAddress || missingSenderAddress`) because either field being filled constitutes an address replacement.
- No additional mapping code needed in the webhook handler itself — Mongoose schema acceptance is sufficient for the fields to flow through the existing spread/assign patterns.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schemas updated and verified — Phase 18 merge logic can now reference `aktenzeichen_glaeubigervertreter`, `glaeubiger_adresse_ist_postfach`, and `glaeubiger_vertreter_adresse_ist_postfach` fields on creditor objects
- `address_source` field will contain `'local_db'` on any creditor where Node.js DB enrichment replaced the LLM-extracted address, enabling Phase 18 to implement proper merge precedence

## Self-Check: PASSED

- FOUND: server/models/Client.js
- FOUND: server/controllers/webhookController.js
- FOUND: 17-01-SUMMARY.md
- FOUND: commit 3216227 (Task 1)
- FOUND: commit 5aea448 (Task 2)

---
*Phase: 17-schema-webhook-field-mapping*
*Completed: 2026-02-18*
