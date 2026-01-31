# Phase 3: LLM Prompt Optimization - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the dedup prompt so the LLM receives minimal input (only identifying fields) and returns minimal output (group index arrays instead of full creditor JSON). Must stay well under Gemini 2.0 Flash's 8192 output token limit. Merging logic is Phase 4. Retry/failure handling is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Input field selection
- Claude's discretion on which fields to include (roadmap lists sender_name, reference_number, is_representative, actual_creditor as baseline)
- Claude's discretion on input format (numbered list vs JSON array) — optimize for minimal tokens + reliable matching
- Omit empty/N/A fields from prompt to save tokens (varying field counts per creditor is acceptable)
- Include total creditor count upfront so LLM can verify completeness

### Output contract
- Claude's discretion on exact group format (array of arrays vs keep/remove mapping)
- No confidence scores or reasoning — just groupings (pure data, minimal tokens)
- Include singletons in output — every creditor must appear so code can verify all are accounted for
- Claude's discretion on response format (strict JSON vs code block) — optimize for reliable parsing with Gemini

### Prompt structure
- Prompt instructions in German (matches the creditor data language — German company names, legal terms like GmbH, AG, e.V.)
- Claude's discretion on few-shot examples (balance accuracy vs token budget)
- Claude's discretion on matching rule specificity (explicit rules vs general instruction)
- Optimize specifically for Gemini 2.0 Flash — use its JSON mode and strengths, no need for model-agnostic design

### Edge case handling
- Skip LLM call entirely if <=1 creditor — return immediately with no duplicates
- No upper limit on creditor count — trust the optimized minimal payload to handle realistic volumes
- Representative/actual creditor: LLM should consider the relationship but NOT auto-group — Inkasso Meyer collecting for Deutsche Bank doesn't automatically merge with a direct Deutsche Bank entry (different claims possible)
- Basic validation in this phase: validate JSON structure and index bounds on LLM response, retry on parse failure. Full failure handling deferred to Phase 5.

### Claude's Discretion
- Exact field selection beyond the baseline 4
- Input format (numbered list vs JSON)
- Output group format (array of arrays vs keep/remove)
- Response wrapping (raw JSON vs code block)
- Whether to include few-shot examples
- Level of matching rule specificity in prompt
- How to structure system vs user message split

</decisions>

<specifics>
## Specific Ideas

- Representative creditors need nuanced handling — same actual_creditor doesn't mean auto-duplicate (e.g., Inkasso Meyer collecting for Deutsche Bank on two separate claims should remain separate)
- Creditor count in prompt helps LLM self-verify ("I received 23 creditors and my output covers all 23")
- Singletons in output enable downstream code to verify nothing was dropped

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-llm-prompt-optimization*
*Context gathered: 2026-01-31*
