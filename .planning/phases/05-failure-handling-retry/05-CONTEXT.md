# Phase 5: Failure Handling & Retry - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Dedup failures (LLM API errors, timeouts, malformed/invalid responses) retry once, then flag the case for manual review instead of silently passing duplicates through. Creditors pass through unmerged on failure so the pipeline continues.

</domain>

<decisions>
## Implementation Decisions

### Failure definition
- All errors trigger retry — API errors, timeouts, malformed JSON, validation failures (missing creditors, bad indices)
- Full-or-nothing validation: every creditor must appear in exactly one group. Any gap = failure
- 60-second timeout on LLM calls to catch Vertex AI hangs
- Retry all error types equally (no distinction between transient and semantic failures)

### Retry behavior
- Hardcoded to 1 retry (2 total attempts) — no configurability
- Short delay between attempts (2-5 seconds) to let transient API issues clear
- Same prompt on retry — no prompt modification based on failure type
- After both attempts exhausted, fall through to manual review flagging

### Manual review flagging
- On failure after retry: pass all creditors through unmerged (no dedup applied), set needs_manual_review=true on the case
- Pipeline continues — no blocking. Creditors proceed as-is with the flag
- Store a failure reason alongside the boolean (e.g., "dedup_failed_after_retry") so admins know WHY review is needed
- Case-level flag only — individual creditors are NOT flagged separately
- Failure logging includes: creditor count, error message, attempt number (per FAIL-03 requirement)

### Claude's Discretion
- Whether skip-LLM path (<=1 creditor) errors go through retry pipeline or raise directly
- Logging strategy: whether to log both attempts or only final outcome
- Exact field name and location for the failure reason storage (based on existing case schema)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-failure-handling-retry*
*Context gathered: 2026-02-01*
