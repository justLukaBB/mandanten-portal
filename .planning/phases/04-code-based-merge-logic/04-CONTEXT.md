# Phase 4: Code-Based Merge Logic - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Deterministic Python code that merges creditors within duplicate groups after the LLM identifies them. The LLM returns group mappings (arrays of indices) — this phase implements the rules for combining multiple creditor records into one merged record per group.

</domain>

<decisions>
## Implementation Decisions

### Representative creditor handling
- When rep + actual creditor merge: sender_name = representative, actual_creditor = real creditor (explicit preservation of both)
- Field priority for claim_amount, reference_number, etc.: Claude's discretion on which record's data wins
- Multiple representatives for same actual creditor = NOT duplicates — keep as separate creditor entries
- Different representative = different creditor, even if underlying actual_creditor matches

### Merge group edge cases
- Conflicting claim_amounts (e.g., 500, 750, N/A): pick the highest numeric amount
- All-empty fields (everyone has N/A): leave field empty/null, don't preserve N/A
- Trust LLM grouping fully — no sanity checks on name similarity between grouped creditors
- No upper limit on merge group size — trust LLM regardless of how many creditors in a group
- needs_manual_review: OR logic — true if ANY creditor in group had it true (from roadmap success criteria)

### Merge output shape
- source_documents deduplication method: Claude's discretion (check existing data model)
- No audit trail in merged record — merged record replaces originals cleanly
- sender_name for plain duplicates (no rep involved): Claude's discretion on deterministic rule
- Non-merge fields (timestamps, processing status, etc.): keep from first creditor in group

### Claude's Discretion
- Field priority logic when merging rep + actual creditor data (claim_amount, reference_number, etc.)
- source_documents deduplication strategy (by path, name, or both)
- sender_name selection rule for non-representative duplicate groups (longest, first, etc.)

</decisions>

<specifics>
## Specific Ideas

- Multiple representatives for the same actual creditor should produce separate entries — user was explicit that different Inkasso companies = different creditor records
- Highest claim_amount wins on conflict — not most recent, not flagged for review
- Clean replacements, no merge metadata — merged record should look like any other creditor record

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-code-based-merge-logic*
*Context gathered: 2026-01-31*
