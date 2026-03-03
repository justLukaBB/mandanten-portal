---
phase: 38-fix-schema-gap-persist-calculation-fields
plan: 01
subsystem: database
tags: [mongoose, schema, mongodb, calculation, second-letter]

# Dependency graph
requires:
  - phase: 31-financial-calculation-engine
    provides: secondLetterCalculationService writes creditor_calculations, calculation_status, calculated_at, total_debt, calculation_error to snapshot
  - phase: 32-docx-generation
    provides: SecondLetterDocumentGenerator reads creditor_calculations from snapshot for DOCX generation
  - phase: 33-email-dispatch-workflow-completion
    provides: dispatchSecondLetterEmails reads calculation_status guard before sending
  - phase: 36-wire-document-generator
    provides: send-second-letter route guards on snapshot.calculation_status == 'completed'
provides:
  - 5 missing Mongoose schema field declarations in second_letter_financial_snapshot (creditor_calculations, calculation_status, calculation_error, calculated_at, total_debt)
  - Mongoose strict mode now persists calculation results from Phase 31 service
  - DOCX generation and email dispatch pipeline unblocked
  - All 34 v10 requirements marked Complete
affects: [server/controllers/clientPortalController.js, server/routes/admin-second-letter.js]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mongoose strict mode: declare ALL fields written by $set operations in the schema — undeclared fields are silently discarded"

key-files:
  created: []
  modified:
    - server/models/Client.js
    - .planning/REQUIREMENTS.md

key-decisions:
  - "creditor_calculations typed as subdocument array (not Array or [{}]) — field names match exactly what Phase 31 secondLetterCalculationService writes"
  - "calculation_status enum ['completed', 'failed'] with NO default — undefined is the correct sentinel for not-yet-calculated"
  - "calculation_error plain String with no required constraint — null writes from success path must be valid"
  - "No write-side code changed — only schema declaration. Phase 31/32/33/36 writes were already correct"

patterns-established:
  - "Schema-first for persistence: any service writing to a Mongoose document via $set must have corresponding field declarations in the schema"

requirements-completed: [CALC-04, DOC-01, DOC-02, DOC-03, DOC-04, SEND-01, SEND-03, SEND-04]

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 38 Plan 01: Fix Schema Gap — Persist Calculation Fields Summary

**5 missing Mongoose schema fields added to second_letter_financial_snapshot, unblocking the full DOCX generation + email dispatch pipeline that was silently failing due to Mongoose strict mode discarding undeclared fields**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-03T11:00:46Z
- **Completed:** 2026-03-03T11:04:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 5 missing field declarations to `second_letter_financial_snapshot` subdocument: `creditor_calculations` (typed array), `calculation_status` (enum), `calculation_error` (String), `calculated_at` (Date), `total_debt` (Number)
- Mongoose schema loads without errors — silent data-loss bug eliminated
- All 34 v10 requirements (CALC-04, DOC-01–04, SEND-01, SEND-03, SEND-04) marked Complete in REQUIREMENTS.md, zero Pending remaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 missing field declarations to second_letter_financial_snapshot schema** - `4c41621` (feat)
2. **Task 2: Update REQUIREMENTS.md checkboxes and traceability for 8 unblocked requirements** - `19066cc` (docs)

## Files Created/Modified

- `server/models/Client.js` — Added `creditor_calculations`, `calculation_status`, `calculation_error`, `calculated_at`, `total_debt` inside `second_letter_financial_snapshot` subdocument
- `.planning/REQUIREMENTS.md` — Flipped 5 checkboxes (`[ ]` → `[x]`), updated 8 traceability rows from Pending to Complete, updated Last Updated line

## Decisions Made

- `creditor_calculations` declared as typed subdocument array (not `Array` or `[{}]`) so field names match exactly what Phase 31's `secondLetterCalculationService` writes: `creditor_id`, `creditor_name`, `claim_amount`, `tilgungsangebot`, `quota_percentage`
- `calculation_status` enum `['completed', 'failed']` with no `default` — `undefined` is the correct sentinel value for "not yet calculated"; adding a default would corrupt the route guard logic in `admin-second-letter.js`
- `calculation_error` is plain `String` with no `required` constraint — null writes from the success path must be valid
- No write-side code changed — `clientPortalController.js`, `admin-second-letter.js`, `secondLetterCalculationService.js` were all already correct; the bug was purely the missing schema declarations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — schema edit was precise and schema loaded cleanly. Pre-existing duplicate index warning on `{id:1}` is unrelated to this change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v10 "2. Anschreiben Automatisierung" is now feature-complete with all 34 requirements marked Complete
- End-to-end pipeline ready for integration testing: client form submission → calculation → DOCX generation → email dispatch
- To test: put a client in FORM_SUBMITTED state with a completed snapshot, then trigger `POST /api/admin/second-letter/:clientId/send`
- No remaining blockers for integration testing

---
*Phase: 38-fix-schema-gap-persist-calculation-fields*
*Completed: 2026-03-03*
