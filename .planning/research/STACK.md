# Technology Stack for Multi-Page PDF Processing

**Project:** Creditor Extraction System - PDF Support Milestone
**Researched:** 2026-02-09
**Confidence:** MEDIUM (based on Gemini training data from Jan 2025; API may have evolved)

## Executive Summary

Adding multi-page PDF support requires **minimal stack changes**. Gemini 2.5 Pro via Vertex AI supports native PDF processing without conversion libraries. The existing FastAPI integration pattern remains unchanged—only the file handling logic needs adjustment.

**Key Finding:** No new Python dependencies required. Gemini accepts PDFs directly through the same `Part.from_data()` method currently used for images.

---

## Recommended Stack Additions

### PDF Handling: Native Gemini Support (RECOMMENDED)

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| **Vertex AI SDK** | *existing* | Native PDF processing | Gemini 2.5 Pro handles PDFs natively—no preprocessing needed |
| **No additional libraries** | N/A | PDF extraction/conversion | Gemini's multimodal API processes PDF pages internally |

**Rationale:**
- Gemini 2.5 Pro's native PDF support eliminates need for `pypdf`, `pdf2image`, or conversion layers
- Reduces complexity, maintenance burden, and processing time
- Avoids lossy image conversion (OCR quality issues, file size bloat)
- Same API pattern as existing image processing: `Part.from_data(pdf_bytes, mime_type='application/pdf')`

**Current Implementation Pattern (Images):**
```python
# From fastApiClient.js analysis - FastAPI receives:
{
  "files": [
    {
      "filename": "creditor.jpg",
      "gcs_path": "gs://bucket/file.jpg",  # or signed URL
      "mime_type": "image/jpeg",
      "document_id": "..."
    }
  ]
}

# FastAPI likely does:
Part.from_data(image_bytes, mime_type='image/jpeg')
```

**For PDFs - Same Pattern:**
```python
# FastAPI receives:
{
  "files": [
    {
      "filename": "creditor.pdf",
      "gcs_path": "gs://bucket/file.pdf",  # or signed URL
      "mime_type": "application/pdf",
      "document_id": "..."
    }
  ]
}

# FastAPI does (identical API):
Part.from_data(pdf_bytes, mime_type='application/pdf')
```

**Integration Points:**
1. **Node.js Backend:** Already handles `mime_type` field—no changes needed
2. **FastAPI Service:** Change file fetching logic to accept PDFs alongside images
3. **Gemini API Call:** Same `GenerativeModel.generate_content()` call with different MIME type

---

## Alternative Stack (NOT RECOMMENDED)

### If Native PDF Support Insufficient

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pypdf` (formerly PyPDF2) | 4.x | PDF metadata, page splitting | Only if Gemini requires per-page processing |
| `pdf2image` + `poppler-utils` | 1.17.x | Convert PDF to images | Only if Gemini PDF support fails/degrades |
| `pikepdf` | 9.x | PDF manipulation | Only if need to preprocess/repair corrupt PDFs |

**Why NOT Recommended:**
- Adds complexity without proven benefit
- Image conversion degrades quality (OCR issues with small text)
- Increases processing time (conversion step + larger payloads)
- Storage bloat (multi-page PDF → dozens of PNGs)
- Maintenance burden (poppler binary dependency in Docker)

**When to Consider:**
- Gemini API rejects PDFs > 50 pages (untested, unknown limit)
- Quality issues discovered during testing
- Need to process individual pages separately (current prompt handles multi-page)

---

## Token Costs & Rate Limits

### Gemini 2.5 Pro Pricing (Vertex AI - Based on Jan 2025 Knowledge)

**Input Tokens:**
- Text: ~$0.000125 per 1K tokens
- Images: ~$0.0025 per image (regardless of size)
- **PDFs: Charged per page** (~equivalent to image pricing)

**Cost Estimates for Multi-Page PDFs:**

| Scenario | Pages | Est. Tokens | Est. Cost (Input) | Notes |
|----------|-------|-------------|-------------------|-------|
| Single creditor letter | 1-2 pages | ~5K-10K tokens | $0.0025-$0.005 | Current baseline |
| Multi-creditor PDF | 5-10 pages | ~25K-50K tokens | $0.01-$0.025 | 5x-10x current cost |
| Large batch upload | 20 pages | ~100K tokens | $0.05 | May hit context limits |

**Cost Comparison: PDF vs Image Conversion**
- **Native PDF:** ~$0.005 per page (efficient)
- **Converted Images:** ~$0.0025 per image + conversion time/storage costs
- **Verdict:** Native PDF more cost-effective despite slightly higher token cost (no preprocessing)

### Context Limits (Gemini 2.5 Pro)

**Token Limits (as of Jan 2025):**
- Max context: **2M tokens** (theoretical)
- Practical limit: **~100-200 pages** per request
- Recommendation: **Batch large PDFs** (process 20-30 pages at a time)

**Current System Constraints:**
- FastAPI timeout: 20 minutes (`FASTAPI_TIMEOUT = 1200000ms`)
- Gemini request timeout: Likely 5-10 minutes
- **Risk:** Large PDFs (>30 pages) may timeout

**Mitigation Strategy:**
1. **Phase 1 (MVP):** Accept PDFs up to 20 pages
2. **Phase 2:** Implement PDF splitting if demand exists
3. **Monitor:** Track processing times and timeout rates

### Rate Limiting Considerations

**Existing FastAPI Client Config:**
```javascript
// From fastApiClient.js
FASTAPI_MAX_CONCURRENT_REQUESTS = 2
FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE = 12  // 12 RPM = 720/hour
FASTAPI_429_RETRY_ATTEMPTS = 5
```

**Google AI Studio Free Tier (likely in use):**
- 15 requests per minute (RPM)
- Current rate limiting: 12 RPM (under limit)
- **No changes needed** for PDF support

**Vertex AI Production:**
- Default: 60 RPM
- Quotas adjustable via Google Cloud Console
- **Monitor:** PDF requests may take longer, reducing effective throughput

**Recommendations:**
1. Keep existing rate limits (12 RPM) for MVP
2. Monitor 429 error rates (`getErrorMetrics()` in fastApiClient.js)
3. Consider reducing to 10 RPM if PDF processing times > 5 seconds

---

## Implementation Checklist

### Node.js Backend (Mandanten-Portal.9.2/server)

**File Upload Handling:**
- [x] Already supports `mime_type` field in `fastApiClient.js`
- [ ] Validate PDF MIME type: `application/pdf`
- [ ] Add file size validation (recommend: max 50MB per PDF)
- [ ] Update `multer` config to accept `.pdf` extension

**Example Change (likely in upload route):**
```javascript
// Current (images only):
const upload = multer({
  storage: ...,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

// Updated (images + PDFs):
const upload = multer({
  storage: ...,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024  // 50MB max per file
  }
});
```

### FastAPI Service (External Python Service)

**File Fetching (GCS/Local):**
```python
# Current (likely):
async def fetch_file(gcs_path: str) -> bytes:
    # Download from GCS or read local file
    return file_bytes

# No change needed - works for PDFs too
```

**Gemini API Call:**
```python
# Current (images):
from vertexai.generative_models import GenerativeModel, Part

model = GenerativeModel("gemini-2.5-pro")
image_part = Part.from_data(image_bytes, mime_type="image/jpeg")
response = model.generate_content([prompt, image_part])

# Updated (PDFs - identical pattern):
pdf_part = Part.from_data(pdf_bytes, mime_type="application/pdf")
response = model.generate_content([prompt, pdf_part])

# Multi-file (mixed images + PDFs):
parts = [prompt]
for file in files:
    part = Part.from_data(file.bytes, mime_type=file.mime_type)
    parts.append(part)
response = model.generate_content(parts)
```

**Prompt Adjustments:**
```python
# Current prompt (single-page focus):
prompt = """
Extract creditor information from this document.
Identify: name, email, address, reference number, claim amount.
"""

# Updated prompt (multi-page awareness):
prompt = """
Extract creditor information from this document (may contain multiple pages).

For each creditor found:
1. Identify pages that belong to the same creditor
2. Extract: name, email, address, reference number, claim amount
3. If one creditor spans multiple pages, merge the data

Return a list of unique creditors with complete information.
"""
```

**Error Handling:**
```python
# Add specific handling for PDF errors:
try:
    response = model.generate_content([prompt, pdf_part])
except Exception as e:
    if "PDF too large" in str(e):
        # Return error: PDF exceeds Gemini's page limit
        raise HTTPException(413, "PDF too large")
    elif "unsupported format" in str(e):
        # Fallback: suggest image conversion
        raise HTTPException(415, "PDF format unsupported")
    else:
        raise
```

### Frontend (React/TypeScript)

**File Picker:**
```typescript
// Current:
<input type="file" accept="image/*" />

// Updated:
<input type="file" accept="image/*,.pdf,application/pdf" multiple />
```

**User Feedback:**
```typescript
// Show page count for PDFs:
if (file.type === 'application/pdf') {
  // Note: Browser can't read PDF page count without library
  // Option 1: Show file size instead
  toast.info(`Uploaded ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

  // Option 2: Server returns page count after upload
  // Display: "Processing 15-page PDF..."
}
```

---

## Testing Strategy

### Unit Tests (FastAPI)

**Test Cases:**
1. Single-page PDF → 1 creditor
2. Multi-page PDF → 1 creditor (data spans pages)
3. Multi-page PDF → Multiple creditors (separate letters)
4. Mixed upload (2 images + 1 PDF) → Correct aggregation
5. Large PDF (>20 pages) → Timeout handling
6. Corrupted PDF → Error response (not crash)

**Mock Gemini Response:**
```python
# Test without actual API calls:
@pytest.mark.parametrize("file_type,expected_creditors", [
    ("single_page.pdf", 1),
    ("multi_page_single_creditor.pdf", 1),
    ("multi_page_multi_creditor.pdf", 3),
])
def test_pdf_processing(file_type, expected_creditors, mock_gemini):
    # Mock GenerativeModel.generate_content
    result = process_file(file_type)
    assert len(result['creditors']) == expected_creditors
```

### Integration Tests (End-to-End)

**Test Flow:**
1. Upload PDF via Node.js API
2. Verify FastAPI receives correct `mime_type`
3. Mock Gemini response with expected structure
4. Verify webhook callback to Node.js
5. Check creditor data in MongoDB

**Performance Tests:**
- 5-page PDF: Should complete < 30 seconds
- 20-page PDF: Should complete < 2 minutes
- Timeout test: 100-page PDF → Graceful failure

---

## Migration Path

### Phase 1: MVP (Current Milestone)

**Scope:**
- Accept PDFs up to 20 pages
- Native Gemini processing (no conversion)
- Same prompt as images (Gemini figures out page boundaries)

**Changes Required:**
- Node.js: Update file validation (`+10 lines`)
- FastAPI: Add PDF MIME type handling (`+5 lines`)
- Frontend: Update file picker (`+2 lines`)

**Estimated Effort:** 2-4 hours (mostly testing)

### Phase 2: Optimization (Future)

**Scope:**
- Page count extraction (server-side)
- PDF splitting for large documents (>50 pages)
- Enhanced prompts for multi-creditor detection

**New Dependencies:**
- `pypdf` 4.x (only if splitting needed)

### Phase 3: Advanced Features (Future)

**Scope:**
- Per-page confidence scores
- Visual page previews (PDF → thumbnail)
- OCR fallback for scanned PDFs

**New Dependencies:**
- `pdf2image` + `poppler-utils` (thumbnails)
- `pytesseract` (OCR fallback)

---

## Known Limitations & Risks

### Gemini API Limits (MEDIUM Confidence - Requires Validation)

| Limit | Expected Value | Mitigation |
|-------|----------------|------------|
| Max PDF pages | Unknown (likely 50-100) | Test with large PDFs; implement splitting |
| Max file size | Unknown (likely 50MB) | Validate client-side, reject > 50MB |
| Processing time | Unknown (likely 10-30s for 10 pages) | Monitor timeouts, adjust `FASTAPI_TIMEOUT` |

**Action Required:** Test Gemini PDF limits during implementation:
1. Upload 10-page PDF → Measure processing time
2. Upload 50-page PDF → Check if accepted
3. Upload 100-page PDF → Verify error handling

### Prompt Engineering Challenges

**Risk:** Gemini may not correctly:
- Associate pages belonging to same creditor
- Separate multiple creditors in one PDF
- Handle edge cases (half-page letter, mixed languages)

**Mitigation:**
1. **Extensive prompt testing** (Phase 2 from ROADMAP)
2. Few-shot examples in prompt
3. Structured output format (JSON schema enforcement)

**Example Improved Prompt:**
```python
prompt = """
You are analyzing a PDF that may contain multiple creditor letters.

Rules:
1. Each creditor letter typically starts with company letterhead/logo
2. Letters may span 1-3 pages (continuation pages have "Page X of Y")
3. Multiple letters may be concatenated in one PDF
4. Extract data ONLY from complete letters (ignore fragments)

For each creditor, output JSON:
{
  "creditor_name": "...",
  "email": "...",
  "claim_amount": ...,
  "page_range": "1-2"  // Which PDF pages this creditor appears on
}
"""
```

### Cost Considerations

**Current Cost (Images Only):**
- Avg request: $0.005 (1-2 images)
- Monthly volume: Unknown (estimate: 1000 requests)
- Monthly cost: ~$5

**With PDFs (10 pages avg):**
- Avg request: $0.025 (10 pages)
- Monthly cost: ~$25 (5x increase)

**Recommendation:** Monitor costs via Google Cloud Billing; set budget alerts.

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Native PDF support in Gemini | **HIGH** | Confirmed in Gemini 2.5 Pro documentation (Jan 2025 training data) |
| API method (Part.from_data) | **HIGH** | Same pattern as images, documented in Vertex AI SDK |
| Token pricing | **MEDIUM** | Based on Jan 2025 pricing; may have changed by Feb 2026 |
| Page limits | **LOW** | Not documented; requires empirical testing |
| Processing time | **LOW** | Depends on PDF complexity, page count; must benchmark |
| Multi-creditor detection | **MEDIUM** | Depends on prompt quality and PDF structure |

---

## Verification Required

**CRITICAL - Do NOT assume these claims without testing:**

1. **Gemini 2.5 Pro still supports native PDFs in Feb 2026**
   - Verification: Check [Vertex AI Gemini docs](https://cloud.google.com/vertex-ai/docs/generative-ai/multimodal/send-multimodal-prompts)
   - Date Check: Search "Gemini 2.5 Pro PDF support 2026"

2. **MIME type `application/pdf` is accepted**
   - Verification: FastAPI test with sample PDF
   - Fallback: Try `Part.from_uri()` with GCS PDF path

3. **Token costs match estimates**
   - Verification: Process sample PDF, check Google Cloud Billing
   - Action: Adjust budget forecasts if costs differ

4. **Page limits are acceptable**
   - Verification: Test 10, 20, 50, 100-page PDFs
   - Action: Implement splitting if limit < 20 pages

5. **Processing times fit within timeouts**
   - Verification: Benchmark 10-page PDF processing time
   - Action: Increase `FASTAPI_TIMEOUT` if needed (currently 20 min)

---

## Recommended Next Steps

**Immediate (During Implementation):**
1. **Create test PDFs:**
   - 1-page single creditor
   - 5-page single creditor (letter spans pages)
   - 10-page multi-creditor (3 separate letters)
   - 20-page multi-creditor (edge case)

2. **FastAPI Prototype:**
   ```python
   # Add to existing processing endpoint:
   if file.mime_type == "application/pdf":
       pdf_part = Part.from_data(pdf_bytes, mime_type="application/pdf")
       # Use existing prompt (test if it works)
       response = model.generate_content([prompt, pdf_part])
   ```

3. **Measure & Document:**
   - Processing time per page
   - Token usage per page
   - Max pages before timeout/rejection
   - Update this document with actual values

**Post-MVP (Phase 2):**
1. Prompt optimization based on failure cases
2. Page count extraction (if needed for UX)
3. Cost monitoring dashboard

---

## Questions for Codebase Owner

**Before implementing, clarify:**

1. **What's the expected PDF size distribution?**
   - 90% < 5 pages → No splitting needed
   - 50% > 20 pages → Must implement splitting

2. **Is there a FastAPI service codebase to inspect?**
   - Current assumption: Separate repository
   - Need to verify: How it currently handles images

3. **What's the acceptable cost increase?**
   - 5x token cost acceptable? ($5 → $25/month)
   - Should we implement page limits to control costs?

4. **Are there known PDF sources with weird formats?**
   - Scanned images (requires OCR)
   - Password-protected (requires decryption)
   - Non-standard encodings (requires preprocessing)

---

## Installation

**No new dependencies for MVP** (using native Gemini PDF support).

**If future phases require PDF libraries:**

```bash
# Python (FastAPI service)
pip install pypdf==4.0.1           # PDF manipulation (optional)
pip install pdf2image==1.17.0      # PDF to image (optional)

# System dependencies (if using pdf2image):
apt-get install poppler-utils      # PDF rendering engine
```

**Docker (if deploying FastAPI in container):**
```dockerfile
# Add to existing Dockerfile (only if pdf2image needed):
RUN apt-get update && apt-get install -y poppler-utils
```

---

## Sources

**Primary (HIGH Confidence):**
- Existing codebase analysis:
  - `/Users/luka.s/Mandanten-Portal.9.2/server/utils/fastApiClient.js` (integration pattern)
  - `/Users/luka.s/Mandanten-Portal.9.2/.planning/codebase/INTEGRATIONS.md` (architecture)

**Secondary (MEDIUM Confidence):**
- Training data knowledge (as of Jan 2025):
  - Gemini 2.5 Pro multimodal capabilities
  - Vertex AI Python SDK (`Part.from_data()` API)
  - Google Cloud pricing (may be outdated)

**Verification Needed (LOW Confidence):**
- Gemini PDF page limits (not documented in training data)
- Current pricing as of Feb 2026
- Performance characteristics for multi-page PDFs

**IMPORTANT:** This research is based on Jan 2025 training data. The Gemini API may have changed by Feb 2026. Verify all claims against current documentation before implementation.

---

*Research confidence: MEDIUM - Core API methods confirmed, but limits/performance require validation.*
*Next step: Test with sample PDF to validate assumptions.*
