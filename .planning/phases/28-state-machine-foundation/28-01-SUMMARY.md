---
phase: 28-state-machine-foundation
plan: 01
subsystem: database
tags: [mongoose, mongodb, schema, state-machine, second-letter]

# Dependency graph
requires: []
provides:
  - second_letter_status enum field (IDLE/PENDING/FORM_SUBMITTED/SENT, default IDLE) on clientSchema
  - second_letter_financial_snapshot subdocument with 9 financial fields on clientSchema
  - second_letter_triggered_at, second_letter_form_submitted_at, second_letter_sent_at timestamps on clientSchema
  - second_letter_form_token, second_letter_form_token_expires_at fields on clientSchema (Phase 30 readiness)
  - second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename on creditorSchema
  - secondLetterService.js with three atomic state guard functions (triggerSecondLetter, submitForm, markSent)
affects:
  - 29-trigger-and-scheduler (uses triggerSecondLetter, depends on second_letter_status)
  - 30-client-form-portal (uses second_letter_form_token, depends on submitForm)
  - 31-docx-generation (reads second_letter_financial_snapshot)
  - 32-email-dispatch (uses second_letter_sent_at, markSent)
  - 33-admin-ui (reads second_letter_status for display)
  - 34-integration (all fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic state guard via findOneAndUpdate with status filter — null return means guard blocked"
    - "Snapshot-first: financial data frozen at form submission, never reads live data for DOCX"
    - "Separate state machine field (second_letter_status) — does NOT extend current_status enum"

key-files:
  created:
    - server/services/secondLetterService.js
  modified:
    - server/models/Client.js

key-decisions:
  - "UPPERCASE enum values for second_letter_status (IDLE/PENDING/FORM_SUBMITTED/SENT) — different from existing lowercase status fields"
  - "UPPERCASE plan_type in snapshot (RATENPLAN/NULLPLAN) — not the lowercase quotenplan/nullplan from financial_data"
  - "new_creditors as array in snapshot — client can have multiple new creditors"
  - "All second_letter fields are optional/nullable except the status default"
  - "Uses id field (not _id) in findOneAndUpdate filters — consistent with project Client model convention"

patterns-established:
  - "Atomic state guard: findOneAndUpdate({ id, second_letter_status: 'EXPECTED_STATE' }) — null return = guard blocked"
  - "All state transitions in one service file — single entry point prevents double-send"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 28 Plan 01: State Machine Foundation Summary

**MongoDB schema fields for second creditor letter state machine plus atomic transition service with findOneAndUpdate guards for IDLE/PENDING/FORM_SUBMITTED/SENT workflow**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T19:01:27Z
- **Completed:** 2026-03-02T19:03:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended clientSchema with 12 new second_letter_* fields covering all 4 SCHEMA requirements
- Extended creditorSchema with 3 per-creditor second letter tracking fields
- Created secondLetterService.js with three atomic state guard functions using pure findOneAndUpdate pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add second_letter_* fields to clientSchema and creditorSchema** - `2f4bc62` (feat)
2. **Task 2: Create secondLetterService.js with atomic state guard stub** - `54de445` (feat)

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `server/models/Client.js` - Added 12 second_letter_* fields to clientSchema and 3 fields to creditorSchema
- `server/services/secondLetterService.js` - Three atomic state transition functions (triggerSecondLetter, submitForm, markSent)

## Decisions Made
- UPPERCASE enum values for second_letter_status and plan_type — clearly differentiated from existing lowercase status fields
- new_creditors as simple array `[{ name, amount }]` — supports multiple new creditors per client
- All fields optional except status default — no breaking changes to existing data
- Used `id` field (not `_id`) in service filters — consistent with this project's Client model convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing Mongoose warning about duplicate `{id: 1}` index (unrelated to this phase — exists in legacy schema).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 29 (trigger and scheduler): `triggerSecondLetter` function ready — provides atomic IDLE→PENDING guard
- Phase 30 (client form portal): `second_letter_form_token` and `second_letter_form_token_expires_at` fields in schema
- Phase 31 (DOCX generation): `second_letter_financial_snapshot` subdocument defined with all required fields
- Phase 32 (email dispatch): `second_letter_email_sent_at` per creditor, `markSent` transition function
- No blockers for Phase 29 — all schema prerequisites satisfied

---
*Phase: 28-state-machine-foundation*
*Completed: 2026-03-02*
