# Phase 9: Multi-Page Extraction - Research

**Researched:** 2026-02-09
**Domain:** Gemini 2.5 Pro multi-page PDF extraction with page-level creditor assignment
**Confidence:** HIGH

## Summary

Phase 9 builds on Phase 8's PDF support to extract multiple creditors from multi-page PDFs with correct page assignments. The existing codebase already has substantial multi-creditor infrastructure: the extraction prompt returns a `creditors` array, `process_documents_task` splits multi-creditor results into separate `DocumentResult` entries with `source_document_id`/`creditor_index`/`creditor_count`, and the Node.js webhook handler creates separate document entries linked to the source document.

The primary work is: (1) modify the extraction prompt to include page assignment data for each creditor, (2) add page assignment fields to the data models, (3) handle the "0 creditors from PDF" error case, and (4) ensure webhook results use the identical data structure already established for multi-creditor image extraction. The existing splitting logic in `process_documents_task` (processing.py lines 226-348) already handles the multi-creditor-to-separate-results conversion. The webhook handler (webhookController.js lines 479-528) already creates separate document entries from `source_document_id` results.

The key decision from CONTEXT.md is to use a single Gemini call returning all creditors at once (JSON array), rather than per-creditor extraction calls. This is the right approach: Gemini 2.5 Pro processes the entire PDF natively and can identify page boundaries in a single pass.

**Primary recommendation:** Extend the extraction prompt with PDF-specific instructions for page assignment, add `pages` field to the creditor JSON response schema, add the field to `CreditorData` model, and wire it through to the webhook results. Use a single Gemini call with all-at-once JSON array response.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Vertex AI SDK** (`vertexai`) | Current (existing) | Gemini 2.5 Pro API access | Already used for extraction; native PDF support via Part.from_data |
| **Pydantic** | v2 (existing) | Data model validation | Already used for CreditorData, ExtractedData, DocumentResult |
| **pypdf** | 5.x (existing) | PDF validation (added in Phase 8) | Already installed; provides page_count for prompt context |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **json** | stdlib | Parse Gemini JSON responses | Already used in `_parse_json_response()` |
| **uuid** | stdlib | Generate creditor document IDs | Already used in multi-creditor splitting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single-call JSON array | Per-creditor extraction calls | Per-creditor uses N API calls instead of 1; loses inter-creditor context; much slower |
| Prompt-based page assignment | Gemini response_schema enforcement | response_schema uses Vertex AI GenerationConfig; existing code uses prompt-based JSON; would require changing `generate_content_with_retry_sync` call pattern throughout |
| Prompt-based JSON | Vertex AI structured output (response_schema) | Could enforce JSON schema via API, but existing code successfully uses prompt-based JSON with `_parse_json_response()`; changing would be a larger refactor beyond scope |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed from Phase 8
```

## Architecture Patterns

### Recommended Project Structure
```
fastapi_service/
  app/
    services/
      document_processor.py   # MODIFY: extraction prompt + page assignment logic
    models.py                 # MODIFY: add pages field to CreditorData
    routers/
      processing.py           # MODIFY: wire page data through multi-creditor split

server/ (Node.js)
  controllers/
    webhookController.js      # VERIFY: page data passes through (no changes expected)
```

### Pattern 1: Single-Call All-Creditors Extraction with Page Assignment
**What:** Send entire PDF to Gemini once, get back JSON array of all creditors with page assignments.
**When to use:** Processing any PDF document (single or multi-creditor).
**Why:** Gemini processes the entire PDF natively. It can see all pages simultaneously and determine which pages belong to which creditor. A single call is cheaper, faster, and has better context than multiple calls.

**Example prompt addition for PDFs:**
```python
# Source: Existing extraction prompt + PDF-specific extension
pdf_instruction = """
**MEHRSEITIGE PDF-DOKUMENTE:**
Dieses Dokument ist ein PDF mit {page_count} Seiten.

Für JEDEN erkannten Gläubiger gib zusätzlich an, auf welchen Seiten dessen Informationen zu finden sind:
- "Seiten": [1, 2, 3] -- Liste der Seitennummern (1-basiert)

Beachte:
- Ein Gläubigerbrief kann sich über MEHRERE Seiten erstrecken (z.B. 3-seitige Forderungsaufstellung)
- Mehrere Gläubigerbriefe können in einem Sammel-Scan zusammengefasst sein
- Seiten die zu keinem Gläubiger gehören (Deckblätter, leere Seiten, Trennblätter) einfach weglassen
- Wenn du dir bei einer Seite unsicher bist, ordne sie NICHT zu

Beispiel für einen 8-seitigen PDF mit 3 Gläubigern:
"creditors": [
  {"Gläubiger_Name": "Bank A", "Seiten": [1, 2], ...},
  {"Gläubiger_Name": "Inkasso B", "Seiten": [3], ...},
  {"Gläubiger_Name": "Versicherung C", "Seiten": [5, 6, 7], ...}
]
(Seiten 4 und 8 gehören zu keinem Gläubiger -- einfach weglassen)
"""
```

### Pattern 2: Conditional Prompt Extension (MIME-Type Driven)
**What:** Only add PDF-specific page assignment instructions when processing PDFs. Images use the existing prompt unchanged.
**When to use:** The `extract_data()` method, based on file type detection.
**Why:** Single-page images do not need page assignment. Adding PDF instructions to image processing would waste tokens and confuse the model.

**Example:**
```python
def extract_data(self, image_path: str, mime_type: str = None) -> ExtractedData:
    # ... existing prompt setup ...

    # Add PDF-specific instructions if processing a PDF
    is_pdf = (os.path.splitext(image_path)[1].lower() == '.pdf' or
              mime_type == 'application/pdf')

    if is_pdf:
        page_count = self._get_pdf_page_count(image_path)
        prompt += pdf_page_assignment_instructions.format(page_count=page_count)
        # Also update the JSON format example to include "Seiten" field
```

### Pattern 3: Page Count as Prompt Context
**What:** Pass the PDF page count to the extraction prompt so Gemini knows how many pages to expect.
**When to use:** Always when processing PDFs.
**Why:** Telling Gemini "this PDF has N pages" helps it understand the scope of the document. The page count is already available from `_validate_pdf()` in Phase 8 -- just need to pass it through.

**Example:**
```python
# _validate_pdf already returns page_count
page_count = self._validate_pdf(file_bytes)  # Returns int

# Or get it separately without re-validation
def _get_pdf_page_count(self, pdf_path: str) -> int:
    with open(pdf_path, 'rb') as f:
        reader = PdfReader(BytesIO(f.read()))
        return len(reader.pages)
```

### Pattern 4: Error on Zero Creditors from PDF
**What:** If Gemini returns 0 creditors from a PDF, return an error to the caller.
**When to use:** After extraction, before splitting.
**Why:** Per CONTEXT.md decision -- if Gemini finds 0 creditors in a PDF, the PDF probably does not contain creditor letters and should be flagged.

**Example:**
```python
# In process_document(), after extract_data() for PDFs:
if is_pdf and extracted_data.is_creditor_document and len(extracted_data.creditors) == 0:
    result.processing_status = "error"
    result.processing_error = "No creditors found in PDF document"
    result.document_status = "needs_review"
    return result
```

### Anti-Patterns to Avoid
- **Splitting PDF into individual page images before Gemini:** Destroys multi-page creditor context. A 3-page Forderungsaufstellung would become 3 separate unrelated pages.
- **Making separate Gemini calls per creditor:** Wastes API calls, loses context, slower. One call with all creditors in JSON array is better.
- **Using physical page splitting (pypdf):** Only extract data + page assignments. Do NOT create separate PDF files per creditor (locked decision from PROJECT.md).
- **Adding page data to image extraction:** Page assignment only makes sense for multi-page PDFs. Single images are always page 1. Don't add unnecessary fields.
- **Trusting Gemini's creditor count blindly without error handling:** Always check for empty creditor arrays and handle gracefully.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-creditor splitting | Custom splitting logic | Existing `process_documents_task` splitting (processing.py:226-348) | Already creates separate DocumentResult per creditor with source_document_id, creditor_index, creditor_count |
| Webhook result structure | Custom webhook format for PDFs | Existing webhook payload structure with source_document_id | COMPAT-02 requires identical structure to image extraction |
| PDF page counting | Read PDF bytes to count pages | `pypdf.PdfReader` already installed | Phase 8 added pypdf; `_validate_pdf()` already returns page count |
| Source document tracking | Custom parent-child document linking | Existing source_document_id pattern in webhookController.js | Lines 479-528 already handle source_document_id-based document creation |
| Deduplication | Custom dedup for PDF creditors | Existing `CreditorDeduplicator.aggregate_creditors()` + `deduplicate_with_llm()` | Already processes multi-creditor split results |
| JSON response parsing | Custom JSON parser for Gemini | Existing `_parse_json_response()` | Handles markdown code blocks, strips formatting |

**Key insight:** The multi-creditor infrastructure is already built. Phase 9 is primarily a prompt engineering + data model extension task. The existing splitting, webhook, and deduplication logic handles multi-creditor results regardless of whether they came from images or PDFs.

## Common Pitfalls

### Pitfall 1: Page Numbers Off-By-One
**What goes wrong:** Gemini returns 0-based page numbers but the system expects 1-based (or vice versa).
**Why it happens:** Different systems use different page numbering conventions. pypdf uses 0-based indexing; humans use 1-based.
**How to avoid:** Explicitly instruct Gemini to use 1-based page numbers in the prompt ("Seitennummern 1-basiert, Seite 1 ist die erste Seite"). Validate that returned page numbers are in range [1, page_count].
**Warning signs:** Page 0 appearing in results; last page never assigned; off-by-one errors in page display.

### Pitfall 2: Gemini Returns Invalid Page Numbers
**What goes wrong:** Gemini returns page numbers that exceed the actual page count or are negative.
**Why it happens:** LLM hallucination. Gemini might infer pages that don't exist or confuse page references within the document text with actual PDF page numbers.
**How to avoid:** Validate all page numbers against the known page_count after extraction. Clamp or filter invalid pages. Log warnings but don't fail.
**Warning signs:** Page numbers > page_count in results; negative page numbers.

### Pitfall 3: Breaking Existing Image Extraction
**What goes wrong:** Adding PDF-specific prompt text to the extraction prompt changes behavior for single-image documents.
**Why it happens:** The extraction prompt is shared between images and PDFs. Adding page assignment instructions unconditionally confuses the model when processing images.
**How to avoid:** Only append PDF-specific instructions when `is_pdf` is True. Keep the base prompt identical for images. Test image extraction after changes.
**Warning signs:** Image extraction starts returning empty "Seiten" arrays or changes in creditor detection accuracy.

### Pitfall 4: Gemini Returns Non-Array "Seiten" Values
**What goes wrong:** Gemini returns "Seiten": "1-3" or "Seiten": 1 instead of "Seiten": [1, 2, 3].
**Why it happens:** LLM output variability. Even with clear JSON format instructions, Gemini might use ranges or single values.
**How to avoid:** Add explicit examples in the prompt showing array format. Validate and normalize in code: if string, parse ranges; if int, wrap in array. Use defensive parsing.
**Warning signs:** Type errors when processing page data; inconsistent page format in webhook results.

### Pitfall 5: Empty Creditors Array From PDF
**What goes wrong:** Gemini processes a multi-page PDF but returns 0 creditors, either because it's confused by the mixed content or fails to identify creditor letters.
**Why it happens:** PDFs with cover sheets, blank pages, or non-creditor content can confuse the model. Large PDFs may exceed practical extraction limits.
**How to avoid:** Per CONTEXT.md decision: return error if 0 creditors found. Log the page count and prompt for debugging. Consider the page count -- very large PDFs (>30 pages) may need special handling.
**Warning signs:** PDF processing returns "completed" with 0 results; users report "PDF processed but no creditors found."

### Pitfall 6: Rate Limiting on Large PDF Extraction
**What goes wrong:** Extracting from a large PDF uses many tokens, and subsequent API calls in the pipeline (classification, verification) hit rate limits.
**Why it happens:** A 50-page PDF at ~258 tokens/page = ~12,900 tokens for the document alone, plus prompt tokens. This is a significantly larger request than single images.
**How to avoid:** The rate limiter is already in place (`generate_content_with_retry_sync`). For very large PDFs, consider skipping the verification step (which re-sends the PDF) to save one API call. The extraction model (gemini-2.5-pro) has higher token limits than the classification model (gemini-2.0-flash).
**Warning signs:** 429 errors increasing after PDF support launch; processing time spikes for large PDFs.

### Pitfall 7: Multi-Page Single Creditor Not Recognized
**What goes wrong:** A creditor letter spanning 3 pages is split into 3 separate creditors instead of being recognized as one.
**Why it happens:** Without explicit guidance, Gemini might treat each page as a separate document.
**How to avoid:** Include explicit guidance in the prompt about multi-page single creditor patterns (e.g., "Ein Gläubigerbrief kann sich uber mehrere Seiten erstrecken -- z.B. eine 3-seitige Forderungsaufstellung ist EIN Gläubiger, nicht drei"). Provide an example in the prompt.
**Warning signs:** Creditor count inflated; same creditor name appearing multiple times with sequential single-page assignments.

## Code Examples

Verified patterns from the existing codebase:

### Current Extraction Prompt Structure (document_processor.py:375-519)
The existing prompt already returns a `creditors` JSON array. The modification adds a `Seiten` field:
```python
# Current format (already in codebase):
{
  "is_actually_creditor_document": true,
  "contains_multiple_creditors": true,
  "creditors": [
    {
      "Gläubiger_Name": "Bank A",
      "Aktenzeichen": "AZ-123",
      # ... existing fields ...
    }
  ]
}

# Extended format for PDFs (add "Seiten" field):
{
  "is_actually_creditor_document": true,
  "contains_multiple_creditors": true,
  "creditors": [
    {
      "Gläubiger_Name": "Bank A",
      "Aktenzeichen": "AZ-123",
      "Seiten": [1, 2],
      # ... existing fields ...
    }
  ]
}
```

### Current Multi-Creditor Split Logic (processing.py:226-348)
The splitting already creates separate DocumentResult entries. Page data is wired through `extracted_data`:
```python
# Existing pattern (processing.py):
if (result.extracted_data and
    result.extracted_data.contains_multiple_creditors and
    result.extracted_data.creditors and
    len(result.extracted_data.creditors) > 1):

    source_doc_id = result.id
    creditor_count = len(result.extracted_data.creditors)

    for idx, creditor in enumerate(result.extracted_data.creditors, start=1):
        creditor_result = DocumentResult(
            id=creditor_doc_id,
            source_document_id=source_doc_id,
            creditor_index=idx,
            creditor_count=creditor_count,
            # ... page data would flow through creditor_extracted_data
        )
```

### Current Webhook Handler (webhookController.js:479-528)
The webhook handler already creates separate entries for source_document_id results:
```javascript
// Existing pattern (webhookController.js):
if (docResult.source_document_id) {
    const sourceDoc = clientDoc.documents.find((d) => d.id === docResult.source_document_id);
    if (sourceDoc) {
        const displayName = `${sourceDoc.name} - Gläubiger ${docResult.creditor_index}/${docResult.creditor_count}: ${creditorName}`;
        const newCreditorEntry = {
            id: docResult.id,
            source_document_id: docResult.source_document_id,
            creditor_index: docResult.creditor_index,
            creditor_count: docResult.creditor_count,
            // ... page data would be in extracted_data
        };
        clientDoc.documents.push(newCreditorEntry);
    }
}
```

### Adding Page Data to CreditorData Model
```python
# In models.py -- extend CreditorData:
class CreditorData(BaseModel):
    # ... existing fields ...

    # Page assignment (PDF multi-page extraction)
    pages: List[int] = Field(
        default_factory=list,
        description="1-based page numbers where this creditor's info appears"
    )
```

### Parsing Page Data from Gemini Response
```python
# In document_processor.py extract_data():
# After parsing each creditor from Gemini's response:
raw_pages = cred.get("Seiten", [])

# Normalize page data
pages = []
if isinstance(raw_pages, list):
    pages = [int(p) for p in raw_pages if isinstance(p, (int, float)) and 1 <= int(p) <= page_count]
elif isinstance(raw_pages, int):
    pages = [raw_pages] if 1 <= raw_pages <= page_count else []
elif isinstance(raw_pages, str):
    # Handle range strings like "1-3"
    try:
        parts = raw_pages.split("-")
        if len(parts) == 2:
            start, end = int(parts[0]), int(parts[1])
            pages = list(range(start, end + 1))
    except ValueError:
        pages = []

# Pass to CreditorData
creditor_data = CreditorData(
    # ... existing fields ...
    pages=pages,
)
```

### Passing Page Count to Extract Method
```python
# extract_data needs page_count for PDF prompt and validation:
def extract_data(self, image_path: str, page_count: int = None) -> ExtractedData:
    # ... existing code ...

    is_pdf = os.path.splitext(image_path)[1].lower() == '.pdf'

    if is_pdf and page_count:
        prompt += self._get_pdf_extraction_instructions(page_count)

    # ... rest of extraction ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pre-split PDF pages then extract per page | Send whole PDF to Gemini, extract all at once | Gemini 2.0+ (2024) | Simpler, faster, better context for multi-page creditors |
| Separate classification + extraction calls | Classification already done; extraction does double-duty for creditor detection | Existing codebase | `is_actually_creditor_document` in extraction overrides classification |
| response_schema via GenerationConfig | Prompt-based JSON (existing pattern) | N/A (design choice) | Existing code uses prompt-based JSON successfully; response_schema is available but would require refactoring |
| vertexai.generative_models SDK | google-genai SDK (new) | June 2025 deprecation announced | vertexai.generative_models deprecated June 2025, removal June 2026; migration not in scope for this phase but noted |

**Deprecated/outdated:**
- **vertexai.generative_models:** Officially deprecated since June 2025, to be removed June 2026. Current codebase still uses it. Migration to `google-genai` SDK is a separate concern, not part of Phase 9.
- **Per-page PDF processing:** Sending individual pages to Gemini was necessary before native PDF support. Now obsolete with Gemini 2.0+ native PDF handling.

## Open Questions

Things that could not be fully resolved:

1. **Gemini's page assignment accuracy**
   - What we know: Gemini 2.5 Pro can process PDFs natively with page-level understanding. The documentation confirms it "understands both text and image contents inside documents."
   - What's unclear: How reliably Gemini identifies page boundaries between creditor letters in practice. No benchmarks or accuracy data available.
   - Recommendation: Test with real Sammel-Scan PDFs during implementation. If page assignment is unreliable, keep the feature but treat it as best-effort metadata rather than authoritative.

2. **Optimal prompt length for page assignment instructions**
   - What we know: Each PDF page costs ~258 tokens. The extraction prompt is already ~800 tokens. Adding page assignment instructions adds ~200 more tokens.
   - What's unclear: Whether the additional prompt tokens meaningfully reduce extraction accuracy for very large PDFs approaching token limits.
   - Recommendation: Keep PDF-specific instructions concise. For a 50-page PDF: 50*258 = 12,900 tokens (document) + ~1,000 tokens (prompt) = ~14,000 tokens total, well within Gemini 2.5 Pro's 1M token limit.

3. **Verification step for PDFs -- worth the extra API call?**
   - What we know: The current pipeline sends the document to Gemini 4 times (classification, rotation, extraction, verification). For PDFs, rotation is skipped (Phase 8), leaving 3 calls. Each PDF call is token-expensive.
   - What's unclear: Whether verification adds sufficient value for PDFs to justify the extra API call and token cost.
   - Recommendation: Keep verification for now (consistency with image pipeline). Consider skipping for PDFs if rate limiting becomes a problem. This is an optimization, not a Phase 9 concern.

4. **Whether to pass page_count from _validate_pdf through to extract_data**
   - What we know: `_validate_pdf()` returns page_count. `extract_data()` currently doesn't know the page count. For the prompt, we need to tell Gemini how many pages the PDF has.
   - What's unclear: The cleanest way to thread page_count through without changing many function signatures.
   - Recommendation: Add page_count parameter to `extract_data()` (optional, default None). Compute it in `process_document()` where `is_pdf` is already determined, before calling `extract_data()`. Alternatively, re-read it inside `extract_data()` from the file when `is_pdf` is true.

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis** (highest confidence):
  - `/tmp/creditor-fastapi/app/services/document_processor.py` -- Current extraction prompt, multi-creditor JSON format, PDF validation
  - `/tmp/creditor-fastapi/app/models.py` -- CreditorData, ExtractedData, DocumentResult models
  - `/tmp/creditor-fastapi/app/routers/processing.py` -- Multi-creditor splitting logic
  - `/Users/luka.s/Mandanten-Portal.9.2/server/controllers/webhookController.js` -- Webhook handler with source_document_id pattern
  - `/tmp/creditor-fastapi/app/config.py` -- Model configuration (gemini-2.5-pro for extraction)
- **Phase 8 research and plans** -- `08-RESEARCH.md`, `08-01-PLAN.md`, `08-02-PLAN.md`
- [Google Gemini API Document Processing](https://ai.google.dev/gemini-api/docs/document-processing) -- Official docs: PDF limits (50MB/1000 pages), ~258 tokens/page, native vision processing
- [Vertex AI Structured Output](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output) -- Structured output via GenerationConfig response_schema

### Secondary (MEDIUM confidence)
- [From PDFs to Insights: Structured Outputs from PDFs with Gemini 2.0](https://www.philschmid.de/gemini-pdf-to-data) -- Pydantic model approach for PDF extraction, nested list pattern for multiple entities
- [Gemini Structured Data Extraction Example](https://geminibyexample.com/018-structured-data-extraction/) -- Part.from_bytes with PDF, temperature=0.0 for consistency
- [Gemini PDF Reading: formats, limits, structured outputs](https://www.datastudios.org/post/google-gemini-pdf-reading-formats-limits-structured-outputs-and-workspace-integration) -- Community findings on PDF processing limits

### Tertiary (LOW confidence)
- WebSearch results on Gemini page-level extraction (2026) -- No official documentation found on explicit page-number extraction from Gemini API. Page assignment relies on prompt engineering, not a built-in API feature.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies; all tools already in codebase from Phase 8
- Architecture: HIGH -- Multi-creditor splitting, webhook handling, and deduplication already exist. Phase 9 extends them with page data.
- Pitfalls: HIGH -- Based on codebase analysis and understanding of LLM output variability
- Prompt engineering: MEDIUM -- Page assignment via prompting is standard practice, but accuracy with real German legal PDFs unverified
- Vertex AI SDK deprecation: HIGH -- Confirmed deprecated June 2025, removal June 2026 (from official docs)

**Research date:** 2026-02-09
**Valid until:** 30 days (until 2026-03-11) -- Codebase patterns stable; Gemini API stable; prompt engineering approach unlikely to change
