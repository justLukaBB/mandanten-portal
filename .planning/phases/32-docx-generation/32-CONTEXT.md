# Phase 32: DOCX Generation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate one DOCX letter per creditor using the correct template (Ratenplan or Nullplan) based on plan type, with all template variables populated from snapshot data. Mirrors the existing firstRoundDocumentGenerator pattern (docxtemplater + pizzip). Email dispatch and workflow completion are Phase 33.

</domain>

<decisions>
## Implementation Decisions

### Template content & structure
- DOCX templates (Ratenplan + Nullplan) exist externally and will be provided — not created as part of this phase
- Templates do NOT yet contain docxtemplater placeholders — placeholders must be inserted into the templates
- Placeholder variable names should mirror the firstRoundDocumentGenerator naming conventions where possible for consistency
- Two templates: one for Ratenplan, one for Nullplan — template selection based solely on plan_type field

### Variable formatting
- Currency amounts: German format with period thousands separator, comma decimal, Euro sign — `1.234,56 €`
- Dates: German short format — `02.03.2026` (TT.MM.JJJJ)
- Addresses: Multi-line format — Name, Straße, PLZ Ort (standard German letter format)
- Percentage values (Quote): Whole numbers when possible, decimals only when needed — `45 %` or `45,5 %`

### File naming & storage
- Filename pattern: `{CreditorName}_{Aktenzeichen}_{PlanType}.docx` — e.g. `Mueller-Co-KG_AZ-12345_Ratenplan.docx`
- Special characters in creditor names are sanitized: Umlaute replaced (ü→ue, ä→ae, ö→oe, ß→ss), spaces/special chars replaced with hyphens
- Plan type (Ratenplan/Nullplan) is included in the filename for easy identification
- Files stored in per-client subdirectories: `generated_documents/second_round/{clientId}/`
- Filename is stored on the creditor document in MongoDB

### Error handling
- Generation continues on per-creditor failure — errors are collected, remaining creditors are still processed
- Errors logged both to server log (for debugging) and returned in API response (admin sees which creditors failed)
- Admin can retry generation for individual failed creditors (not just full batch re-run)
- Re-generation overwrites existing file — no versioning, clean overwrite

### Claude's Discretion
- Exact docxtemplater configuration and options
- Sanitization function implementation details
- Internal error object structure
- How to structure the generator class/module

</decisions>

<specifics>
## Specific Ideas

- Mirror firstRoundDocumentGenerator.js as closely as possible — same pattern, same libraries (docxtemplater + pizzip)
- Variable names should be consistent with what the first round uses
- The two templates will be provided externally and placed into the project — phase should document expected template location and required placeholders

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-docx-generation*
*Context gathered: 2026-03-02*
