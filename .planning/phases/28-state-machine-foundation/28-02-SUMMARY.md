---
phase: 28-state-machine-foundation
plan: 02
subsystem: database
tags: [mongodb, migration, backfill, second-letter, deprecation]

# Dependency graph
requires:
  - 28-01 (second_letter_status field on clientSchema)
provides:
  - One-time migration script to initialize second_letter_status='IDLE' on all existing clients
  - @deprecated JSDoc comments on old Zendesk-centric second-round files
affects:
  - 29-trigger-and-scheduler (scheduler query { second_letter_status: 'IDLE' } now matches all existing clients after migration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk updateMany with $or [$exists:false, null] — catches both missing and explicitly-null fields"
    - "DRY_RUN flag from process.argv — preview mode without DB changes"
    - "Post-update verification count — confirms modifiedCount matches expectations"

key-files:
  created:
    - server/scripts/init-second-letter-status.js
  modified:
    - server/services/secondRoundManager.js
    - server/routes/second-round-api.js

key-decisions:
  - "Uses $or [$exists:false, null] to catch both missing fields and explicitly null values — per RESEARCH.md Pitfall 1"
  - "updateMany single round-trip — no per-document loop (established pattern from backfill-contact-status.js)"
  - "Does NOT touch updated_at — migration is a data correction, not a user-facing update"
  - "Script is idempotent — second run finds 0 clients and exits cleanly"

requirements-completed: [SCHEMA-01]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 28 Plan 02: Migration Script + Deprecation Summary

**One-time bulk migration script initializing second_letter_status=IDLE on all existing clients, plus @deprecated JSDoc markers on Zendesk-centric legacy second-round files**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T19:05:40Z
- **Completed:** 2026-03-02T19:07:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `server/scripts/init-second-letter-status.js` — bulk updateMany migration with --dry-run support, post-update verification, and idempotent behavior
- Added `@deprecated` JSDoc to `secondRoundManager.js` pointing to `secondLetterService.js`
- Added `@deprecated` JSDoc to `second-round-api.js` clarifying these routes are backward-compat only

## Task Commits

Each task was committed atomically:

1. **Task 1: Create init-second-letter-status.js migration script** — `d9c9368` (feat)
2. **Task 2: Add deprecation comments to old second-round files** — `a1ea6a0` (chore)

## Files Created/Modified

- `server/scripts/init-second-letter-status.js` — Migration script: connects to MongoDB, counts affected clients, runs updateMany, verifies result, disconnects
- `server/services/secondRoundManager.js` — Added @deprecated JSDoc at top (no code changes)
- `server/routes/second-round-api.js` — Added @deprecated JSDoc at top (no code changes)

## Decisions Made

- Used `$or: [{ $exists: false }, { null }]` to handle both missing and explicitly-null fields — matches RESEARCH.md Pitfall 1 warning
- Single `updateMany` call (not per-document loop) — consistent with project backfill pattern and single DB round-trip efficiency
- Did not set `updated_at` — migration is a data correction, not a user action
- Followed exact boilerplate from `backfill-contact-status.js`: dotenv path, config require, DRY_RUN flag, emoji logging, mongoose.disconnect

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Run the migration script against the production database before Phase 29 goes live:

```bash
# Preview (no changes):
node server/scripts/init-second-letter-status.js --dry-run

# Apply:
node server/scripts/init-second-letter-status.js
```

The script is idempotent — safe to run multiple times.

## Next Phase Readiness

- Phase 29 (trigger and scheduler): All existing clients now queryable by `{ second_letter_status: 'IDLE' }` after migration runs
- No blockers for Phase 29

## Self-Check: PASSED

- FOUND: server/scripts/init-second-letter-status.js
- FOUND: .planning/phases/28-state-machine-foundation/28-02-SUMMARY.md
- FOUND commit: d9c9368 (feat — migration script)
- FOUND commit: a1ea6a0 (chore — deprecation comments)

---
*Phase: 28-state-machine-foundation*
*Completed: 2026-03-02*
