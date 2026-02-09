---
phase: 09-multi-page-extraction
plan: 01
subsystem: extraction
tags: [gemini, pdf, multi-page, page-assignment, pypdf]

# Dependency graph
requires:
  - phase: 08-fastapi-pdf-support
    provides: PDF validation and MIME type handling in extraction pipeline
provides:
  - CreditorData.pages field for PDF page assignments
  - PDF-specific extraction prompt with German page assignment instructions
  - Page data parsing and normalization from Gemini responses
  - Page validation against actual document page count
affects: [09-02, email-attachments, document-splitting]

# Tech tracking
tech-stack:
  added: []
  patterns: [conditional-prompt-extension, page-data-normalization]

key-files:
  created: []
  modified:
    - /tmp/creditor-fastapi/app/models.py
    - /tmp/creditor-fastapi/app/services/document_processor.py

key-decisions:
  - "Use conditional prompt injection for PDF-specific instructions (image extraction unchanged)"
  - "Parse multiple page data formats from Gemini (arrays, ints, range strings)"
  - "Validate page numbers against actual page count (1-based)"

patterns-established:
  - "Conditional prompt extension: Append format-specific instructions only when applicable"
  - "Page data normalization: Handle diverse response formats from AI model"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 09 Plan 01: PDF Page Assignment Summary

**CreditorData extended with pages field, extract_data() conditionally injects German-language page assignment instructions for PDFs with normalized page data parsing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T16:06:07Z
- **Completed:** 2026-02-09T16:08:11Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added pages field to CreditorData model (List[int] with empty default for backward compatibility)
- Created PDF-specific extraction instruction method with German-language page assignment guidance
- Modified extract_data() to conditionally inject PDF instructions only when processing PDFs
- Implemented robust page data parsing handling arrays, ints, and string ranges from Gemini
- Added page validation against actual page_count with warning logs for invalid data

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pages field to CreditorData and extend extraction prompt for PDFs** - `368f1f6` (feat)
   - CreditorData.pages field (List[int], empty default)
   - _get_pdf_extraction_instructions() method
   - extract_data() page_count parameter
   - Conditional PDF instruction injection
   - Page data parsing and validation

**Note:** Commit made in separate FastAPI repository at /tmp/creditor-fastapi

## Files Created/Modified
- `/tmp/creditor-fastapi/app/models.py` - Added pages field to CreditorData model
- `/tmp/creditor-fastapi/app/services/document_processor.py` - Added PDF extraction instructions method, modified extract_data() for conditional prompt injection and page data parsing

## Decisions Made

**1. Conditional prompt injection for PDF-specific instructions**
- Rationale: Keeps image extraction unchanged (no prompt drift), only PDFs get page assignment instructions
- Implementation: Check `is_pdf and page_count` before appending instructions

**2. Normalize multiple page data formats from Gemini**
- Rationale: Gemini may return pages as list, int, or string range ("1-3")
- Implementation: Parse all formats, validate against page_count, filter invalid entries

**3. Use German-language page assignment instructions**
- Rationale: Maintains consistency with existing extraction prompt (all in German)
- Implementation: _get_pdf_extraction_instructions() returns German f-string with ASCII-safe characters

**4. Empty list default for pages field**
- Rationale: Backward compatibility with image extraction (non-PDF documents)
- Implementation: Field(default_factory=list)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without errors. Verification checks passed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 09 Plan 02 (process_document integration):**
- CreditorData.pages field available for page assignment storage
- extract_data() ready to receive page_count from process_document
- PDF instruction injection tested via conditional logic verification
- Page parsing ready to handle Gemini response data

**Blockers/Concerns:**
- None - extraction layer is ready for integration

**Testing notes:**
- End-to-end PDF page assignment will be tested in Plan 02 when process_document passes page_count to extract_data()
- Real-world Gemini page data formats will be validated in live environment

---
*Phase: 09-multi-page-extraction*
*Completed: 2026-02-09*
