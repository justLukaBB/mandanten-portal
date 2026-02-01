---
phase: 04-code-based-merge-logic
plan: 01
subsystem: deduplication
tags: [merge, deterministic, field-priority, python, tdd]

# Dependency graph
requires:
  - phase: 03-02
    provides: LLM index-based grouping output
provides:
  - merge_creditor_group() with deterministic field-priority rules
  - Helper functions for string, numeric, list, and representative merging
  - Comprehensive test coverage (18 test cases)
affects: [04-02, PATH-03]

# Tech tracking
tech-stack:
  added: [pytest]
  patterns:
    - "Field priority merge: non-empty > N/A, longest > shorter"
    - "Numeric priority: highest numeric value wins"
    - "List deduplication: dict.fromkeys() for order preservation"
    - "Boolean OR logic: any() for needs_manual_review and is_representative"

key-files:
  created:
    - "tests/test_merge_creditors.py (288 lines, 18 test cases)"
  modified:
    - "app/services/deduplicator.py (added 247 lines of merge logic)"

key-decisions:
  - "All-N/A fields become None (not 'N/A' string) for cleaner database"
  - "German mirror fields (glaeubiger_name, etc.) sync with English counterparts"
  - "Non-merge fields (document_id, timestamps) pass through from first creditor"
  - "Representative merge preserves both sender_name (rep) and actual_creditor (actual)"

patterns-established:
  - "TDD workflow: RED (failing tests) -> GREEN (implementation) -> REFACTOR (cleanup)"
  - "Helper functions with underscore prefix for internal merge operations"
  - "Non-mutating merge: always dict(creditor[0]) to avoid side effects"

# Metrics
duration: 2min
completed: 2026-02-01
---

# Phase 4 Plan 1: Deterministic Creditor Merge Logic Summary

**merge_creditor_group() implements field-priority merging rules with 6 helper functions, replacing Phase 3's placeholder keep-first-creditor logic**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-01T13:58:47Z
- **Completed:** 2026-02-01T14:01:33Z
- **Tasks:** 3 (TDD cycle: RED -> GREEN -> REFACTOR)
- **Files modified:** 2
- **Tests:** 18/18 passing

## Accomplishments

- Implemented `merge_creditor_group()` with deterministic field-by-field merging
- Created 6 helper functions: `_merge_field`, `_merge_claim_amount`, `_merge_source_documents`, `_merge_review_reasons`, `_merge_representative_fields`
- Wrote 18 comprehensive test cases covering all merge behaviors
- Field merge prefers non-empty, non-N/A values; among valid values, longest string wins
- Claim amount merge picks highest numeric value; ignores strings and None
- Boolean OR logic for `needs_manual_review` and `is_representative`
- Representative groups preserve sender_name (rep) and actual_creditor (actual)
- All-N/A fields become None (not "N/A")
- Non-mutating implementation: never modifies input creditor dicts

## Task Commits

TDD cycle with atomic commits:

1. **Task 1: RED - Write failing tests** - `257b490` (test)
   - 18 test cases covering all merge behaviors
   - Tests initially fail with ImportError (functions don't exist)

2. **Task 2: GREEN - Implement merge logic** - `4564fb4` (feat)
   - Added merge_creditor_group() and 6 helper functions
   - All 18 tests pass
   - File validated as syntactically correct Python

3. **Task 3: REFACTOR - Clean up code** - No commit needed
   - Code review showed no refactoring opportunities
   - Functions already follow best practices (single responsibility, Pythonic idioms)

## Files Created/Modified

**Created:**
- `tests/test_merge_creditors.py` (288 lines)
  - 18 test cases in 6 test classes
  - Covers edge cases, field merge, claim_amount, booleans, lists, representative handling
  - Tests for idempotency and non-mutation

**Modified:**
- `app/services/deduplicator.py` (+247 lines)
  - Added "Merge Logic (Phase 4)" section
  - 6 helper functions (private, prefixed with _)
  - 1 main function (merge_creditor_group)
  - Inserted between LLM infrastructure and CreditorDeduplicator class

## Decisions Made

- **All-N/A fields become None**: Clean database, no sentinel pollution (MERGE-02)
- **Longest string wins**: Proxy for completeness when multiple valid values exist
- **Highest claim_amount wins**: Numeric priority over strings, max() over min() (MERGE-05)
- **German mirror fields sync**: glaeubiger_name = sender_name after merge (consistency)
- **Non-merge field passthrough**: document_id, timestamps, etc. from first creditor (deterministic)
- **Representative fallback**: If rep's actual_creditor is N/A, use non-rep's sender_name (MERGE-06)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**pytest not installed**:
- Resolution: Installed pytest with pip3
- Impact: No delays, standard test infrastructure

## User Setup Required

None - all changes are in Python service code, no external configuration needed.

## Next Phase Readiness

**Ready for Phase 4 Plan 2 (Integration with deduplicator.py):**
- merge_creditor_group() function exists and is fully tested
- All helper functions available for use
- Non-mutating behavior ensures safe integration
- Current deduplicate_with_llm() uses placeholder merge (lines 489-528)
- Phase 4 Plan 2 can replace placeholder with merge_creditor_group() call

**Satisfies MERGE-01 through MERGE-07:**
- ✅ MERGE-01: Deterministic field priority rules (longest string, highest amount, OR booleans)
- ✅ MERGE-02: _merge_field() filters N/A and picks longest; all-N/A returns None
- ✅ MERGE-03: needs_manual_review uses any() OR logic
- ✅ MERGE-04: source_documents deduplicates with dict.fromkeys() preserving order
- ✅ MERGE-05: claim_amount picks highest numeric value, ignores non-numeric
- ✅ MERGE-06: Representative groups set sender_name=rep, actual_creditor=actual
- ✅ MERGE-07: is_representative uses any() OR logic

**Integration points verified:**
- Functions accept List[dict] (same format as Phase 3 creditors)
- Returns dict matching existing creditor schema
- German fields (glaeubiger_name, etc.) populated correctly
- source_documents always returned as list (not string)
- merged_from metadata added for tracking

**Test coverage:**
- Edge cases: empty list, single creditor
- Field merge: non-N/A preference, longest string, all-N/A -> None
- Claim amount: highest numeric wins, no-numeric -> None
- Boolean OR: needs_manual_review, is_representative
- List merge: source_documents, review_reasons (deduplicated, order preserved)
- Representative: both names preserved, fallback to non-rep name
- Non-merge: document_id, timestamps from first creditor
- Behavior: idempotent, non-mutating

---
*Phase: 04-code-based-merge-logic*
*Completed: 2026-02-01*
