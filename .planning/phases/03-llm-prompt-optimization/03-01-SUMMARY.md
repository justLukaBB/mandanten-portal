---
phase: 03-llm-prompt-optimization
plan: 01
subsystem: llm-infrastructure
tags: [gemini, vertex-ai, pydantic, prompt-engineering, token-optimization]

# Dependency graph
requires:
  - phase: 02-payment-handler-logic
    provides: Creditor deduplication workflow with needs_manual_review flag
provides:
  - prepare_creditors_for_llm() - minimal token payload extraction
  - build_dedup_prompt() - German prompt with few-shot examples
  - DuplicateGroups Pydantic model - response structure validation
  - validate_dedup_response() - two-layer validation (schema + semantic)
  - get_dedup_response_schema() - Vertex AI response schema dict
affects: [03-02-dedup-llm-integration, 04-code-based-merge, 05-failure-handling]

# Tech tracking
tech-stack:
  added: [pydantic (already in requirements.txt)]
  patterns: [two-layer validation, minimal LLM payload, structured JSON output, few-shot prompting]

key-files:
  created: []
  modified: [app/services/deduplicator.py]

key-decisions:
  - "LLM only identifies duplicate groups via indices - merging happens in code (Plan 02)"
  - "Four minimal fields per creditor: sender_name, reference_number, is_representative, actual_creditor"
  - "German-language prompt with 2 few-shot examples (reference match, truncated name)"
  - "Two-layer validation: Pydantic schema + semantic completeness/bounds checking"
  - "Vertex AI response_schema enforces structured JSON output from Gemini"

patterns-established:
  - "Minimal LLM payload: ~5-8 tokens per creditor (vs ~100+ with full objects)"
  - "Index array output format: {groups: [[0,3,7], [2,5], ...]} for deterministic downstream processing"
  - "Validation checks: empty groups, negative indices, cross-group duplicates, bounds, completeness"

# Metrics
duration: 2m 7s
completed: 2026-01-31
---

# Phase 03 Plan 01: LLM Prompt Optimization Summary

**Minimal-payload dedup infrastructure with 4-field creditor extraction, German few-shot prompt, and two-layer Pydantic validation**

## Performance

- **Duration:** 2m 7s
- **Started:** 2026-01-31T12:20:27Z
- **Completed:** 2026-01-31T12:22:34Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created minimal token payload extraction (LLM-01) - reduces per-creditor tokens from ~100+ to ~5-8
- Built German dedup prompt with 2 few-shot examples and index array output contract (LLM-02)
- Implemented two-layer validation: Pydantic schema validation + semantic bounds/completeness checking
- Added Vertex AI response schema dict for structured JSON output enforcement
- Established foundation for Plan 02 integration into deduplicate_with_llm()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add prepare_creditors_for_llm() and build_dedup_prompt()** - `33d370a` (feat)
2. **Task 2: Add DuplicateGroups model and validation functions** - `4b6c7a1` (feat)

## Files Created/Modified
- `/Users/luka.s/Cursor : Mandanten - Portal/Creditor-process-fastAPI/app/services/deduplicator.py` - Added 5 new module-level functions/classes (prepare_creditors_for_llm, build_dedup_prompt, DuplicateGroups, get_dedup_response_schema, validate_dedup_response) and Pydantic imports

## Decisions Made

**1. Four minimal fields per creditor**
- Chose sender_name, reference_number, is_representative, actual_creditor as the only fields sent to LLM
- Omit all address, email, amount, document metadata to save tokens
- Empty/N/A values excluded to further reduce payload

**2. German-language prompt with few-shot examples**
- System instruction and rules in German to match domain language
- 2 minimal examples (reference match, truncated name) without reasoning text to minimize tokens
- Examples show output-only format (no "Grund:" fields)

**3. Two-layer validation architecture**
- Layer 1 (Pydantic): Schema validation + field_validator for cross-group duplicates
- Layer 2 (Custom): Bounds checking [0, num_creditors-1] + completeness (all creditors present exactly once)
- Handles both `{"groups": [...]}` and raw `[[...]]` JSON formats from LLM

**4. Vertex AI structured output enforcement**
- get_dedup_response_schema() provides JSON Schema dict for GenerationConfig
- Guarantees syntactically valid JSON from Gemini (no markdown, no comments)
- Reduces parsing errors and improves reliability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 02:**
- All helper functions in place to wire into deduplicate_with_llm()
- Prompt infrastructure complete
- Validation infrastructure complete
- No blockers

**What Plan 02 will do:**
- Replace existing full-object prompt with prepare_creditors_for_llm() + build_dedup_prompt()
- Add Vertex AI response_schema parameter to GenerationConfig
- Parse LLM response with validate_dedup_response()
- Implement code-based merging logic using validated index groups (Plan 04)

**Token budget impact:**
- Current: ~100+ tokens per creditor (full objects)
- After Plan 02: ~5-8 tokens per creditor + ~500 token prompt boilerplate
- 50 creditors: ~5500 tokens → ~900 tokens (6x reduction)
- Stays well under Gemini 2.0 Flash 8192 output token limit

---
*Phase: 03-llm-prompt-optimization*
*Completed: 2026-01-31*
