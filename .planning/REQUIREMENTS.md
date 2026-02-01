# Requirements: Robust Dedup

**Defined:** 2026-01-31
**Core Value:** Creditor deduplication must work reliably regardless of creditor count — no silent failures, no data loss, no token limit surprises.

## v2 Requirements

### LLM Prompt Optimization

- [x] **LLM-01**: Dedup prompt sends only sender_name, reference_number, is_representative, and actual_creditor per creditor — not full objects
- [x] **LLM-02**: LLM returns duplicate group mappings (e.g., `[[0,3,7], [2,5]]`) instead of full creditor JSON
- [x] **LLM-03**: Output token usage stays well under 8192 for 50 creditors

### Code-Based Merging

- [x] **MERGE-01**: Python code merges creditors within each duplicate group using deterministic rules
- [x] **MERGE-02**: Merge prefers non-"N/A" values; when both have values, keep longest/most complete
- [x] **MERGE-03**: `needs_manual_review` is true if ANY creditor in the group had it true
- [x] **MERGE-04**: `source_documents` combines all documents from merged creditors (unique)
- [x] **MERGE-05**: `claim_amount` prefers numeric value, falls back to raw string
- [x] **MERGE-06**: When merging representative + actual creditor, preserve both names explicitly (sender_name for representative, actual_creditor for the real creditor)
- [x] **MERGE-07**: `is_representative` is true if ANY entry in the group was a representative

### Failure Handling

- [x] **FAIL-01**: Dedup retries once on LLM failure before falling back
- [x] **FAIL-02**: If retry fails, case is flagged for manual review (not silently passed through with duplicates)
- [x] **FAIL-03**: Failure logged with creditor count, error, and attempt number

### Path Consistency

- [ ] **PATH-01**: Auto pipeline dedup and admin manual trigger use the same dedup function
- [ ] **PATH-02**: Response schema to Node.js backend remains unchanged

## Future Requirements

### Scalability

- **SCALE-01**: Batching/chunking for 100+ creditor lists
- **SCALE-02**: Alert/notification on repeated dedup failures

## Out of Scope

| Feature | Reason |
|---------|--------|
| Switching LLM provider | Gemini works, just need to use it smarter |
| Changing document extraction pipeline | Working correctly, not related to dedup |
| Agent portal UX changes | Already works once cases reach creditor_review |
| Frontend admin panel changes | Dedup button behavior unchanged |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LLM-01 | Phase 3 | Complete |
| LLM-02 | Phase 3 | Complete |
| LLM-03 | Phase 3 | Complete |
| MERGE-01 | Phase 4 | Complete |
| MERGE-02 | Phase 4 | Complete |
| MERGE-03 | Phase 4 | Complete |
| MERGE-04 | Phase 4 | Complete |
| MERGE-05 | Phase 4 | Complete |
| MERGE-06 | Phase 4 | Complete |
| MERGE-07 | Phase 4 | Complete |
| FAIL-01 | Phase 5 | Complete |
| FAIL-02 | Phase 5 | Complete |
| FAIL-03 | Phase 5 | Complete |
| PATH-01 | Phase 6 | Pending |
| PATH-02 | Phase 6 | Pending |

**Coverage:**
- v2 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

**Phase Distribution:**
- Phase 3 (LLM Prompt Optimization): 3 requirements
- Phase 4 (Code-Based Merge Logic): 7 requirements
- Phase 5 (Failure Handling & Retry): 3 requirements
- Phase 6 (Path Consistency & Integration): 2 requirements

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-02-01 after Phase 5 completion - FAIL-01 through FAIL-03 complete*
