# Roadmap: Mandanten Portal - Creditor Processing

## Milestones

- ✅ **v1 Manual Review & Payment Status Flow Fix** - Phases 1-2 (shipped 2026-01-30)
- ✅ **v2 Robust Dedup** - Phases 3-6 (shipped 2026-02-01)
- ◆ **v2.1 Aktenzeichen Display Fix** - Phase 7

## Phases

<details>
<summary>✅ v1 Manual Review & Payment Status Flow Fix (Phases 1-2) - SHIPPED 2026-01-30</summary>

### Phase 1: Dedup Scheduler Refactor
**Goal**: Deduplication runs immediately after last document is processed instead of on a 30-minute timer
**Plans**: 2 plans

Plans:
- [x] 01-01: Event-driven dedup with atomic guards
- [x] 01-02: Preserve manual review flags during dedup

### Phase 2: Payment Handler Logic
**Goal**: Payment handler respects needs_manual_review flags and coordinates with dedup
**Plans**: 2 plans

Plans:
- [x] 02-01: Add dedup coordination to payment handler
- [x] 02-02: Check needs_manual_review flag in payment status logic

</details>

<details>
<summary>✅ v2 Robust Dedup (Phases 3-6) - SHIPPED 2026-02-01</summary>

#### Phase 3: LLM Prompt Optimization
**Goal**: Minimize LLM payload to avoid token limits
**Requirements**: LLM-01, LLM-02, LLM-03
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Minimal payload helpers + validation infrastructure
- [x] 03-02-PLAN.md -- Wire into live deduplicate_with_llm() method

#### Phase 4: Code-Based Merge Logic
**Goal**: Deterministic creditor merging in Python code after LLM identifies groups
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06, MERGE-07
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- TDD: Merge helper functions + unit tests
- [x] 04-02-PLAN.md -- Wire merge_creditor_group() into deduplicate_with_llm()

#### Phase 5: Failure Handling & Retry
**Goal**: Dedup failures retry once and flag cases for manual review instead of silently passing through duplicates
**Requirements**: FAIL-01, FAIL-02, FAIL-03
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md -- Retry infrastructure: schema field + retryWithDelay helper + timeout reduction
- [x] 05-02-PLAN.md -- Wire retry into dedup flow + manual review flagging on failure

#### Phase 6: Path Consistency & Integration
**Goal**: Auto pipeline and admin manual trigger use identical robust dedup logic
**Requirements**: PATH-01, PATH-02
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md -- Unify admin controller to call shared runAIRededup service + HTTP 409 guard

</details>

### v2.1 Aktenzeichen Display Fix

**Milestone Goal:** When a creditor has no Aktenzeichen, the first Anschreiben Word template shows nothing instead of "N/A".

#### Phase 7: Aktenzeichen N/A Suppression
**Goal**: First Anschreiben Word template displays empty string instead of "N/A" for missing Aktenzeichen
**Depends on**: Phase 6 (v2 shipped)
**Requirements**: TMPL-01
**Success Criteria** (what must be TRUE):
  1. When a creditor's Aktenzeichen is missing or "N/A", the generated first Anschreiben Word document shows an empty/blank field instead of "N/A"
  2. When a creditor HAS an Aktenzeichen, it displays normally (no regression)
  3. Other fields in the template remain unaffected
**Plans**: TBD (created during `/gsd:plan-phase 7`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Dedup Scheduler Refactor | v1 | 2/2 | Complete | 2026-01-30 |
| 2. Payment Handler Logic | v1 | 2/2 | Complete | 2026-01-30 |
| 3. LLM Prompt Optimization | v2 | 2/2 | Complete | 2026-01-31 |
| 4. Code-Based Merge Logic | v2 | 2/2 | Complete | 2026-02-01 |
| 5. Failure Handling & Retry | v2 | 2/2 | Complete | 2026-02-01 |
| 6. Path Consistency & Integration | v2 | 1/1 | Complete | 2026-02-01 |
| 7. Aktenzeichen N/A Suppression | v2.1 | 0/? | Pending | — |
