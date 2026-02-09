# Domain Pitfalls: Multi-Page PDF Processing with Gemini

**Domain:** Adding multi-page PDF support to existing image-based creditor extraction
**Researched:** 2026-02-09
**Confidence:** MEDIUM (based on Gemini API knowledge, system architecture analysis, and document extraction patterns)

## Executive Summary

Adding PDF processing to an existing image-only pipeline creates integration risks that don't exist in greenfield projects. The most critical pitfall is **silent feature regression** where PDF processing works but breaks existing image workflows. Second is **page-creditor assignment ambiguity** where Gemini correctly extracts data but fails to reliably map pages to creditors in sammel-scans. Third is **token limit miscalculation** where large PDFs fail unpredictably because page count ≠ token count for PDFs.

**Key insight:** The existing system has `creditor_index` and `creditor_count` fields designed for multi-creditor splitting. PDF implementation must produce these same fields or risk breaking downstream logic in payment handlers, document generators, and email services.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or breaking changes.

### Pitfall 1: Backward Compatibility Breach
**What goes wrong:** PDF processing changes break existing single-image upload flow

**Why it happens:**
- Shared code paths between image and PDF processing
- Changing return structure to accommodate page arrays
- Adding PDF-specific fields that images don't have
- Testing only PDFs during development

**Consequences:**
- Silent failures in production for image uploads
- `creditor_index`/`creditor_count` mismatch breaks payment routing
- Webhook handler crashes on unexpected data structure
- Email attachment generation fails for image-based creditors

**Prevention:**
1. **Dual-path testing:** Every change must be tested with both images AND PDFs
2. **Structure compatibility:** PDF results must produce identical fields as images plus optional page data
3. **Feature flags:** Deploy PDF support behind flag, verify images still work before enabling
4. **Explicit MIME type routing:** Separate code paths early in processing pipeline

**Detection warning signs:**
- Integration tests only use PDF fixtures
- Return structure has required fields for pages
- `geminiServiceAdapter.js` has conditional logic based on file type
- Webhook handler has `if (isPDF)` branches

**Which phases address this:**
- Phase 1 (MIME type support): Add PDF handling WITHOUT changing image flow
- Phase 2 (Prompt engineering): Test prompt works for BOTH images and PDFs
- Phase 4 (Integration testing): Verify backward compatibility explicitly

---

### Pitfall 2: Page-to-Creditor Assignment Ambiguity
**What goes wrong:** Gemini extracts creditors correctly but page assignments are unreliable or inconsistent

**Why it happens:**
- Prompt doesn't explicitly define page numbering (0-indexed vs 1-indexed)
- Multi-page single creditor letters confused with multi-creditor sammel-scans
- Gemini returns page ranges as strings ("1-3") instead of arrays
- Page breaks in middle of creditor data (address on page 1, details on page 2)
- Prompt asks for "pages" but doesn't specify format

**Consequences:**
- Creditor extracted correctly but assigned wrong pages
- Page splitting logic fails because format doesn't match expectations
- One creditor gets all pages, others get empty arrays
- Inconsistent results across similar documents (works for some PDFs, fails for others)

**Real-world example:**
```
PDF: 6 pages, 2 creditors
Creditor A: Pages 1-2 (letter spans 2 pages)
Creditor B: Pages 3-6 (3-page letter + 1-page attachment)

Bad prompt result:
[
  { name: "A", pages: "1-2" },        // String, not array
  { name: "B", pages: [3,4,5,6] }     // Inconsistent format
]

Expected result:
[
  { name: "A", pages: [1,2], page_range: "1-2" },
  { name: "B", pages: [3,4,5,6], page_range: "3-6" }
]
```

**Prevention:**
1. **Explicit format specification:** Prompt must show exact JSON structure with example
2. **1-indexed convention:** PDFs are 1-indexed (page 1 = first page), make this explicit
3. **Array requirement:** Pages must be array of integers, not string ranges
4. **Test with edge cases:** 1-page PDFs, single creditor spanning all pages, non-sequential pages
5. **Schema validation:** Validate Gemini response before passing to webhook handler

**Detection warning signs:**
- Prompt says "identify pages" but doesn't show format
- No validation of page array structure before using it
- Test fixtures only use clean 1-creditor-per-page PDFs
- No handling for `pages: null` or `pages: []`

**Which phases address this:**
- Phase 2 (Prompt engineering): Define exact output schema with examples
- Phase 3 (Response parsing): Validate and normalize page arrays
- Phase 4 (Integration testing): Test edge cases (1-page, multi-page single creditor, gaps)

---

### Pitfall 3: Token Limit Miscalculation
**What goes wrong:** Large PDFs fail unpredictably despite being "under" 1M token limit

**Why it happens:**
- Assuming token count = page count × average tokens per page
- Not accounting for embedded images in PDF (images tokenize differently)
- Not testing with real-world messy PDFs (scanned documents, mixed formats)
- Relying on Gemini 2.5 Pro's 1M input limit without safety margin
- Forgetting output token limits (8K for Gemini 2.5 Pro as of training cutoff)

**Consequences:**
- Processing fails for large sammel-scans (30+ creditor letters)
- No graceful degradation - entire document fails instead of partial processing
- Token limit errors don't provide actionable feedback
- Production failures during peak upload times with large batches

**Token math reality check:**
```
Assumption: 50-page PDF = ~50K tokens (WRONG)
Reality: 50-page scanned PDF with images = 200K-800K tokens depending on image quality

Gemini 2.5 Pro limits (as of training data):
- Input: 1M tokens
- Output: 8K tokens (this is the hidden constraint)

Problem:
- 50 creditors × 150 tokens per creditor = 7.5K output tokens
- Prompt asks for JSON array with all creditors
- Output limit hit before input limit
```

**Prevention:**
1. **Conservative limits:** Set internal limit to 500K tokens (50% of max) to account for variability
2. **Token estimation API:** Use Gemini's `count_tokens()` before processing (if available)
3. **Chunking strategy:** For PDFs >50 pages, process in chunks (e.g., 25 pages at a time)
4. **Output compression:** Minimize output format (no explanations, just data)
5. **Progressive extraction:** Extract creditor count first, then process in batches if count > threshold

**Detection warning signs:**
- No token counting before sending to Gemini
- No handling for "token limit exceeded" errors
- Test PDFs are all <10 pages
- Output schema includes verbose fields (explanations, reasoning, confidence narratives)
- No circuit breaker for very large PDFs

**Which phases address this:**
- Phase 1 (MIME type support): Add PDF page count check
- Phase 2 (Prompt engineering): Minimize output verbosity
- Phase 5 (Error handling): Handle token limit errors gracefully
- Phase 6 (Edge cases): Test with large PDFs (50+, 100+ pages)

---

### Pitfall 4: Rate Limiting Cascade
**What goes wrong:** PDF processing triggers rate limits that block ALL document processing (images + PDFs)

**Why it happens:**
- PDFs consume more tokens per request than images (10-50x)
- Existing rate limiter (30 RPM) designed for single-image requests
- No separate queue or throttling for PDF vs image
- Batch uploads of PDFs exhaust quota immediately
- Adaptive throttling doesn't account for token-based limits

**Consequences:**
- Agent uploads 5 large PDFs, blocks all processing for 2 minutes
- Image processing fails even though images are fast/cheap
- Priority creditors (manual review) stuck behind large PDF batch
- User experience degrades: "Why is my single image taking 5 minutes?"

**Rate limit math:**
```
Current: 30 RPM, ~500ms per image
Gemini 2.5 Pro limits (estimate): 1M tokens/minute

Scenario:
- 1 PDF (20 pages, 100K tokens) = 1/10 of per-minute quota
- 10 PDFs uploaded → quota exhausted in <1 minute
- Remaining 29 requests (images) queued for 1+ minutes
```

**Prevention:**
1. **Separate queues:** Priority queue for images, background queue for PDFs
2. **Token-aware throttling:** Track tokens consumed, not just request count
3. **PDF page limit:** Reject PDFs >100 pages at upload validation, not at processing
4. **Async processing notification:** Don't block UI for PDFs, show "processing..." status
5. **Quota reservation:** Reserve 20% of quota for images to prevent starvation

**Detection warning signs:**
- Single rate limiter for all requests
- No token accounting in adaptive throttling
- Upload validation accepts unlimited page count
- No separate processing queues

**Which phases address this:**
- Phase 1 (MIME type support): Add page count validation at upload
- Phase 3 (Response parsing): Implement token tracking
- Phase 5 (Error handling): Separate error handling for rate limits
- Future phase: Queue separation (likely out of scope for MVP)

---

## Moderate Pitfalls

Mistakes that cause delays, tech debt, or user friction.

### Pitfall 5: Prompt Drift Between File Types
**What goes wrong:** PDF prompt diverges from image prompt, causing inconsistent extraction results

**Why it happens:**
- Adding PDF-specific instructions creates separate prompt paths
- Testing PDF changes without re-validating images
- PDF prompt asks for pages, image prompt doesn't
- Over time, fixes applied to one path but not the other

**Consequences:**
- Same creditor letter extracts differently as image vs PDF
- Field names differ (PDF uses `creditor_name`, image uses `glaeubiger_name`)
- Confidence scoring inconsistent between formats
- Debugging confusion: "It works as PDF but fails as image"

**Prevention:**
1. **Single prompt template:** Use conditional insertion for PDF-specific fields
2. **Shared field schema:** Both paths must produce identical field structure
3. **Format-agnostic testing:** Test suite runs same creditor letter as image AND PDF
4. **Prompt versioning:** Track changes to both paths in version control

**Example safe pattern:**
```python
# Good: Single prompt with conditional section
prompt = f"""
Extract creditor information from this document.

{f"This is a multi-page PDF. Include 'pages' array showing which pages belong to this creditor (1-indexed)." if is_pdf else ""}

Return JSON with:
- creditor_name
- address
{"- pages: [array of integers]" if is_pdf else ""}
"""

# Bad: Separate prompts
if is_pdf:
    prompt = get_pdf_prompt()  # Diverges over time
else:
    prompt = get_image_prompt()
```

**Detection warning signs:**
- `if file_type == 'pdf'` branches in prompt construction
- Separate prompt files for PDF vs image
- Different field names in test assertions
- No cross-format test coverage

**Which phases address this:**
- Phase 2 (Prompt engineering): Design unified prompt with conditional sections
- Phase 4 (Integration testing): Cross-validate image vs PDF extraction

---

### Pitfall 6: Webhook Handler Assumes Single Document
**What goes wrong:** Existing webhook handler doesn't expect `creditor_index` and `creditor_count` from PDF processing

**Why it happens:**
- Current flow: 1 document upload = 1 creditor extraction
- PDF flow: 1 document upload = N creditor extractions
- Webhook handler has conditional logic for multi-creditor splits
- Logic tested with manual sammel-scan splitting, not AI-driven splitting

**Consequences:**
- First creditor processed correctly, remaining creditors lost
- `creditor_count` field exists but not consistently set
- Document links point to wrong pages
- Payment routing breaks for creditor #2+ because `creditor_index` > `creditor_count`

**Code analysis evidence:**
```javascript
// From webhookController.js:485-498
const displayName = `${sourceDoc.name} - Gläubiger ${docResult.creditor_index}/${docResult.creditor_count}: ${creditorName}`;

creditor_index: docResult.creditor_index,
creditor_count: docResult.creditor_count,

// Logic exists but may not be tested with AI-generated splits
```

**Prevention:**
1. **Validate existing logic:** Test webhook handler with mock multi-creditor PDF results
2. **Index validation:** Assert `creditor_index <= creditor_count` and `creditor_index >= 1`
3. **Document link mapping:** Ensure `document_links` includes page info for PDFs
4. **End-to-end test:** Upload PDF with 3 creditors, verify all 3 appear in database

**Detection warning signs:**
- No tests for `creditor_index > 1` scenarios
- `creditor_count` defaults to 1 if missing
- Document linking code doesn't use page arrays

**Which phases address this:**
- Phase 3 (Response parsing): Ensure FastAPI returns creditor_index/count
- Phase 4 (Integration testing): Test multi-creditor PDF end-to-end

---

### Pitfall 7: PDF Page Rendering Assumption
**What goes wrong:** Assuming Gemini "sees" PDFs the same way humans do

**Why it happens:**
- PDFs can have different internal structures (text layer, scanned image, mixed)
- Text-based PDFs extract cleanly, scanned PDFs may lose layout
- Gemini's PDF processing may not preserve visual page breaks
- Multi-column layouts can confuse reading order

**Consequences:**
- Creditor B's header read as part of Creditor A's address
- Page assignments correct but data extraction mixed
- Table-based creditor lists extract poorly
- Letterhead logos cause hallucination of company names

**Prevention:**
1. **Test with scanned PDFs:** Not just text-layer PDFs
2. **Visual validation:** Manually review 20+ extractions to spot patterns
3. **Prompt guidance:** Instruct Gemini about expected layout (letterhead, page breaks)
4. **Confidence thresholds:** Flag extractions with unusual layouts for review

**Detection warning signs:**
- Test PDFs all created from Word (clean text layer)
- No scanned/photographed document tests
- Prompt doesn't mention page breaks or layout

**Which phases address this:**
- Phase 2 (Prompt engineering): Add layout guidance
- Phase 4 (Integration testing): Include scanned PDFs in test suite
- Phase 6 (Edge cases): Test multi-column, table-based layouts

---

## Minor Pitfalls

Annoying issues that are fixable without major rework.

### Pitfall 8: MIME Type Detection Inconsistency
**What goes wrong:** File identified as PDF in Node.js but not in FastAPI, or vice versa

**Why it happens:**
- Node.js uses `path.extname()`, FastAPI expects `mime_type` field
- User uploads `document.PDF` (uppercase extension)
- User renames JPG to PDF
- Browser sends incorrect MIME type

**Prevention:**
- Validate MIME type server-side using magic bytes, not extension
- Normalize extensions to lowercase
- Reject files where MIME type and extension conflict

**Detection warning signs:**
- Only checking file extension
- No magic byte validation
- Test files all named correctly

**Which phases address this:**
- Phase 1 (MIME type support): Add robust MIME detection

---

### Pitfall 9: Empty Page Arrays
**What goes wrong:** Gemini returns creditor with `pages: []` or `pages: null`

**Why it happens:**
- Prompt doesn't make pages field required
- Gemini can't determine page boundaries
- Single-page PDF where page assignment is obvious (but not returned)

**Prevention:**
- Validate `pages` is non-empty array before processing
- Default to `[1]` for single-page PDFs if pages missing
- Schema validation catches this early

**Detection warning signs:**
- No null/empty checks on pages field
- Prompt says pages field is "optional"

**Which phases address this:**
- Phase 2 (Prompt engineering): Make pages field required
- Phase 3 (Response parsing): Validate and default

---

### Pitfall 10: Logging Inadequacy for Debugging
**What goes wrong:** Production PDF failures hard to debug because logs don't show page info

**Why it happens:**
- Existing logs designed for single-image processing
- Don't log page count, page ranges, or creditor-page assignments
- Large PDFs truncated in logs

**Prevention:**
- Log PDF metadata: page count, file size, token estimate
- Log creditor-page assignments for each extraction
- Log first/last page content for debugging layout issues

**Detection warning signs:**
- Logs only show filename, not page count
- No creditor-page mapping in logs

**Which phases address this:**
- Phase 3 (Response parsing): Add structured logging

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: MIME Type Support | Breaking image flow (Pitfall #1) | Feature flag, separate code path, dual testing |
| Phase 2: Prompt Engineering | Page format ambiguity (Pitfall #2) | Explicit schema, examples, validation |
| Phase 2: Prompt Engineering | Prompt drift (Pitfall #5) | Single template with conditionals |
| Phase 3: Response Parsing | Webhook incompatibility (Pitfall #6) | Validate existing handler with mock data first |
| Phase 3: Response Parsing | Empty pages arrays (Pitfall #9) | Schema validation, defaults |
| Phase 4: Integration Testing | Only testing clean PDFs (Pitfall #7) | Include scanned, multi-column, messy PDFs |
| Phase 5: Error Handling | Token limits (Pitfall #3) | Conservative limits, chunking strategy |
| Phase 5: Error Handling | Rate limiting (Pitfall #4) | Token tracking, page count limits |
| Phase 6: Edge Cases | All untested scenarios | Large PDFs, single-page, mixed quality |

---

## Testing Strategy to Prevent Pitfalls

### Must-Have Test Cases

1. **Backward compatibility suite:**
   - Single JPG upload (existing flow)
   - Sammel-scan PNG upload (existing multi-creditor image)
   - Run after every PDF change

2. **PDF edge cases:**
   - 1-page PDF, 1 creditor
   - 10-page PDF, 1 creditor (multi-page letter)
   - 6-page PDF, 2 creditors (3 pages each)
   - 50-page PDF, 20 creditors (stress test)
   - Scanned PDF (no text layer)
   - Mixed format PDF (some pages scanned, some text)

3. **Integration validation:**
   - Upload PDF → Verify webhook receives all creditors
   - Check `creditor_index` and `creditor_count` correct
   - Verify `document_links` includes page arrays
   - Confirm payment routing works for creditor #2+

4. **Error scenarios:**
   - 200-page PDF (exceeds reasonable limit)
   - Corrupted PDF
   - PDF with no creditor letters
   - Rate limit during batch upload

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Integration pitfalls | HIGH | Code analysis shows existing multi-creditor logic, clear integration points |
| Gemini PDF behavior | MEDIUM | Based on training data knowledge of Gemini 2.5 Pro, not verified with 2026 docs |
| Token limits | MEDIUM | 1M input known, but output limits and PDF tokenization behavior not verified |
| Rate limiting | MEDIUM | System uses 30 RPM adaptive throttling, but Gemini quotas not verified |
| Prompt engineering | HIGH | General LLM prompt patterns well-understood, specific to structured extraction |

**Verification needed:**
- Gemini 2.5 Pro output token limits (assumed 8K from training data)
- Current Gemini API rate limits and token quotas (as of 2026-02)
- PDF tokenization behavior with embedded images
- Gemini's page numbering convention (assumed 1-indexed, needs verification)

---

## Sources

**System Architecture Analysis:**
- `/Users/luka.s/Mandanten-Portal.9.2/.planning/PROJECT.md` - Current system context
- `/Users/luka.s/Mandanten-Portal.9.2/server/controllers/webhookController.js` - Multi-creditor handling logic
- `/Users/luka.s/Mandanten-Portal.9.2/server/services/geminiServiceAdapter.js` - Current image-only processing

**Knowledge Base:**
- Gemini 2.5 Pro API capabilities (training data, January 2025)
- Document extraction patterns (training data)
- Node.js error handling patterns (training data)

**Confidence Notes:**
- MEDIUM confidence areas require verification with official Gemini API documentation
- HIGH confidence areas based on code analysis and standard patterns
- Pitfalls #1, #6 are HIGH confidence (system architecture analysis)
- Pitfalls #2, #3, #4 are MEDIUM confidence (need API verification)
- All prevention strategies are actionable based on existing codebase patterns
