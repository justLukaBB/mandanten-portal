# Roadmap: Mandanten Portal - Creditor Processing

## Milestones

- ✅ **v1 Manual Review & Payment Status Flow Fix** - Phases 1-2 (shipped 2026-01-30)
- 🚧 **v2 Robust Dedup** - Phases 3-6 (in progress)

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

### 🚧 v2 Robust Dedup (In Progress)

**Milestone Goal:** Refactor AI dedup service so the LLM only identifies duplicate groups (small payload), merging happens in code, failures retry and flag for review instead of silently passing through.

#### Phase 3: LLM Prompt Optimization
**Goal**: Minimize LLM payload to avoid token limits
**Depends on**: Phase 2 (v1 shipped)
**Requirements**: LLM-01, LLM-02, LLM-03
**Success Criteria** (what must be TRUE):
  1. Dedup prompt sends only minimal fields (sender_name, reference_number, is_representative, actual_creditor) instead of full creditor objects
  2. LLM returns duplicate group mappings (array of index arrays) instead of full creditor JSON
  3. Token usage for 50 creditors stays well under 8192 output token limit
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Minimal payload helpers + validation infrastructure
- [x] 03-02-PLAN.md -- Wire into live deduplicate_with_llm() method

#### Phase 4: Code-Based Merge Logic
**Goal**: Deterministic creditor merging in Python code after LLM identifies groups
**Depends on**: Phase 3 (new LLM contract)
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06, MERGE-07
**Success Criteria** (what must be TRUE):
  1. Python code merges creditors within each duplicate group using deterministic rules (prefer non-"N/A", keep longest/most complete)
  2. needs_manual_review flag is true if ANY creditor in merge group had it true
  3. source_documents combines all documents from merged creditors without duplicates
  4. claim_amount prefers numeric values, falls back to raw string
  5. Representative + actual creditor merges preserve both names explicitly (sender_name for rep, actual_creditor for real creditor)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

#### Phase 5: Failure Handling & Retry
**Goal**: Dedup failures retry once and flag cases for manual review instead of silently passing through duplicates
**Depends on**: Phase 4 (merge logic working)
**Requirements**: FAIL-01, FAIL-02, FAIL-03
**Success Criteria** (what must be TRUE):
  1. Dedup retries once on LLM failure before falling back
  2. Cases flag for manual review if retry fails (no silent duplicate pass-through)
  3. Failures logged with creditor count, error message, and attempt number
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

#### Phase 6: Path Consistency & Integration
**Goal**: Auto pipeline and admin manual trigger use identical robust dedup logic
**Depends on**: Phase 5 (retry logic working)
**Requirements**: PATH-01, PATH-02
**Success Criteria** (what must be TRUE):
  1. Auto pipeline dedup and admin manual trigger call the same dedup function
  2. Response schema to Node.js backend remains unchanged (backward compatible)
  3. Both paths use optimized prompts, deterministic merge, and retry logic
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Dedup Scheduler Refactor | v1 | 2/2 | Complete | 2026-01-30 |
| 2. Payment Handler Logic | v1 | 2/2 | Complete | 2026-01-30 |
| 3. LLM Prompt Optimization | v2 | 2/2 | Complete | 2026-01-31 |
| 4. Code-Based Merge Logic | v2 | 0/2 | Not started | - |
| 5. Failure Handling & Retry | v2 | 0/2 | Not started | - |
| 6. Path Consistency & Integration | v2 | 0/1 | Not started | - |
