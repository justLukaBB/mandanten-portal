---
phase: 32-docx-generation
plan: 01
subsystem: api
tags: [docxtemplater, pizzip, docx, mongodb, second-letter, document-generation]

# Dependency graph
requires:
  - phase: 31-financial-calculation-engine
    provides: second_letter_financial_snapshot with creditor_calculations[], plan_type, garnishable_amount, quota_percentage, tilgungsangebot
  - phase: 28-second-letter-schema
    provides: second_letter_document_filename field on final_creditor_list subdocument
provides:
  - SecondLetterDocumentGenerator class at server/services/secondLetterDocumentGenerator.js
  - generateForAllCreditors(client, snapshot): generates DOCX per creditor with per-client subdirectory output
  - generateForSingleCreditor(client, snapshot, creditor, outputDir): renders single DOCX using correct template (RATENPLAN/NULLPLAN)
  - generateForSingleCreditorById(clientId, creditorId): admin retry method for individual creditor re-generation
  - prepareTemplateData(client, snapshot, creditor): complete template variable map with German formatting
  - Filename pattern: {CreditorName}_{Aktenzeichen}_{PlanType}.docx with Umlaut sanitization
  - Output path: server/generated_documents/second_round/{clientId}/
affects:
  - 33-email-dispatch
  - any phase using second round document generation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SecondLetterDocumentGenerator mirrors FirstRoundDocumentGenerator class structure (docxtemplater + pizzip)"
    - "German quote normalization: normalize „/"/\" inside <w:t> XML elements before PizZip"
    - "Snapshot-only data source: all financial values from second_letter_financial_snapshot, never live financial_data"
    - "Per-client output subdirectory: generated_documents/second_round/{clientId}/"
    - "Post-write DB persistence: Client.findOneAndUpdate with positional $ operator after successful fs.writeFile"
    - "Continue-on-failure collection: try/catch per creditor, errors array returned, loop continues"

key-files:
  created:
    - server/services/secondLetterDocumentGenerator.js
  modified: []

key-decisions:
  - "formatEuro uses toLocaleString('de-DE') not toFixed — avoids wrong rounding and produces correct German format"
  - "German quote normalization applied inside <w:t> elements only (not XML attributes) — prevents corrupting OOXML structure"
  - "Filename DB persistence happens post-loop not inside generateForSingleCreditor — ensures file write confirmed before DB update"
  - "ensureOutputDirectory uses mkdir recursive — simpler than access-then-create, no-op if directory exists"

patterns-established:
  - "Snapshot-only data contract: DOCX reads from second_letter_financial_snapshot, never from live financial_data"
  - "Two-template branching: templatePaths[snapshot.plan_type] || templatePaths.NULLPLAN fallback"
  - "German formatting helpers as module-level functions (not class methods): formatEuro, formatGermanDate, formatPercent, sanitizeForFilename"

requirements-completed: [DOC-01, DOC-02, DOC-03, DOC-04]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 32 Plan 01: DOCX Generation Summary

**SecondLetterDocumentGenerator service class with two-template branching (RATENPLAN/NULLPLAN), snapshot-only data source, German formatting helpers, and per-client subdirectory output**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-02T21:38:56Z
- **Completed:** 2026-03-02T21:41:46Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- SecondLetterDocumentGenerator class created at server/services/secondLetterDocumentGenerator.js, mirroring firstRoundDocumentGenerator.js structure
- Two template paths configured (RATENPLAN + NULLPLAN) with plan_type-based branching and NULLPLAN fallback
- prepareTemplateData populates all 19 template variables from snapshot and client/creditor data with German formatting (currency 1.234,56 EUR, dates DD.MM.YYYY, percentages 45,5 %)
- Per-creditor error collection — loop continues on failure, errors collected and returned
- Filename persisted to MongoDB via findOneAndUpdate positional $ operator after confirmed file write

## Task Commits

Both tasks implemented in the same file; committed atomically:

1. **Task 1 + Task 2: Create SecondLetterDocumentGenerator (infrastructure + generation methods)** - `ab308b6` (feat)

## Files Created/Modified
- `server/services/secondLetterDocumentGenerator.js` - Complete service class: constructor, _normalizeGermanQuotes, ensureOutputDirectory, _buildFilename, formatClientAddress, prepareTemplateData, generateForSingleCreditor, generateForAllCreditors, generateForSingleCreditorById

## Decisions Made
- formatEuro uses `toLocaleString('de-DE')` not `toFixed()` — avoids rounding bugs and produces correct German thousand separator + comma decimal format
- German quote normalization applied only inside `<w:t>` XML text elements to avoid corrupting XML attributes and OOXML structure
- Filename DB persistence happens in the post-loop section of generateForAllCreditors (not inside generateForSingleCreditor) — ensures file write is confirmed before MongoDB is updated (Pitfall 5 avoidance)
- `ensureOutputDirectory` uses `fs.mkdir({ recursive: true })` — no-op if directory exists, simpler than the access-then-create pattern in firstRoundDocumentGenerator
- calcEntry lookup falls back gracefully to empty object `{}` if creditor_id not found in snapshot.creditor_calculations (logs warning, uses zeros)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Templates 2.Schreiben_Ratenplan.docx and 2.Schreiben_Nullplan.docx do not yet exist in server/templates/ — this is expected (noted in RESEARCH.md Pitfall 1). The generator will throw ENOENT when called until templates are placed. End-to-end generation cannot be tested without the template files.

## User Setup Required
The following template files must be placed in `server/templates/` before the generator can be called:
- `server/templates/2.Schreiben_Ratenplan.docx` — Ratenplan letter template with {VariableName} placeholders
- `server/templates/2.Schreiben_Nullplan.docx` — Nullplan letter template with {VariableName} placeholders

Required placeholder variables for both templates (see RESEARCH.md Template Variable Contract):
`{Adresse D C}`, `{Creditor}`, `{Aktenzeichen D C}`, `{Forderung}`, `{Quote}`, `{Auszahlung}`, `{Name}`, `{Geburtstag}`, `{Adresse}`, `{Familienstand}`, `{Unterhaltsberechtigte}`, `{Einkommen}`, `{Plantyp}`, `{Monatliche Rate}`, `{Startdatum}`, `{Frist}`, `{Aktenzeichen des Mandanten}`, `{heutiges Datum}`, `{heutiges D}`

## Next Phase Readiness
- SecondLetterDocumentGenerator is ready to be called by Phase 33 email dispatch orchestrator
- generateForAllCreditors(client, snapshot) is the primary entry point
- generateForSingleCreditorById(clientId, creditorId) is available for admin retry
- Hard blocker: template files must be placed before Phase 33 can run end-to-end generation

---
*Phase: 32-docx-generation*
*Completed: 2026-03-02*
