---
phase: 04-code-based-merge-logic
plan: 02
subsystem: deduplication
tags: [gemini, llm, vertex-ai, creditor-merge, deduplication]

# Dependency graph
requires:
  - phase: 04-01
    provides: merge_creditor_group() with deterministic field priority rules
provides:
  - deduplicate_with_llm() wired to merge_creditor_group() for all duplicate groups
  - Count invariant assertion (len(result) == len(groups)) for data integrity
  - Complete Phase 4 integration: LLM grouping + code-based merge
affects: [phase-05-payment-status-automation, integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Placeholder code replaced by production implementation (Phase 3 → Phase 4 migration)"
    - "Assertion-based invariant checks for data flow verification"

key-files:
  created: []
  modified:
    - app/services/deduplicator.py

key-decisions:
  - "Removed 40-line inline merge placeholder completely - no gradual migration needed"
  - "Added count invariant assertion to catch data flow errors early"

patterns-established:
  - "Integration pattern: deduplicate_with_llm() orchestrates, merge_creditor_group() implements logic"
  - "Data flow: LLM groups (indices) → extract creditors → merge → result list"

# Metrics
duration: 1min
completed: 2026-02-01
---

# Phase 04 Plan 02: Wire Merge Logic Summary

**Replaced 40-line placeholder merge with 3-line merge_creditor_group() call, completing Phase 4 LLM deduplication integration**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-01T14:04:28Z
- **Completed:** 2026-02-01T14:05:56Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- deduplicate_with_llm() now calls merge_creditor_group() for all duplicate groups (len > 1)
- Singleton handling unchanged (normalized source_documents passthrough)
- Error fallback unchanged (returns original creditors)
- Count invariant assertion added: len(result) == len(validated.groups)
- All 18 merge unit tests pass after integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace placeholder merge with merge_creditor_group() call** - `e53a6ce` (refactor)
2. **Task 2: Verify end-to-end merge integration** - `26ef475` (test)

**Note:** Both commits were made in the FastAPI repo (`Creditor-process-fastAPI`), not the planning repo.

## Files Created/Modified
- `app/services/deduplicator.py` - Replaced Phase 3 placeholder merge (40 lines) with merge_creditor_group() call (3 lines), updated docstring, added count invariant assertion

## Decisions Made

**Count invariant assertion placement:**
- Added `assert len(result) == len(validated.groups)` after merge loop (before logger.info)
- Catches data loss/duplication bugs early in development
- Assertion runs on every deduplication (dev/staging/prod)
- If assertion fires, it means merge logic has a critical bug

**No gradual migration needed:**
- Phase 3 placeholder merge was fully replaced in one step
- merge_creditor_group() produces identical output shape (source_documents, merged_from, needs_manual_review)
- Downstream Node.js webhook expects same schema - no breaking changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - integration was straightforward. merge_creditor_group() was already defined above CreditorDeduplicator class, data flow was correct, and all tests passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next phase:**
- Phase 4 complete: Code-based merge fully integrated
- LLM deduplication pipeline: aggregation → minimal payload → Gemini grouping → deterministic merge → deduplicated creditors
- All merge rules implemented (MERGE-01 through MERGE-07)
- Count invariant protects against data loss bugs

**Integration testing recommended:**
- Test with real multi-creditor cases (representatives, duplicates, singletons)
- Verify merged creditors match expected field values (longest, highest amount, etc.)
- Confirm Node.js webhook correctly receives merged creditor data

**No blockers.**

---
*Phase: 04-code-based-merge-logic*
*Completed: 2026-02-01*
