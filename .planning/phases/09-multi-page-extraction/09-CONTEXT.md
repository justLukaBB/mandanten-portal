# Phase 9: Multi-Page Extraction - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Gemini extracts all creditors from multi-page PDFs with correct page assignments. Each extracted creditor includes page assignment data. Webhook results use identical data structure as image extraction. Phase 8 (FastAPI PDF support) is complete — this phase handles the extraction logic and result processing.

</domain>

<decisions>
## Implementation Decisions

### Non-creditor page handling
- Claude's discretion on whether to skip silently or log skipped pages
- PDFs in practice contain mixed content (cover sheets, blank pages, separators between creditor letters)
- Only assign pages to a creditor if Gemini is confident they belong together — ambiguous pages stay unassigned
- No need to track or report unassigned pages — just ignore them

### Ambiguous boundary handling
- Gemini makes its best guess on page grouping and the system proceeds — no special flagging for uncertainty
- If Gemini returns 0 creditors from a PDF, return an error to the caller (PDF may not contain creditor letters)
- Trust Gemini's creditor count — no sanity check cap on creditors-per-page ratio

### Prompt guidance depth
- Moderate domain context: describe general structure (creditor name, Aktenzeichen, amounts) and that letters may span multiple pages
- No need for detailed German legal terminology — Gemini handles German legal docs well enough
- No specific terms or patterns known to cause issues

### Claude's Discretion
- Whether to explicitly guide Gemini about multi-page single creditor patterns (e.g., 3-page Forderungsaufstellung) or let it figure it out
- How to structure field extraction in the prompt (explicit field list vs referencing existing schema)
- Whether to use single-call JSON array (all creditors at once) or per-creditor extraction calls
- Loading skeleton / non-creditor page handling approach (silent skip vs log)

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

*Phase: 09-multi-page-extraction*
*Context gathered: 2026-02-09*
