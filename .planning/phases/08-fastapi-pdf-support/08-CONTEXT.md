# Phase 8: FastAPI PDF Support - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

FastAPI service accepts and processes PDF files alongside existing image uploads. Backward compatible with current image flow. Proper validation and error handling for bad PDFs. The goal is to get PDF bytes to Gemini as a valid Part with `application/pdf` MIME type, with the service ready to handle multi-creditor responses.

Multi-creditor prompt engineering and page assignment logic may be split into Phase 9 at Claude's discretion based on natural complexity boundaries.

</domain>

<decisions>
## Implementation Decisions

### PDF Validation Rules
- Maximum file size: 10 MB
- Maximum page count: 50 pages
- Accept any PDF content type (scanned, digital, mixed) — no content-type validation beyond MIME
- Password-protected/encrypted PDFs: reject at upload with clear error before sending to Gemini

### API Contract
- Same endpoint as image uploads — no separate PDF endpoint
- Caller does not need to specify MIME type explicitly; FastAPI auto-detects from file bytes
- Response structure: identical base structure to image extraction

### Processing Scope
- Phase 8 should be multi-creditor ready — not limited to single-creditor-per-PDF
- The natural split between Phase 8 and Phase 9 is at Claude's discretion during planning, based on complexity
- User wants the feature to work end-to-end, not just plumbing

### Claude's Discretion
- MIME type source: trust caller's `mime_type` field vs. re-detect from bytes (pick based on existing code patterns)
- Response shape: whether to add optional PDF-specific fields like `page_count`
- Webhook pattern: once per creditor vs. once per PDF (pick based on existing webhook patterns)
- Prompt template changes: include in Phase 8 or defer to Phase 9 (natural split)
- Phase 8/9 boundary: merge or keep separate based on implementation complexity

</decisions>

<specifics>
## Specific Ideas

- Existing v3 research decisions are locked: MIME-type-driven processing internally, single prompt template with conditional PDF fields, no physical PDF splitting, Gemini handles PDFs natively
- The user wants the feature to be multi-creditor ready as early as possible — don't artificially limit Phase 8 to single-creditor if the natural implementation supports more

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-fastapi-pdf-support*
*Context gathered: 2026-02-09*
