# Phase 6: Path Consistency & Integration - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto pipeline dedup and admin manual trigger must use identical robust dedup logic (optimized prompts, deterministic merge, retry). Currently the two paths diverge: auto has retry + atomic guard + 60s timeout; admin has no retry, no guard, 300s timeout, and duplicated post-processing. This phase unifies them.

</domain>

<decisions>
## Implementation Decisions

### Unification strategy
- Claude's discretion on whether to extract a shared core function or have admin reuse the scheduler — pick what fits the codebase best
- Admin HTTP response must keep returning the full deduplicated creditors array (frontend may use it to refresh without refetch)
- Admin path must get the atomic guard (`dedup_in_progress` flag) to prevent double-clicks
- If dedup is already running when admin triggers, return HTTP 409 Conflict with clear message

### Timeout & retry policy
- Admin gets the same retry logic as auto: 2 attempts, 2-second delay
- Timeout unified to 60 seconds for both paths
- Failed retry flags for manual review in both paths (same safety net regardless of trigger source)
- Retry attempt info stays in server logs only — not included in admin HTTP response

### Post-processing consolidation
- Claude's discretion on how aggressively to consolidate (core shared vs full extraction)
- Admin-specific logic stays in admin controller: ID generation, document-link preservation
- Dedup history entry format standardized across both paths — same shape with a source field (auto vs admin)
- Shared logic extends aiDedupScheduler (exported functions) rather than a new module

### Claude's Discretion
- Exact function boundary for shared vs path-specific code
- How to structure the shared function signature (options object, flags, etc.)
- Whether enrichment logic moves into shared function or stays path-specific
- Internal code organization within aiDedupScheduler

</decisions>

<specifics>
## Specific Ideas

- Both paths already call the same FastAPI endpoint (`/api/dedup/deduplicate-all`) — unification is about the Node.js orchestration layer
- The admin controller at `adminClientCreditorController.js` lines 607-838 has the inline logic to consolidate
- Auto path in `aiDedupScheduler.js` lines 117-424 already has retry + guard — extend this as the source of truth

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-path-consistency-integration*
*Context gathered: 2026-02-01*
