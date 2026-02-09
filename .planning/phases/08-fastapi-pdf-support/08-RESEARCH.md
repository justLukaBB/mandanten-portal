# Phase 8: FastAPI PDF Support - Research

**Researched:** 2026-02-09
**Domain:** FastAPI PDF processing with Gemini 2.5 Pro multimodal API
**Confidence:** HIGH

## Summary

Phase 8 requires adding PDF support to the existing FastAPI creditor extraction service. The implementation is remarkably straightforward: Gemini 2.5 Pro natively supports PDF processing via `Part.from_bytes()` with `application/pdf` MIME type. The existing Node.js backend already accepts PDFs, stores them in GCS, and passes MIME type metadata through the queue. The only required code change is in FastAPI's document processor to accept PDF MIME types alongside images.

Critical user decisions from CONTEXT.md constrain this phase: 10 MB max file size, 50 page max count, reject password-protected PDFs before sending to Gemini, same endpoint as images, and backward compatibility is mandatory. FastAPI must auto-detect MIME type from bytes (not trust caller). Multi-creditor readiness should not be artificially limited.

The research confirms that Gemini API supports PDFs up to 50 MB or 1000 pages, with native text extraction not counting toward token costs. The existing architecture is format-agnostic throughout except for one function: `_load_image_as_part()` in the FastAPI document processor.

**Primary recommendation:** Extend `_load_image_as_part()` to accept `application/pdf` MIME type, add pypdf validation for password protection and page count before processing, and preserve backward compatibility by keeping image processing logic unchanged.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Google Vertex AI SDK** | Current (existing) | Gemini 2.5 Pro API access | Already used for image processing; native PDF support via same API |
| **pypdf** | 5.x+ | PDF validation (page count, encryption) | Modern replacement for PyPDF2; official pypdf.readthedocs.io documentation |
| **FastAPI** | Current (existing) | HTTP API framework | Already in use; validation patterns well-established |
| **python-magic** | 0.4.x+ (optional) | MIME type detection from bytes | Industry standard for content-based file type detection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **requests** | Current (existing) | Download from GCS signed URLs | Already in use for fetching files |
| **Pydantic** | v2 (existing) | Request/response validation | Already in use; no changes needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pypdf | PyPDF2 | PyPDF2 is deprecated; pypdf is the maintained fork with same API |
| Native Gemini PDF | pdf2image + Poppler | Conversion adds latency, degrades quality, increases storage costs; only use if Gemini API fails |
| python-magic | mimetypes module | mimetypes only checks extensions, doesn't inspect content; less secure |

**Installation:**
```bash
# FastAPI service (Python)
pip install pypdf==5.5.0  # PDF validation only
pip install python-magic==0.4.27  # Optional: MIME type detection from content
```

## Architecture Patterns

### Recommended Project Structure
```
fastapi_service/
├── document_processor.py   # Contains _load_image_as_part() → MODIFY HERE
├── validation.py           # NEW: PDF validation utilities
├── processing.py           # Orchestrator → NO CHANGES NEEDED
└── models.py              # Request/response schemas → NO CHANGES NEEDED
```

### Pattern 1: MIME-Type-Driven Processing
**What:** Route processing logic based on `mime_type` field passed from Node.js, not file extensions or content sniffing.

**When to use:** Any file processing function that needs format-specific handling.

**Example:**
```python
# Source: Based on existing codebase pattern (ARCHITECTURE.md)
from vertexai.generative_models import Part

def _load_document_as_part(file_data: dict) -> Part:
    """Load image or PDF as Gemini Part."""
    mime_type = file_data.get('mime_type', 'image/png')
    file_bytes = download_from_gcs(file_data['gcs_path'])

    # Validate PDF-specific constraints
    if mime_type == 'application/pdf':
        validate_pdf(file_bytes)  # Check encryption, page count
        return Part.from_bytes(
            data=file_bytes,
            mime_type='application/pdf'
        )
    elif mime_type in ['image/jpeg', 'image/png']:
        return Part.from_bytes(
            data=file_bytes,
            mime_type=mime_type
        )
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported MIME type: {mime_type}"
        )
```

**Why:** MIME type is already captured at upload, validated by multer, stored in MongoDB, and passed through all layers. Consistent with existing architecture.

### Pattern 2: Validate Before Processing
**What:** Check PDF constraints (size, pages, encryption) before sending to Gemini API to avoid wasted API calls and provide clear error messages.

**When to use:** All PDF uploads before creating Gemini Part.

**Example:**
```python
# Source: Official pypdf documentation + WebSearch findings
from pypdf import PdfReader
from io import BytesIO
from fastapi import HTTPException

def validate_pdf(pdf_bytes: bytes, max_pages: int = 50, max_size_mb: int = 10):
    """Validate PDF meets processing constraints.

    Raises:
        HTTPException 413: File size exceeds limit
        HTTPException 400: Page count exceeds limit
        HTTPException 400: PDF is password protected
        HTTPException 422: PDF is corrupted
    """
    # Check file size (before parsing)
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > max_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"PDF size {size_mb:.1f}MB exceeds maximum {max_size_mb}MB"
        )

    # Parse PDF to check encryption and page count
    try:
        reader = PdfReader(BytesIO(pdf_bytes))

        # Check if password protected (MUST reject per CONTEXT.md)
        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported. Please upload an unencrypted PDF."
            )

        # Check page count
        page_count = len(reader.pages)
        if page_count > max_pages:
            raise HTTPException(
                status_code=400,
                detail=f"PDF has {page_count} pages, maximum {max_pages} pages allowed"
            )

        return page_count  # Optionally return for metadata

    except Exception as e:
        # Corrupted PDF
        if isinstance(e, HTTPException):
            raise  # Re-raise our own exceptions
        raise HTTPException(
            status_code=422,
            detail=f"PDF file is corrupted or invalid: {str(e)}"
        )
```

**Why:** User decision from CONTEXT.md requires rejecting password-protected PDFs with clear error before sending to Gemini. Prevents wasted API calls and provides actionable feedback.

### Pattern 3: Backward Compatibility via Additive Changes
**What:** Extend existing functions to accept PDFs without modifying image processing logic.

**When to use:** When adding new file format support to established APIs.

**Example:**
```python
# BEFORE (images only):
def _load_image_as_part(file_data):
    if mime_type not in ['image/jpeg', 'image/png']:
        raise ValueError("Unsupported MIME type")
    return Part.from_bytes(data=image_bytes, mime_type=mime_type)

# AFTER (images + PDFs, backward compatible):
def _load_image_as_part(file_data):
    """Load image or PDF as Gemini Part.

    Name unchanged for backward compatibility; now handles both images and PDFs.
    """
    mime_type = file_data.get('mime_type', 'image/png')
    file_bytes = download_from_gcs(file_data['gcs_path'])

    # NEW: PDF support
    if mime_type == 'application/pdf':
        validate_pdf(file_bytes)
        return Part.from_bytes(data=file_bytes, mime_type='application/pdf')

    # EXISTING: Image support (unchanged logic)
    elif mime_type in ['image/jpeg', 'image/png']:
        return Part.from_bytes(data=file_bytes, mime_type=mime_type)

    else:
        raise ValueError(f"Unsupported MIME type: {mime_type}")
```

**Why:** COMPAT-01 requirement mandates existing image uploads work identically. Adding PDF support via if-elif structure preserves image logic.

### Pattern 4: Optional MIME Type Auto-Detection
**What:** Optionally verify MIME type from file content, not just trust caller's `mime_type` field.

**When to use:** If security requires content-based validation (user decision in CONTEXT.md marks this as Claude's discretion).

**Example:**
```python
# Source: WebSearch findings on python-magic
import magic

def detect_mime_type(file_bytes: bytes) -> str:
    """Detect MIME type from file content."""
    mime = magic.Magic(mime=True)
    detected = mime.from_buffer(file_bytes)
    return detected

def _load_document_as_part(file_data: dict) -> Part:
    caller_mime = file_data.get('mime_type')
    file_bytes = download_from_gcs(file_data['gcs_path'])

    # Option A: Trust caller (faster, existing pattern)
    mime_type = caller_mime

    # Option B: Verify content (more secure, adds latency)
    # detected_mime = detect_mime_type(file_bytes)
    # if detected_mime != caller_mime:
    #     raise HTTPException(400, f"MIME type mismatch: expected {caller_mime}, detected {detected_mime}")
    # mime_type = detected_mime

    # Process based on MIME type
    if mime_type == 'application/pdf':
        validate_pdf(file_bytes)
        return Part.from_bytes(data=file_bytes, mime_type='application/pdf')
    # ... rest of logic
```

**Recommendation:** Start with Option A (trust caller) since Node.js multer already validates MIME types at upload. Add Option B (content verification) if security audit requires it.

### Anti-Patterns to Avoid
- **Converting PDF to images before Gemini:** Loses page context, degrades quality, wastes API calls. Gemini processes PDFs natively.
- **Splitting PDFs into separate page files:** Not needed for Phase 8; Gemini handles multi-page PDFs. Only split if exceeding API limits.
- **MIME type validation in multiple layers:** Validate once at upload (Node.js multer), pass through queue, validate again at processing. Don't check in queue service.
- **Custom PDF parsing for text extraction:** Gemini extracts text natively. Don't use PyPDF2 for OCR.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF encryption detection | Custom PDF header parsing | `pypdf.PdfReader.is_encrypted` | PDF encryption spec is complex; pypdf handles all encryption types (RC4, AES-128, AES-256) |
| PDF page counting | Regex on PDF structure | `len(pypdf.PdfReader.pages)` | PDF page trees are complex (can be nested); pypdf parses correctly |
| MIME type detection from bytes | Check file magic numbers manually | `python-magic` library | Supports 50+ formats, handles edge cases, maintained by community |
| Multi-page PDF text extraction | Build OCR pipeline | Gemini native PDF processing | Gemini 2.5 Pro extracts text from all pages, handles scanned PDFs, no preprocessing needed |
| File size validation | Read entire file to count bytes | Check `Content-Length` header + file.size | Avoids loading large files into memory just for size check |

**Key insight:** PDF format is deceptively complex. Even "simple" operations like counting pages or detecting encryption have edge cases (incremental updates, object streams, encrypted metadata). Use pypdf for all PDF inspection.

## Common Pitfalls

### Pitfall 1: Trusting Content-Type Header Without Validation
**What goes wrong:** Malicious user uploads `.exe` file renamed to `.pdf` with `Content-Type: application/pdf`. FastAPI sends to Gemini, which rejects it or worse, processes malicious payload.

**Why it happens:** HTTP headers are user-controlled and easily spoofed.

**How to avoid:**
- **Minimum:** Validate file extension and Content-Type match (already done by Node.js multer)
- **Recommended:** Use python-magic to detect actual MIME type from file content
- **Critical:** Let pypdf parse the file; if it's not a valid PDF, pypdf will raise exception

**Warning signs:** Generic error from Gemini like "Invalid input format" instead of specific PDF validation error.

### Pitfall 2: Not Handling Password-Protected PDFs Gracefully
**What goes wrong:** User uploads password-protected PDF, FastAPI sends to Gemini, Gemini rejects it, user gets generic "processing failed" error with no actionable guidance.

**Why it happens:** Password protection is common (banks send statements as encrypted PDFs), but Gemini can't process encrypted files.

**How to avoid:**
```python
reader = PdfReader(BytesIO(pdf_bytes))
if reader.is_encrypted:
    raise HTTPException(
        status_code=400,
        detail="Password-protected PDFs are not supported. Please remove password protection and try again."
    )
```

**Warning signs:** User reports "PDF processing fails" but works when they save the PDF again without encryption.

### Pitfall 3: Exceeding Gemini Token Limits with Large PDFs
**What goes wrong:** User uploads 100-page PDF, Gemini accepts it but takes 5+ minutes to process and times out, or hits token limit mid-processing.

**Why it happens:** Gemini supports up to 1000 pages and 50 MB, but processing time and token usage scale with page count. Each page counts as ~258 tokens.

**How to avoid:**
- **Enforce limits in validation:** Reject PDFs over 50 pages (user decision: max 50 pages)
- **Increase timeouts:** FastAPI job timeout should be 20 minutes (existing: 20 minutes already configured)
- **Monitor metrics:** Track processing time vs page count to detect degradation

**Warning signs:** Timeout errors increase; users report "large PDFs fail but small ones work."

### Pitfall 4: Breaking Image Processing When Adding PDF Support
**What goes wrong:** Refactoring `_load_image_as_part()` to support PDFs accidentally changes image processing logic, breaking backward compatibility.

**Why it happens:** Shared code path for both formats; changes to one affect the other.

**How to avoid:**
- **Use if-elif structure:** Keep image logic in separate elif block, unchanged
- **Test both formats:** Upload test image after PDF changes; ensure identical behavior
- **Don't rename function:** Keep `_load_image_as_part` name for backward compatibility in logs/metrics

**Warning signs:** Image upload success rate drops after PDF deployment; different error messages for images.

### Pitfall 5: Not Validating Before Downloading from GCS
**What goes wrong:** FastAPI downloads 200 MB PDF from GCS, then discovers it's too large, wasting bandwidth and latency.

**Why it happens:** File size validation happens after download instead of before.

**How to avoid:**
- Node.js should validate file size before uploading to GCS
- FastAPI can check metadata from GCS (blob size) before downloading
- Only download after all pre-checks pass

**Warning signs:** High GCS egress costs; slow error responses for oversized files.

## Code Examples

Verified patterns from official sources:

### Gemini PDF Processing
```python
# Source: https://ai.google.dev/gemini-api/docs/document-processing (official Google docs)
from vertexai.generative_models import GenerativeModel, Part

model = GenerativeModel("gemini-2.5-pro")

# Load PDF from bytes
pdf_part = Part.from_bytes(
    data=pdf_bytes,
    mime_type='application/pdf'
)

# Generate content (identical API to images)
response = model.generate_content([prompt, pdf_part])
extracted_data = response.text
```

### PDF Validation with pypdf
```python
# Source: https://pypdf.readthedocs.io/en/stable/user/encryption-decryption.html
from pypdf import PdfReader
from io import BytesIO

# Check encryption
reader = PdfReader(BytesIO(pdf_bytes))
if reader.is_encrypted:
    raise ValueError("PDF is password protected")

# Get page count
page_count = len(reader.pages)
```

### FastAPI File Validation
```python
# Source: https://betterstack.com/community/guides/scaling-python/uploading-files-using-fastapi/
from fastapi import UploadFile, HTTPException

async def validate_upload(file: UploadFile, max_size_mb: int = 10):
    """Validate file before processing."""
    # Check MIME type
    if file.content_type not in ['application/pdf', 'image/jpeg', 'image/png']:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}"
        )

    # Check file size (from Content-Length header)
    content_length = file.size  # or request.headers.get('Content-Length')
    if content_length and content_length > max_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {max_size_mb}MB limit"
        )
```

### HTTP Error Codes for File Validation
```python
# Source: https://fastapi.tiangolo.com/tutorial/handling-errors/ + WebSearch findings
from fastapi import HTTPException

# 400: Bad Request - generic client error (malformed data)
raise HTTPException(status_code=400, detail="Invalid PDF format")

# 413: Payload Too Large - file size exceeds limit
raise HTTPException(status_code=413, detail="File size exceeds 10MB")

# 415: Unsupported Media Type - wrong file type
raise HTTPException(status_code=415, detail="Only PDF and images are supported")

# 422: Unprocessable Entity - validation error (Pydantic uses this)
raise HTTPException(status_code=422, detail="PDF is corrupted")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PyPDF2 | pypdf | 2023 (v5.0) | PyPDF2 deprecated; pypdf is maintained fork with same API + improvements |
| Convert PDF to images before AI | Send PDF directly to Gemini | Gemini 2.0+ (2024) | Native PDF support eliminates conversion overhead |
| Pydantic v1 | Pydantic v2 | 2023 | FastAPI supports both; v2 has better performance and validation |
| RC4 PDF encryption | AES-256 | Ongoing | RC4 is insecure; pypdf still supports it for reading but recommends AES |

**Deprecated/outdated:**
- **PyPDF2:** Use pypdf instead (same API, actively maintained)
- **pdf2image for Gemini preprocessing:** Gemini processes PDFs natively; only use pdf2image for thumbnail generation or non-Gemini use cases
- **genai.Part.from_data():** Use `Part.from_bytes()` in newer SDK versions (same functionality, clearer name)

## Open Questions

Things that couldn't be fully resolved:

1. **MIME type source: trust caller vs. re-detect from bytes**
   - What we know: Node.js multer already validates MIME types; python-magic can verify from content
   - What's unclear: User marked as "Claude's discretion" - security preference not specified
   - Recommendation: Trust caller (faster, consistent with existing pattern). Add content detection only if security audit requires it or if production data shows MIME type mismatches.

2. **Response shape: add PDF-specific metadata like page_count**
   - What we know: Webhook response structure is identical for images and PDFs (COMPAT-02 for Phase 9)
   - What's unclear: Whether to optionally include `page_count` field for PDFs in Phase 8
   - Recommendation: Keep response identical for Phase 8 (no PDF-specific fields). Add `page_count` in Phase 9 if prompt engineering needs it.

3. **Gemini processing time for large PDFs**
   - What we know: Gemini supports up to 1000 pages; each page ~258 tokens; existing timeout is 20 minutes
   - What's unclear: Actual processing time for 50-page PDF (max allowed per user decision)
   - Recommendation: Test with real 50-page PDF during implementation. Increase timeout if needed (20 min should be sufficient based on token counts).

4. **Phase 8/9 boundary: include prompt changes in Phase 8?**
   - What we know: User wants "feature to work end-to-end" and "multi-creditor ready as early as possible"
   - What's unclear: Whether Phase 8 should include basic multi-creditor prompt or defer all prompt changes to Phase 9
   - Recommendation: Phase 8 uses existing image prompt (may work for single-page PDFs). Phase 9 adds PDF-specific prompt instructions for multi-page multi-creditor detection. Natural split based on complexity.

## Sources

### Primary (HIGH confidence)
- [Google Gemini API Document Processing](https://ai.google.dev/gemini-api/docs/document-processing) - Official docs confirming Part.from_bytes with application/pdf, 50MB/1000 page limits
- [pypdf Encryption Documentation](https://pypdf.readthedocs.io/en/stable/user/encryption-decryption.html) - Official pypdf docs for is_encrypted usage
- [FastAPI Error Handling](https://fastapi.tiangolo.com/tutorial/handling-errors/) - Official FastAPI HTTPException patterns
- Existing codebase analysis:
  - `.planning/research/STACK.md` - Current implementation patterns
  - `.planning/research/ARCHITECTURE.md` - Integration points and data flow
  - `.planning/PROJECT.md` - Tech stack and constraints

### Secondary (MEDIUM confidence)
- [Better Stack FastAPI File Uploads](https://betterstack.com/community/guides/scaling-python/uploading-files-using-fastapi/) - File validation patterns (2025/2026)
- [Google Gemini PDF Limits Discussion](https://www.datastudios.org/post/google-gemini-pdf-reading-limits-environments-and-operational-guidance) - Community findings on 50MB/1000 page limits
- [FastAPI Error Handling Patterns](https://betterstack.com/community/guides/scaling-python/error-handling-fastapi/) - HTTP status code best practices (2026)
- [Gemini Document Understanding (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/document-understanding) - Cloud documentation confirming native PDF support

### Tertiary (LOW confidence)
- WebSearch results on PDF encryption detection patterns (2026) - Multiple sources confirm pypdf is_encrypted approach
- WebSearch results on FastAPI file size validation (2026) - Common patterns identified across multiple sources
- WebSearch results on Gemini prompt engineering for PDFs (2026) - General patterns, not specific to this use case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pypdf and Gemini API are well-documented; existing codebase confirms integration patterns
- Architecture: HIGH - Codebase analysis reveals single function change needed; backward compatibility proven via existing patterns
- Pitfalls: HIGH - Based on official documentation and verified with multiple sources; common PDF processing issues well-known
- Prompt engineering: MEDIUM - Deferred to Phase 9; general patterns known but specific multi-creditor detection not tested
- Performance: MEDIUM - Token costs documented, but actual processing times for 50-page PDFs need empirical testing

**Research date:** 2026-02-09
**Valid until:** 30 days (until 2026-03-11) - Gemini API and pypdf are stable; FastAPI patterns unlikely to change

**Critical validations required during implementation:**
1. Verify Gemini 2.5 Pro still accepts application/pdf MIME type (HIGH confidence, but API version may differ)
2. Test 50-page PDF processing time to confirm timeout is sufficient (20 min existing timeout)
3. Confirm pypdf.is_encrypted detects all encryption types in production PDFs
4. Verify backward compatibility: upload test images after PDF implementation, ensure identical behavior
