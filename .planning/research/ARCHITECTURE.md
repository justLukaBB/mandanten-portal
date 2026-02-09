# Architecture Patterns: Multi-Page PDF Support

**Domain:** Document processing with Gemini AI (creditor extraction)
**Research Date:** 2026-02-09
**Confidence:** HIGH (based on existing codebase analysis)

## Executive Summary

Multi-page PDF support requires minimal architectural changes. The existing two-service architecture (Node.js backend + FastAPI processor) already handles the end-to-end flow. The key integration point is the FastAPI `_load_image_as_part()` function, which needs to accept PDF MIME types and pass them to Gemini's multimodal API. The Node.js backend already accepts PDFs, stores them in GCS, and creates processing jobs with MIME type metadata.

**Critical insight:** Gemini AI natively supports multi-page PDF processing via the `genai.Part` API. No page splitting, no OCR preprocessing, no new services needed. This is a focused function-level change, not an architectural redesign.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT UPLOAD FLOW                         │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND (Express)                     │
│                                                                   │
│  1. Upload Handler (server/middleware/upload.js)                │
│     - Accepts: PDF, JPEG, PNG, DOC, DOCX                        │
│     - multer → memoryStorage (file.buffer)                       │
│     - fileFilter: validates MIME types                           │
│                                                                   │
│  2. GCS Service (server/services/gcs-service.js)                │
│     - uploadToGCS(file) → stores in Cloud Storage               │
│     - Generates signed URL (24h expiry)                          │
│     - Returns: GCS path for FastAPI                              │
│                                                                   │
│  3. Queue Service (server/services/documentQueueService.js)     │
│     - Creates DocumentProcessingJob in MongoDB                   │
│     - Job includes: {filename, gcs_path, mime_type, size}       │
│     - Polls queue (2s interval, max 2 concurrent)                │
│                                                                   │
│  4. FastAPI Client (server/utils/fastApiClient.js)              │
│     - POST /processing/jobs to FastAPI                           │
│     - Payload: {client_id, files[], webhook_url}                 │
│     - Each file: {filename, gcs_path, mime_type, document_id}   │
│     - Rate limiting: 12 RPM, 2 concurrent                        │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FASTAPI SERVICE (Python)                        │
│                                                                   │
│  1. Job Endpoint (/processing/jobs)                              │
│     - Receives job with files[] array                            │
│     - Downloads from GCS signed URL                              │
│                                                                   │
│  2. Document Processor (document_processor.py)                   │
│     - _load_image_as_part(file_data) → Creates Gemini Part      │
│     - CURRENT: Only handles image MIME types                     │
│     - ⚠️ CHANGE NEEDED: Add PDF MIME type support               │
│                                                                   │
│  3. Processing Pipeline (processing.py)                          │
│     - Classification → Rotation → Extraction → Verification      │
│     - Multi-creditor splitting (if multiple creditors detected)  │
│     - Creates child entries with creditor_index/count            │
│                                                                   │
│  4. Webhook Response                                              │
│     - POST webhook_url with results                              │
│     - Format: {job_id, client_id, status, results[]}            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              NODE.JS WEBHOOK HANDLER                             │
│                                                                   │
│  1. Webhook Controller (server/controllers/webhookController.js)│
│     - Acknowledge-first pattern (200 OK immediately)             │
│     - Queues job in WebhookJob for background processing         │
│                                                                   │
│  2. Document Results Processing                                  │
│     - Updates Client.documents[] with processing results         │
│     - Handles multi-creditor splits (creates child entries)      │
│     - Enriches with DB lookup (creditor contact info)            │
│     - Duplicate detection (reference number matching)            │
│                                                                   │
│  3. Creditor Deduplication                                       │
│     - Merges FastAPI-deduped creditors into final_creditor_list │
│     - Runs AI-based rededup after all documents processed        │
│     - Creates Zendesk tickets for manual review if needed        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Points for PDF Support

### 1. **Node.js Upload Handler** ✅ ALREADY WORKS

**Location:** `server/middleware/upload.js`

**Current State:**
- Already accepts `'application/pdf'` in `fileFilter.allowedTypes`
- Uses `multer.memoryStorage()` (works for PDFs)
- No changes needed

**Why it works:**
- PDFs are binary files like images
- Memory buffer works identically for PDF bytes
- GCS upload via `uploadToGCS(file)` is MIME-agnostic

### 2. **GCS Storage** ✅ ALREADY WORKS

**Location:** `server/services/gcs-service.js`

**Current State:**
- `uploadToGCS(file)` stores any MIME type
- Generates signed URL with `blob.getSignedUrl()` (24h expiry)
- FastAPI downloads via signed URL

**Why it works:**
- GCS stores PDFs identically to images
- Signed URLs work for any file type
- FastAPI retrieves via HTTP (MIME-agnostic)

### 3. **Document Queue** ✅ ALREADY WORKS

**Location:** `server/services/documentQueueService.js`, `server/models/DocumentProcessingJob.js`

**Current State:**
- Job schema includes `mime_type` field
- Queue passes `mime_type` to FastAPI
- No validation restricts to images only

**Why it works:**
- Queue is a pass-through layer
- `mime_type` field already exists
- FastAPI receives the MIME type

### 4. **FastAPI Client** ✅ ALREADY WORKS

**Location:** `server/utils/fastApiClient.js`

**Current State:**
- `createProcessingJob()` sends files with `mime_type`
- No validation restricts MIME types
- Rate limiting is MIME-agnostic

**Why it works:**
- Client just sends JSON payload
- MIME type is metadata, not processed by client
- FastAPI handles the actual file

### 5. **FastAPI Document Processor** ⚠️ CHANGE NEEDED

**Location:** `/tmp/creditor-fastapi/document_processor.py`

**Current Issue:**
```python
def _load_image_as_part(file_data):
    # ONLY handles image MIME types
    if mime_type not in ['image/jpeg', 'image/png', ...]:
        raise ValueError("Unsupported MIME type")
```

**Required Change:**
```python
def _load_image_as_part(file_data):
    mime_type = file_data.get('mime_type', 'image/png')

    # Download file bytes (works for both images and PDFs)
    response = requests.get(gcs_signed_url)
    file_bytes = response.content

    # Add PDF support
    if mime_type == 'application/pdf':
        return genai.Part.from_data(
            data=file_bytes,
            mime_type='application/pdf'
        )
    elif mime_type in IMAGE_MIME_TYPES:
        return genai.Part.from_data(
            data=file_bytes,
            mime_type=mime_type
        )
    else:
        raise ValueError(f"Unsupported MIME type: {mime_type}")
```

**Why this works:**
- Gemini AI accepts `application/pdf` as a valid MIME type
- `genai.Part.from_data()` handles multi-page PDFs natively
- No page splitting needed (Gemini processes all pages internally)

**Impact:** Isolated to one function. No changes to pipeline orchestration.

### 6. **Processing Pipeline** ✅ ALREADY WORKS

**Location:** `/tmp/creditor-fastapi/processing.py`

**Current State:**
- Orchestrates: classification → rotation → extraction → verification
- Passes `genai.Part` objects to Gemini prompts
- Multi-creditor splitting logic is file-format agnostic

**Why it works:**
- Gemini AI treats PDF Parts identically to image Parts
- Prompt engineering works across formats
- Multi-creditor detection is content-based, not format-based

### 7. **Webhook Handler** ✅ ALREADY WORKS

**Location:** `server/controllers/webhookController.js`

**Current State:**
- Processes results array from FastAPI
- Creates/updates documents in MongoDB
- Handles multi-creditor splits via `source_document_id`

**Why it works:**
- Results format is identical for images and PDFs
- Document metadata includes MIME type (stored, not processed)
- Multi-creditor logic is format-agnostic

---

## Data Flow Changes: Images vs PDFs

### **Current: Single-Page Image**

```
1. Upload: image/jpeg → multer buffer
2. GCS: uploadToGCS() → signed URL
3. Queue: {mime_type: 'image/jpeg', gcs_path: '...'}
4. FastAPI: _load_image_as_part() → genai.Part (image bytes)
5. Gemini: Processes single-page image
6. Result: {id, is_creditor_document, extracted_data, ...}
7. Webhook: Updates client.documents[]
```

### **New: Multi-Page PDF**

```
1. Upload: application/pdf → multer buffer
2. GCS: uploadToGCS() → signed URL
3. Queue: {mime_type: 'application/pdf', gcs_path: '...'}
4. FastAPI: _load_image_as_part() → genai.Part (PDF bytes) ← CHANGE HERE
5. Gemini: Processes ALL pages in PDF (native multi-page support)
6. Result: {id, is_creditor_document, extracted_data, ...}
   - If multiple creditors: Creates child entries with creditor_index
7. Webhook: Updates client.documents[], handles multi-creditor splits
```

**Key Difference:** Step 4 (FastAPI) accepts PDF MIME type. Everything else identical.

---

## Component Boundaries

| Component | Responsibility | PDF Changes Needed |
|-----------|---------------|-------------------|
| **Upload Middleware** | Validate file type, create buffer | None (already accepts PDFs) |
| **GCS Service** | Store file, generate signed URL | None (MIME-agnostic) |
| **Document Queue** | Queue jobs, rate limit | None (passes MIME type) |
| **FastAPI Client** | HTTP → FastAPI | None (sends MIME type) |
| **Document Processor** | Convert file → Gemini Part | **ADD PDF MIME TYPE** |
| **Processing Pipeline** | Orchestrate AI calls | None (format-agnostic) |
| **Webhook Handler** | Store results in MongoDB | None (format-agnostic) |

**Blast Radius:** 1 function in FastAPI service.

---

## Architecture Patterns to Follow

### Pattern 1: MIME-Type-Driven Processing

**What:** Route processing logic based on `mime_type` field, not file extension or content sniffing.

**When:** Any file processing function that needs format-specific handling.

**Example:**
```python
def _load_document_as_part(file_data):
    mime_type = file_data['mime_type']
    file_bytes = download_file(file_data['gcs_path'])

    if mime_type == 'application/pdf':
        return genai.Part.from_data(data=file_bytes, mime_type='application/pdf')
    elif mime_type in IMAGE_MIME_TYPES:
        return genai.Part.from_data(data=file_bytes, mime_type=mime_type)
    else:
        raise UnsupportedFormatError(mime_type)
```

**Why:** MIME type is already captured at upload, validated by multer, stored in DB, and passed through all layers.

### Pattern 2: Native API Capabilities Over Preprocessing

**What:** Use Gemini's native multi-page PDF support instead of splitting PDFs into images.

**Why:**
- Preserves page relationships (Gemini sees the document as a whole)
- Avoids image quality loss from PDF → image conversion
- Simpler architecture (no PDF splitting service)
- Faster processing (one API call vs N calls for N pages)

**Anti-Pattern:** Don't split PDF into page images unless Gemini API doesn't support PDFs (it does).

### Pattern 3: Format-Agnostic Result Processing

**What:** Webhook handler processes results without caring whether source was image or PDF.

**Why:** Result structure is identical. Multi-creditor splitting is content-based, not format-based.

**Example:**
```javascript
// Works for both images and PDFs
for (const docResult of results) {
    if (docResult.source_document_id) {
        // Multi-creditor split (child entry)
        createCreditorEntry(docResult);
    } else {
        // Standard document update
        updateDocument(docResult);
    }
}
```

### Pattern 4: Signed URL as Abstraction Layer

**What:** FastAPI downloads files via signed URLs, not direct GCS access.

**Why:**
- Decouples storage from processing
- Works for GCS, local storage, or any HTTP-accessible file
- 24h expiry provides security without credential sharing

**Current Implementation:**
```javascript
// Node.js generates signed URL
const signedUrl = await blob.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 24 * 60 * 60 * 1000
});

// FastAPI downloads via HTTP
response = requests.get(signed_url)
file_bytes = response.content
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: PDF Splitting Before Processing

**What:** Converting multi-page PDF into separate page images before sending to Gemini.

**Why bad:**
- Loses page context (Gemini can't see relationships between pages)
- Image quality degradation (PDF → PNG conversion)
- Increased API costs (N API calls for N pages)
- Increased latency (sequential processing)
- More complex architecture (needs PDF splitting service)

**Instead:** Pass entire PDF to Gemini via `application/pdf` MIME type.

### Anti-Pattern 2: Format-Specific Result Processing

**What:** Different webhook handlers for images vs PDFs.

**Why bad:**
- Duplicates logic
- Harder to maintain
- Breaks when adding new formats (DOCX, TIFF, etc.)

**Instead:** Single webhook handler that processes results based on content (is_creditor_document, creditor_count), not source format.

### Anti-Pattern 3: Client-Side Format Conversion

**What:** Having the browser or client app convert PDFs to images before upload.

**Why bad:**
- Pushes processing to client (bad UX)
- Unreliable (varies by browser/device)
- Wastes bandwidth (larger images)
- Loses metadata (embedded text, annotations)

**Instead:** Accept PDF uploads, let server-side handle format requirements.

### Anti-Pattern 4: MIME Type Validation in Multiple Layers

**What:** Checking MIME type in upload handler, queue service, FastAPI client, and processor.

**Why bad:**
- Hard to add new formats (must update N places)
- Inconsistent validation (one layer might reject, others accept)
- Violates single responsibility

**Instead:** Validate once at upload (multer fileFilter), pass MIME type through, validate again only at processing (where format matters).

---

## Scalability Considerations

| Concern | At 100 PDFs/day | At 1K PDFs/day | At 10K PDFs/day |
|---------|----------------|----------------|-----------------|
| **GCS Storage** | ~10GB/month (negligible cost) | ~100GB/month (~$2/mo) | ~1TB/month (~$20/mo) |
| **Processing Time** | 2-5min per PDF (Gemini latency) | Need queue with 2-5 workers | Need autoscaling FastAPI instances |
| **Queue Depth** | MongoDB queue sufficient | MongoDB queue sufficient | Consider Redis queue or Cloud Tasks |
| **Signed URL Expiry** | 24h works (processed within hours) | 24h works | Consider shorter expiry (6h) + cleanup |
| **Multi-Page Complexity** | Most PDFs < 10 pages | Need timeout increases for 50+ page PDFs | Consider page limit (e.g., max 100 pages) |

**Current Bottleneck:** Gemini API rate limits (15 RPM free tier, 60 RPM paid). Node.js queue already implements rate limiting (12 RPM).

**PDF-Specific Concern:** Multi-page PDFs take longer to process (Gemini must analyze all pages). Current timeout: 10 minutes per job. For 100-page PDFs, may need to increase to 20-30 minutes.

---

## New vs Modified Components

### Modified Components

| Component | File | Change Type | Complexity |
|-----------|------|-------------|------------|
| **Document Processor** | `document_processor.py` | Add PDF MIME type to `_load_image_as_part()` | **LOW** - 5 line change |

### New Components

**NONE.** All required infrastructure exists.

### Optional Enhancements (Post-MVP)

| Enhancement | Why Consider | Complexity |
|-------------|--------------|------------|
| **Page Count Validator** | Reject 500-page PDFs to avoid timeouts | LOW - Add in upload handler |
| **PDF Metadata Extractor** | Extract page count, creation date, author | LOW - Use PyPDF2 in FastAPI |
| **PDF Thumbnail Generator** | Show preview in UI | MEDIUM - Needs pdf2image + frontend |
| **Page Range Selector** | Let user select specific pages to process | HIGH - Requires PDF splitting |

---

## Build Order (Considering Dependencies)

### Phase 1: Core PDF Support (Milestone 1)
**Goal:** Process multi-page PDFs end-to-end

1. **FastAPI: Modify `_load_image_as_part()`**
   - Add `application/pdf` to supported MIME types
   - Create `genai.Part` with PDF bytes
   - Test with sample multi-page PDF
   - Dependencies: None (isolated function)

2. **Integration Test: Upload → Process → Webhook**
   - Upload multi-page PDF via Node.js
   - Verify FastAPI processes without errors
   - Verify webhook receives results
   - Dependencies: Step 1 complete

3. **Multi-Creditor Verification**
   - Upload PDF with 2+ creditors
   - Verify child entries created with `creditor_index`
   - Verify `final_creditor_list` merge
   - Dependencies: Step 2 complete

### Phase 2: Validation & Error Handling (Milestone 2)
**Goal:** Production-ready PDF processing

4. **Upload Validation**
   - Add page count check (reject > 100 pages)
   - Add file size check (reject > 50MB)
   - Return user-friendly errors
   - Dependencies: None (parallel to Phase 1)

5. **Timeout Adjustment**
   - Increase job timeout from 10min → 20min
   - Add monitoring for long-running jobs
   - Dependencies: Phase 1 complete (need metrics)

6. **Error Handling**
   - Handle corrupted PDFs gracefully
   - Retry logic for Gemini API errors
   - Zendesk ticket creation for failures
   - Dependencies: Phase 1 complete

### Phase 3: User Experience (Milestone 3)
**Goal:** Polish & observability

7. **Frontend Display**
   - Show PDF icon in document list
   - Display page count if available
   - Preview PDF in modal (browser native)
   - Dependencies: None (frontend-only)

8. **Monitoring & Metrics**
   - Track PDF processing time vs images
   - Alert on timeout rate > 5%
   - Dashboard for PDF-specific metrics
   - Dependencies: Phase 1 complete (need data)

---

## Integration Testing Strategy

### Test Case 1: Single-Page PDF
**Input:** 1-page PDF with 1 creditor
**Expected:** Identical behavior to JPEG upload
**Verifies:** Basic PDF support works

### Test Case 2: Multi-Page PDF (Same Creditor)
**Input:** 5-page PDF, all pages same creditor
**Expected:** Single creditor entry, all data extracted
**Verifies:** Multi-page processing works

### Test Case 3: Multi-Page PDF (Multiple Creditors)
**Input:** 10-page PDF, 3 different creditors
**Expected:** Source document + 3 child entries with `creditor_index`
**Verifies:** Multi-creditor splitting works for PDFs

### Test Case 4: Mixed Upload Batch
**Input:** Upload 2 JPEGs + 1 PDF simultaneously
**Expected:** All 3 processed independently, results merged in `final_creditor_list`
**Verifies:** Format-agnostic queue and webhook handling

### Test Case 5: Large PDF
**Input:** 50-page PDF (edge case)
**Expected:** Processes successfully or graceful timeout
**Verifies:** Timeout handling works

### Test Case 6: Corrupted PDF
**Input:** Invalid/corrupted PDF file
**Expected:** Processing fails, document marked as error, Zendesk ticket created
**Verifies:** Error handling works

---

## Migration Path

### Step 1: Deploy FastAPI Changes
- Update `document_processor.py` with PDF support
- Deploy to staging environment
- Test with sample PDFs

### Step 2: Enable in Production (Gradual Rollout)
- Update upload handler to show "PDF supported" in UI
- Monitor processing queue for errors
- Keep image processing unchanged (stable baseline)

### Step 3: Monitor & Iterate
- Track PDF processing success rate
- Adjust timeouts based on observed latency
- Add page count limits if needed

**Rollback Plan:** If PDF processing breaks, FastAPI can revert to image-only MIME type check. Node.js backend unchanged, so existing image uploads unaffected.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| Node.js Backend | **HIGH** | Already accepts PDFs, no changes needed |
| GCS Storage | **HIGH** | MIME-agnostic, already handles PDFs |
| Queue System | **HIGH** | Passes MIME type, no format-specific logic |
| FastAPI Integration Point | **HIGH** | Single function, well-defined change |
| Gemini API Support | **MEDIUM** | Training data confirms PDF support, but need to verify current API version |
| Multi-Creditor Logic | **HIGH** | Format-agnostic, content-based detection |
| Webhook Processing | **HIGH** | Format-agnostic, result structure unchanged |

**Overall Confidence:** **HIGH** - Architecture supports PDFs with minimal changes.

**Risk Factor:** Gemini API behavior with multi-page PDFs. Need to verify:
- Does Gemini analyze all pages or just first page?
- How does page context affect extraction accuracy?
- Are there token limits for large PDFs?

**Mitigation:** Prototype with 10-page PDF before full implementation.

---

## Sources

**Codebase Analysis:**
- `/Users/luka.s/Mandanten-Portal.9.2/server/middleware/upload.js` - Upload handling
- `/Users/luka.s/Mandanten-Portal.9.2/server/services/gcs-service.js` - GCS integration
- `/Users/luka.s/Mandanten-Portal.9.2/server/services/documentQueueService.js` - Queue system
- `/Users/luka.s/Mandanten-Portal.9.2/server/utils/fastApiClient.js` - FastAPI client
- `/Users/luka.s/Mandanten-Portal.9.2/server/controllers/webhookController.js` - Webhook handler
- `/Users/luka.s/Mandanten-Portal.9.2/server/models/DocumentProcessingJob.js` - Job schema

**Assumptions Based on Training Data:**
- Gemini AI supports `application/pdf` MIME type (verified in training data for Vertex AI SDK)
- `genai.Part.from_data()` accepts PDF bytes (standard pattern in Google AI SDKs)
- Multi-page PDF processing is native to Gemini (no splitting required)

**Unknown (Need Verification):**
- Current Gemini API version in FastAPI service
- Maximum page count supported
- Token limits for large PDFs
- Page-level vs document-level extraction behavior
