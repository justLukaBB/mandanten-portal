# Project Research Summary

**Project:** Multi-Page PDF Support for Creditor Extraction
**Domain:** Document AI / Multi-modal Processing with Gemini
**Researched:** 2026-02-09
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project extends an existing image-based creditor extraction system to support multi-page PDFs. Research confirms that Gemini 2.5 Pro natively processes PDFs through its multimodal API without requiring conversion libraries or page splitting. The architecture is well-designed for this extension—the existing two-service architecture (Node.js + FastAPI) already handles multi-creditor splitting, deduplication, and webhook-based results processing. The critical change is a single function in FastAPI that needs to accept PDF MIME types.

The recommended approach is to leverage Gemini's native PDF capabilities by passing entire PDFs directly to the API via `Part.from_data(pdf_bytes, mime_type='application/pdf')`. The prompt must be enhanced to instruct Gemini to identify page boundaries and return page assignments as structured arrays. This preserves backward compatibility with the existing image-processing flow while extending it to handle three PDF scenarios: multi-page single creditor letters, sammel-scans (multiple creditor letters in one PDF), and mixed documents.

Key risks center on integration rather than technology: the system has existing multi-creditor logic (`creditor_index`, `creditor_count`, `source_document_id`) that must remain intact. The most critical pitfall is silent backward compatibility breach where PDF processing inadvertently breaks image uploads. Secondary risks include page-to-creditor assignment ambiguity, token limit miscalculation for large PDFs, and rate limiting cascade. All are mitigatable through dual-path testing, explicit prompt schemas, conservative token limits, and page count validation.

## Key Findings

### Recommended Stack

**No new dependencies required for MVP.** Gemini 2.5 Pro via Vertex AI SDK already supports native PDF processing through the same API pattern used for images. The existing FastAPI integration uses `Part.from_data()` which accepts `application/pdf` MIME types alongside image MIME types.

**Core technologies:**
- **Vertex AI SDK (existing)**: Native PDF processing — Gemini 2.5 Pro handles multi-page PDFs without preprocessing, OCR, or conversion libraries
- **No additional libraries needed**: PDF extraction/conversion — Eliminates complexity, maintenance burden, and quality loss from image conversion
- **Same API pattern**: `Part.from_data(pdf_bytes, mime_type='application/pdf')` — Identical to current image handling, just different MIME type

**Alternative stack explicitly NOT recommended:**
- `pypdf`, `pdf2image`, `poppler-utils` — Only if Gemini API proves insufficient (which is unlikely based on documented capabilities)
- These add complexity without proven benefit and risk image quality degradation

**Critical version constraint:**
- Gemini 2.5 Pro required for 1M token context window and reliable PDF processing
- Token costs: ~$0.005 per PDF page (5x-10x current per-image cost for multi-page docs)
- Context limit: 1M input tokens = ~100-200 PDF pages theoretical, recommend limiting to 50 pages practical

### Expected Features

**Must have (table stakes):**
- **Native PDF input** — PDFs are standard document format; users expect direct upload
- **Multi-creditor detection in single PDF** — Sammel-scans (bulk scans) are common in insolvency workflows; existing system already does this for images
- **Page range assignment per creditor** — Users need to know which pages belong to which creditor; return `pages: [1,2,3]` for each creditor
- **Multi-page single creditor handling** — Creditor letters often span 2-3 pages; prompt must group consecutive pages
- **Backward compatibility with single images** — Existing upload flow cannot break; same webhook schema, same result structure
- **Extraction result schema consistency** — Node.js webhook expects `results[]` array; must include `pages` field without changing other fields
- **Error handling for corrupted PDFs** — Return `processing_status: 'error'` with reason, same as current image error flow

**Should have (competitive):**
- **Intelligent page boundary detection** — Automatically detect where one letter ends and another begins based on letterheads, signatures, greetings
- **Mixed document type detection** — Handle PDFs containing both creditor letters and non-creditor documents (invoices, contracts) using existing `is_creditor_document` classification
- **Confidence scoring per page group** — Extend existing `confidence` field to work per-creditor in multi-creditor PDFs

**Defer (v2+):**
- OCR quality assessment and flagging
- Table extraction from multi-page invoices
- Page orientation auto-correction (Gemini likely handles this natively)
- PDF thumbnail generation for previews

**Explicit anti-features (DO NOT BUILD):**
- Physical PDF page splitting into separate files — Adds storage complexity; page assignments as metadata suffice
- Pre-processing PDF to images before Gemini — Wastes tokens, loses native text extraction, slower
- Separate upload flow for PDFs vs images — Confusing UX; single endpoint with MIME type routing

### Architecture Approach

The existing two-service architecture supports PDF processing with minimal changes. The system already handles the complete flow: upload → GCS storage → queue → FastAPI processing → Gemini extraction → webhook → MongoDB persistence. All layers except one are MIME-agnostic and pass-through.

**Major components:**
1. **Node.js Upload Handler** — Already accepts PDFs, validates MIME types, uses multer memory storage (no changes needed)
2. **GCS Service** — Stores PDFs identically to images, generates signed URLs (no changes needed)
3. **Document Queue** — Passes `mime_type` field to FastAPI (no changes needed)
4. **FastAPI Document Processor** — **CHANGE REQUIRED**: `_load_image_as_part()` must accept PDF MIME type and create `genai.Part` with PDF bytes
5. **Processing Pipeline** — Orchestrates classification → extraction → verification; format-agnostic (no changes needed)
6. **Webhook Handler** — Already handles multi-creditor splits via `creditor_index`, `creditor_count`, `source_document_id` (no changes needed)

**Key pattern:** MIME-type-driven processing. Route logic based on `mime_type` field, not file extensions or content sniffing. This field is captured at upload, validated by multer, stored in DB, and passed through all layers.

**Critical integration point:** Single function change in FastAPI:
```python
def _load_image_as_part(file_data):
    mime_type = file_data['mime_type']
    file_bytes = download_file(file_data['gcs_path'])

    if mime_type == 'application/pdf':
        return genai.Part.from_data(data=file_bytes, mime_type='application/pdf')
    elif mime_type in IMAGE_MIME_TYPES:
        return genai.Part.from_data(data=file_bytes, mime_type=mime_type)
    else:
        raise UnsupportedFormatError(mime_type)
```

**Blast radius:** 1 function in FastAPI. Everything else is pass-through or already format-agnostic.

### Critical Pitfalls

1. **Backward Compatibility Breach** — PDF processing changes break existing single-image upload flow. Happens when shared code paths diverge, return structures change, or testing focuses only on PDFs. **Prevention:** Dual-path testing (every change tested with images AND PDFs), feature flags, explicit MIME type routing, structure compatibility (PDF results must produce identical fields as images plus optional page data).

2. **Page-to-Creditor Assignment Ambiguity** — Gemini extracts creditors correctly but page assignments are unreliable (strings vs arrays, 0-indexed vs 1-indexed, empty arrays). **Prevention:** Explicit format specification in prompt with example JSON structure, 1-indexed convention (matches PDF viewers), array requirement (no string ranges), schema validation before webhook handler, test with edge cases (1-page PDFs, single creditor spanning all pages, non-sequential pages).

3. **Token Limit Miscalculation** — Large PDFs fail unpredictably despite being "under" 1M token limit. Problem: page count ≠ token count (scanned PDFs with images = 4x-16x tokens per page), and output token limit (8K) can be hit before input limit with 50+ creditor extractions. **Prevention:** Conservative limits (500K tokens = 50% of max), token estimation before processing, chunking strategy for >50 pages, output compression (minimal JSON, no explanations), page count limits (reject >100 pages at upload).

4. **Rate Limiting Cascade** — PDF processing (10-50x tokens per request) exhausts quota, blocking ALL document processing including images. **Prevention:** Separate queues (priority for images, background for PDFs), token-aware throttling, PDF page limit at upload validation, async processing notifications, quota reservation (20% reserved for images).

5. **Prompt Drift Between File Types** — PDF prompt diverges from image prompt over time, causing inconsistent extraction results for the same creditor letter. **Prevention:** Single prompt template with conditional insertion for PDF-specific fields, shared field schema, format-agnostic testing (same creditor as image AND PDF), prompt versioning in git.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core PDF Support (FastAPI MIME Type)
**Rationale:** Smallest change with highest risk—if this breaks images, everything downstream fails. Isolate and validate first.
**Delivers:** FastAPI accepts PDFs, creates Gemini Parts, processes end-to-end
**Addresses:** Native PDF input (table stakes), backward compatibility requirement
**Avoids:** Pitfall #1 (backward compatibility breach) through feature flag and dual testing
**Research flag:** NO deeper research needed—well-documented API pattern

### Phase 2: Prompt Engineering for Page Assignment
**Rationale:** Page-to-creditor mapping is the novel complexity. Prompt must specify exact output schema to avoid ambiguity.
**Delivers:** Gemini returns `pages: [int]` arrays per creditor with consistent 1-indexed format
**Addresses:** Page range assignment per creditor, multi-creditor detection, multi-page single creditor handling
**Avoids:** Pitfall #2 (page assignment ambiguity) through explicit schema in prompt, Pitfall #5 (prompt drift) through unified template
**Research flag:** YES—prompt engineering for page detection needs testing and iteration; suggest `/gsd:research-phase` with few-shot examples

### Phase 3: Response Schema Validation
**Rationale:** Validate Gemini output structure before passing to webhook handler to catch format issues early.
**Delivers:** Schema validation, page array normalization, default handling for edge cases
**Addresses:** Extraction result schema consistency
**Avoids:** Pitfall #2 (ambiguity) through validation, Pitfall #9 (empty page arrays) through defaults
**Research flag:** NO deeper research needed—standard Pydantic/JSON schema validation

### Phase 4: Integration Testing (Multi-Creditor & Backward Compat)
**Rationale:** Validate end-to-end flow works for PDFs without breaking images. Test with real-world messy documents.
**Delivers:** Test suite covering: single image, single PDF, multi-page single creditor, sammel-scan PDF, mixed uploads, scanned PDFs
**Addresses:** All table stakes features, backward compatibility validation
**Avoids:** Pitfall #1 (compat breach) through explicit dual testing, Pitfall #7 (rendering assumption) through scanned PDF tests
**Research flag:** NO deeper research needed—testing patterns

### Phase 5: Error Handling & Limits
**Rationale:** Production-ready handling for edge cases (large PDFs, corrupted files, rate limits).
**Delivers:** Page count validation, file size limits, timeout adjustments, graceful error responses
**Addresses:** Error handling for corrupted PDFs, token limit safety
**Avoids:** Pitfall #3 (token limits) through conservative limits, Pitfall #4 (rate cascade) through upload validation
**Research flag:** NO deeper research needed—standard error handling patterns

### Phase 6: Edge Cases & Polish
**Rationale:** Handle low-probability scenarios discovered during testing.
**Delivers:** Handling for 100+ page PDFs, MIME type edge cases, logging improvements
**Addresses:** Production readiness
**Avoids:** Pitfall #10 (logging inadequacy) through structured logs with page metadata
**Research flag:** NO deeper research needed—reactive to findings from Phase 4

### Phase Ordering Rationale

- **Phase 1 first** because it's the highest-risk change (single point of failure, touches integration layer)
- **Phase 2 before Phase 3** because prompt design determines what schema to validate
- **Phase 4 after Phases 1-3** because integration tests need working PDF processing + prompt + validation
- **Phase 5 before Phase 6** because error handling is higher priority than edge cases
- Architecture naturally isolates PDF changes from image processing (same code paths, MIME type routing)
- Existing multi-creditor splitting logic means no new components needed—just extending existing patterns

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Prompt Engineering):** Complex—requires understanding how Gemini interprets page boundaries, needs few-shot examples for sammel-scans, must iterate on output schema. Suggest `/gsd:research-phase` focused on "Gemini multi-page PDF page boundary detection prompts" with test documents.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Well-documented Vertex AI SDK API pattern (`Part.from_data`)
- **Phase 3:** Standard schema validation (Pydantic)
- **Phase 4:** Standard integration testing patterns
- **Phase 5:** Standard error handling (timeouts, validation, retries)
- **Phase 6:** Reactive to findings, no pre-research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **MEDIUM-HIGH** | Gemini 2.5 Pro PDF support confirmed in Jan 2025 training data; API pattern well-documented; pricing may have changed by Feb 2026 |
| Features | **HIGH** | Table stakes based on existing system analysis; existing multi-creditor logic well-understood from codebase |
| Architecture | **HIGH** | Codebase analysis confirms all integration points; single-function change with clear boundaries |
| Pitfalls | **HIGH** | Integration pitfalls based on code analysis (existing multi-creditor logic); Gemini behavior pitfalls based on LLM patterns |

**Overall confidence:** **MEDIUM-HIGH**

Confidence is high on architecture, features, and integration pitfalls (based on codebase analysis). Confidence is medium on Gemini API specifics (based on Jan 2025 training data, not verified with Feb 2026 current API docs).

### Gaps to Address

**Verification needed during implementation:**

1. **Gemini 2.5 Pro still supports native PDFs in Feb 2026** — Verify current Vertex AI documentation confirms `application/pdf` MIME type accepted by `Part.from_data()`. If API changed, may need fallback to pdf2image conversion.

2. **Token costs and pricing current as of Feb 2026** — Jan 2025 estimates may be outdated. Check Google Cloud Billing for actual PDF page costs; adjust budget forecasts.

3. **Page limits acceptable** — Unknown max pages before timeout/rejection. Test with 10, 20, 50, 100-page PDFs empirically. If limit < 20 pages, must implement splitting (scope increase).

4. **Processing times fit within timeouts** — Current FastAPI timeout: 20 minutes. Benchmark 10-page PDF processing time; increase timeout if needed.

5. **Gemini page numbering convention** — Assumed 1-indexed (page 1 = first page). Verify in prompt testing; if 0-indexed, adjust schema and prompt examples.

6. **Output token limits for large PDFs** — Assumed 8K output tokens based on training data. If 50 creditors × 150 tokens = 7.5K tokens, may hit output limit before input limit. Test with sammel-scan containing 30+ creditors.

**How to handle gaps:**
- All gaps addressable during Phase 1-2 implementation through testing with sample PDFs
- No architectural changes needed if gaps require adjustments—only prompt tuning or limits
- If Gemini native PDF support removed (unlikely), fallback to pdf2image pattern documented in STACK.md

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:**
  - `/Users/luka.s/Mandanten-Portal.9.2/server/middleware/upload.js` — Upload handling confirms PDF acceptance
  - `/Users/luka.s/Mandanten-Portal.9.2/server/utils/fastApiClient.js` — Integration pattern confirms MIME type passing
  - `/Users/luka.s/Mandanten-Portal.9.2/server/controllers/webhookController.js` — Multi-creditor logic confirms `creditor_index`/`creditor_count` handling
  - `/Users/luka.s/Mandanten-Portal.9.2/.planning/codebase/INTEGRATIONS.md` — Architecture documentation
  - `/Users/luka.s/Mandanten-Portal.9.2/.planning/PROJECT.md` — Current milestone definition

### Secondary (MEDIUM confidence)
- **Gemini 2.5 Pro capabilities** (January 2025 training data):
  - Native PDF processing via Vertex AI SDK
  - `Part.from_data()` API pattern for multimodal content
  - 1M input token context window
  - Pricing estimates (~$0.005 per PDF page)

### Tertiary (LOW confidence)
- **Gemini API limits** (not documented in training data, requires verification):
  - Maximum PDF page count before rejection
  - Output token limits for structured extraction (assumed 8K)
  - PDF tokenization behavior with embedded images
  - Processing time per page

**IMPORTANT:** This research is based on Jan 2025 training data. The Gemini API may have changed by Feb 2026. Verify native PDF support, MIME types, token limits, and pricing against current Vertex AI documentation before implementation.

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
