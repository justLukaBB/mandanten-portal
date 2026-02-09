# Feature Landscape: Multi-Page PDF Creditor Extraction

**Domain:** Document AI extraction with Gemini 2.5 Pro for multi-page PDFs
**Researched:** 2026-02-09
**Confidence:** MEDIUM (based on Gemini capabilities from training data, FastAPI architecture analysis, existing webhook flow)

## Executive Summary

This research focuses on **adding multi-page PDF support** to an existing single-image creditor extraction system. The system already handles multi-creditor detection per image, deduplication, and splitting logic. The challenge is extending Gemini extraction to handle three PDF scenarios: (1) PDFs with multiple independent creditor letters (sammel-scan), (2) multi-page single creditor letters, and (3) mixed scenarios.

**Key insight:** Gemini 2.5 Pro natively processes multi-page PDFs with 1M input tokens. The extraction prompt must identify which pages belong to which creditor and return page assignments in structured output. Physical PDF splitting is NOT needed - only data extraction with page metadata.

---

## Table Stakes

Features users expect for multi-page PDF processing. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Native PDF input** | PDFs are standard document format for scans | Low | Gemini API: `Part.from_data(pdf_bytes, "application/pdf")` - already supported |
| **Multi-creditor detection in single PDF** | Sammel-scans (bulk scans) are common in insolvency workflows | Medium | Existing system already does this for images; extend prompt to PDFs |
| **Page range assignment per creditor** | Users need to know which pages belong to which creditor | High | New requirement - must return `pages: [1,2,3]` for each extracted creditor |
| **Multi-page single creditor handling** | Creditor letters often span 2-3 pages (cover letter + details + terms) | Medium | Prompt must group consecutive pages as one creditor |
| **Backward compatibility with single images** | Existing upload flow must continue to work | Low | FastAPI already handles images; add PDF MIME type to `_load_image_as_part()` |
| **Extraction result schema consistency** | Node.js webhook expects same structure regardless of file type | Medium | `results[]` must include `pages` field; existing fields unchanged |
| **Error handling for corrupted PDFs** | PDFs can be password-protected, corrupted, or unreadable | Medium | Return `processing_status: 'error'` with reason; existing error flow |

**Dependencies on existing features:**
- Multi-creditor splitting logic (`creditor_index`, `creditor_count`, `source_document_id`) - ALREADY EXISTS
- Webhook handler expects `results[]` array - ALREADY EXISTS
- Deduplication merges creditors across documents - ALREADY EXISTS

---

## Differentiators

Features that set the product apart. Not expected, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Intelligent page boundary detection** | Automatically detects where one letter ends and another begins based on content | High | Gemini can analyze letterheads, signatures, greeting/closing patterns to infer boundaries |
| **Mixed document type detection** | Handles PDFs containing both creditor letters and non-creditor documents (invoices, contracts, etc.) | Medium | Existing classification logic (`is_creditor_document`) applied per-page-group |
| **Confidence scoring per page group** | Separate confidence for each detected creditor in a multi-creditor PDF | Medium | Extend existing `confidence` field; helps flag low-quality scans |
| **OCR quality assessment** | Detects poor scan quality, rotated pages, handwritten sections | Medium | Gemini can detect "low text quality" and flag for manual review |
| **Table extraction from multi-page invoices** | Creditor claims often include multi-page itemized lists | High | Gemini can extract tables; useful for claim amount validation |
| **Representative vs direct creditor detection across pages** | Law firm letterhead on page 1, actual creditor on page 2 | Medium | Existing `is_representative` logic; extend to multi-page context |
| **Page orientation auto-correction** | Handles rotated pages within PDF | Low | Gemini handles rotated images natively |

**Recommended for MVP:**
1. Intelligent page boundary detection (CRITICAL for sammel-scans)
2. Mixed document type detection (table stakes for real-world uploads)
3. Confidence scoring per page group (existing feature, extend to pages)

**Defer to post-MVP:**
- OCR quality assessment (manual review flags already exist)
- Table extraction (nice-to-have, not blocking)
- Page orientation auto-correction (Gemini likely handles this automatically)

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Physical PDF page splitting into separate files** | Adds storage complexity, GCS overhead, file management burden | Extract page assignments as metadata only; display logic filters pages client-side |
| **Pre-processing PDF to images before Gemini** | Wastes tokens, loses native PDF text extraction, slower | Send PDF directly to Gemini via `Part.from_data()` |
| **Trying to merge multi-page letters back into single PDF** | Scope creep; users only need data extraction, not document reconstruction | Return page ranges in extraction result; let frontend display relevant pages |
| **OCR preprocessing layer (Tesseract, Google Document AI)** | Gemini handles OCR natively; adds latency and cost | Let Gemini process PDF end-to-end |
| **Manual page number input from users** | Defeats purpose of AI extraction | Let Gemini infer page boundaries automatically |
| **Splitting PDF before sending to FastAPI** | Node.js would need PDF manipulation; FastAPI already has this | Keep Node.js stateless; FastAPI handles all PDF logic |
| **Creating new upload flow for PDFs vs images** | Confusing UX; users shouldn't care about file format | Single upload endpoint; FastAPI routes by MIME type |

**Rationale for "no physical splitting":**
- Existing system stores one document record per source file in MongoDB
- Multi-creditor splits create virtual records with `source_document_id` pointer
- Frontend filters `hidden_from_portal` to hide source docs
- **Page metadata suffices:** `{ creditor: "ABC Corp", pages: [1,2,3] }` enables filtered display

---

## Feature Dependencies

```
Multi-Page PDF Support (this milestone)
├── DEPENDS ON (already built):
│   ├── Single-image creditor extraction
│   ├── Multi-creditor splitting (creditor_index, creditor_count, source_document_id)
│   ├── Webhook handler expects results[] array
│   ├── Deduplication merges creditors across documents
│   └── Manual review flagging (needs_manual_review, review_reasons)
│
├── EXTENDS (new capabilities):
│   ├── Gemini prompt: identify page boundaries
│   ├── Extraction result: add pages[] field per creditor
│   ├── FastAPI: PDF MIME type support in _load_image_as_part()
│   └── Webhook: preserve page metadata in document records
│
└── ENABLES (future features):
    ├── Client portal: "View pages 1-3 for Creditor ABC"
    ├── Agent portal: "Review pages 4-5 flagged for low confidence"
    └── Email templates: "Pages 1-2 of your uploaded document"
```

**Critical path:**
1. **FastAPI PDF input** - Add PDF MIME type to Part loading
2. **Gemini prompt update** - Instruct LLM to group pages and return page ranges
3. **Extraction schema** - Add `pages: [int]` field to creditor results
4. **Webhook persistence** - Store page metadata in MongoDB document records
5. **Deduplication compatibility** - Ensure page metadata survives merge logic

---

## Gemini Multi-Page PDF Patterns

### How Gemini Processes PDFs

**Native PDF handling (Gemini 2.5 Pro):**
```python
# FastAPI current pattern (images only):
part = Part.from_data(image_bytes, mime_type="image/jpeg")

# NEW: PDF support (same API):
part = Part.from_data(pdf_bytes, mime_type="application/pdf")
```

**What Gemini sees:**
- All pages as a single context (up to 1M tokens)
- Text extracted natively (OCR included)
- Layout preserved (can distinguish letterheads, signatures, tables)
- Page boundaries visible to model

**Prompt pattern for page assignment:**
```json
{
  "creditors": [
    {
      "creditor_name": "ABC Corporation",
      "pages": [1, 2, 3],
      "email": "info@abc.com",
      "claim_amount": 5000.00
    },
    {
      "creditor_name": "XYZ Law Firm",
      "pages": [4, 5],
      "email": "collections@xyz-law.de",
      "claim_amount": 12000.00
    }
  ]
}
```

### Scenarios Gemini Must Handle

**Scenario 1: Sammel-scan (multiple independent letters)**
- PDF pages: 1-5
- Page 1-2: Letter from Creditor A
- Page 3: Letter from Creditor B
- Page 4-5: Letter from Creditor C
- **Expected result:** 3 creditors with `pages: [1,2]`, `pages: [3]`, `pages: [4,5]`

**Scenario 2: Multi-page single creditor**
- PDF pages: 1-3
- All pages from one creditor (cover letter + claim details + terms)
- **Expected result:** 1 creditor with `pages: [1,2,3]`

**Scenario 3: Mixed (creditor + non-creditor)**
- PDF pages: 1-4
- Page 1-2: Creditor letter
- Page 3-4: Invoice (not a creditor claim)
- **Expected result:** 1 creditor with `pages: [1,2]`, 1 non-creditor doc with `pages: [3,4]`

**Scenario 4: Single-page creditor (existing behavior)**
- PDF pages: 1
- **Expected result:** 1 creditor with `pages: [1]`

### Confidence Assessment

| Claim | Confidence | Verification Status |
|-------|------------|---------------------|
| Gemini 2.5 Pro supports PDF input natively | HIGH | Based on training data (Gemini API docs) |
| 1M input token limit sufficient for typical PDFs | HIGH | Project context confirms Gemini 2.5 Pro 1M limit |
| Gemini can identify page boundaries | MEDIUM | Training data suggests this capability; needs verification |
| Prompt can instruct page range output | HIGH | Structured output with arrays is standard Gemini feature |
| OCR quality for scanned PDFs | MEDIUM | Gemini handles OCR but quality depends on scan resolution |
| Existing webhook schema is extensible | HIGH | Verified from webhookController.js - `extracted_data` accepts arbitrary fields |

---

## MVP Feature Checklist

**Phase 1: Core PDF Processing**
- [ ] Add PDF MIME type to FastAPI `_load_image_as_part()`
- [ ] Update Gemini prompt to request page ranges in output
- [ ] Test with single-page PDF (should return `pages: [1]`)
- [ ] Test with multi-page single creditor (should return `pages: [1,2,3]`)

**Phase 2: Multi-Creditor PDFs**
- [ ] Test with sammel-scan (2 creditors, pages 1-2 and 3-4)
- [ ] Verify creditor splitting logic creates separate records
- [ ] Verify page metadata preserved in `extracted_data.pages`

**Phase 3: Edge Cases**
- [ ] Test with mixed creditor/non-creditor PDF
- [ ] Test with rotated pages
- [ ] Test with low-quality scans
- [ ] Test error handling for password-protected PDFs

**Phase 4: Integration**
- [ ] Webhook persists page metadata to MongoDB
- [ ] Deduplication preserves page metadata during merge
- [ ] Agent portal displays page ranges (if UI exists)

---

## Open Questions for Implementation

**Q1: Should page numbers be 0-indexed or 1-indexed?**
- **Recommendation:** 1-indexed (matches PDF viewers, user mental model)
- Gemini likely returns 1-indexed; verify in prompt

**Q2: What if Gemini fails to detect page boundaries?**
- **Fallback:** Treat entire PDF as single creditor (manual review flagged)
- Set `needs_manual_review: true` with reason "Unable to split pages"

**Q3: How to handle creditor spanning non-consecutive pages? (e.g., pages 1, 3, 5)**
- **Unlikely:** Creditor letters are typically consecutive
- **If occurs:** Accept non-consecutive arrays; frontend displays all relevant pages

**Q4: Should we validate page ranges (e.g., pages exist in PDF)?**
- **Recommendation:** YES - Basic validation in FastAPI
- If Gemini returns `pages: [1,2,3]` but PDF has 2 pages, flag error

**Q5: What metadata to store for page assignment?**
- **Minimum:** `extracted_data.pages: [int]` per creditor
- **Nice-to-have:** `extracted_data.total_pages: int` for source PDF

**Q6: Do existing deduplication prompts handle page metadata?**
- **Current state:** Deduplication happens at creditor level, not document level
- **Action needed:** Verify page metadata doesn't confuse dedup (should be ignored)

---

## Implementation Complexity Estimates

| Feature | Complexity | LOC Estimate | Risk |
|---------|------------|--------------|------|
| Add PDF MIME type to FastAPI | Low | 5-10 | Low - one-line change |
| Update Gemini prompt for pages | Low | 10-20 | Low - prompt engineering |
| Extend extraction schema | Low | 5-10 | Low - add field to JSON |
| Webhook page persistence | Low | 10-20 | Low - pass-through field |
| Test multi-page scenarios | Medium | 50-100 | Medium - requires test PDFs |
| Edge case handling (errors) | Medium | 30-50 | Medium - error message clarity |
| Deduplication compatibility | Low | 0-5 | Low - should be transparent |

**Total estimate:** 110-215 lines of code, 2-3 days implementation + testing

---

## Success Criteria

**Functional:**
- [ ] Single-page PDF processed identically to single image
- [ ] Multi-page single creditor returns one record with `pages: [1,2,3]`
- [ ] Sammel-scan with 2 creditors returns 2 records with correct page ranges
- [ ] Mixed PDF (creditor + non-creditor) classifies correctly
- [ ] Existing image upload flow unchanged

**Data Integrity:**
- [ ] Page metadata persists to MongoDB
- [ ] Deduplication doesn't lose page data
- [ ] Webhook schema validation passes

**Error Handling:**
- [ ] Corrupted PDF returns `processing_status: 'error'`
- [ ] Password-protected PDF flagged with clear error
- [ ] Low-confidence page splitting triggers manual review

**Performance:**
- [ ] PDF processing time comparable to image (within 2x)
- [ ] 1M token limit not exceeded for typical 10-page PDFs

---

## Sources

**System analysis:**
- `/Users/luka.s/Mandanten-Portal.9.2/.planning/PROJECT.md` - Current milestone definition
- `/Users/luka.s/Mandanten-Portal.9.2/server/controllers/webhookController.js` - Extraction result schema
- `/Users/luka.s/Mandanten-Portal.9.2/server/models/Client.js` - Document and creditor schemas

**Gemini capabilities:**
- Training data on Gemini API (January 2025 knowledge cutoff)
- Gemini 2.5 Pro PDF input: `Part.from_data(pdf_bytes, "application/pdf")`
- 1M input token limit confirmed in PROJECT.md

**Confidence level:** MEDIUM
- Gemini PDF support: HIGH (API documented in training data)
- Page boundary detection: MEDIUM (capability inferred, needs verification)
- Integration complexity: HIGH (existing codebase analyzed)

**Verification needed:**
- Official Gemini 2.5 Pro documentation for page-level extraction examples
- FastAPI Gemini SDK version to confirm Part.from_data signature
- Test PDF with multiple creditors to validate page grouping accuracy
