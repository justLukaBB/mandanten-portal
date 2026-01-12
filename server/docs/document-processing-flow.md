# Document Processing Flow Documentation

## Overview

This document describes the complete document upload and AI processing workflow, including the document upload endpoint and the AI processing webhook handler. The system allows clients to upload documents, which are then processed by a FastAPI AI service using Gemini AI to extract creditor information.

---

## Table of Contents

1. [Document Upload Endpoint](#document-upload-endpoint)
2. [AI Processing Webhook](#ai-processing-webhook)
3. [Complete Workflow](#complete-workflow)
4. [Data Structures](#data-structures)
5. [Status Transitions](#status-transitions)
6. [Error Handling](#error-handling)
7. [Integration Points](#integration-points)

---

## Document Upload Endpoint

### Endpoint Details

**URL:** `POST /api/clients/:clientId/documents`

**Location:** `server/server.js` (lines 1274-1464)

**Purpose:** Handles file uploads from clients, stores them in Google Cloud Storage (GCS), and triggers AI processing via FastAPI.

### Request

#### Headers
- `Content-Type: multipart/form-data`
- Authentication: Client token (if authentication middleware is enabled)

#### Parameters
- `clientId` (URL parameter): Client identifier (UUID or Aktenzeichen)

#### Body
- `documents` (multipart/form-data): Array of files (max 10 files)
  - Each file should be a valid document (PDF, image, etc.)

### Request Flow

1. **Client Validation**
   - Validates that the client exists in the database
   - Returns 404 if client not found

2. **File Processing Loop**
   For each uploaded file:
   - Generates a unique document ID (UUID)
   - Uploads file to Google Cloud Storage (GCS)
   - Creates a document record with metadata
   - Prepares file information for FastAPI processing

3. **Database Update**
   - Adds all document records to the client's `documents` array
   - Updates client status if needed:
     - `portal_access_sent` → `documents_uploaded`
   - Handles special case: documents uploaded after payment

4. **AI Processing Trigger**
   - Calls FastAPI service asynchronously (fire-and-forget)
   - Provides webhook URL for results callback
   - Updates document records with job ID on success
   - Marks documents as failed if FastAPI call fails

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "3 Dokument(e) erfolgreich hochgeladen. AI-Verarbeitung läuft im Hintergrund.",
  "documents": [
    {
      "id": "uuid-here",
      "name": "original-filename.pdf",
      "filename": "gcs-filename.pdf",
      "type": "application/pdf",
      "size": 123456,
      "uploadedAt": "2024-01-15T10:30:00.000Z",
      "url": "https://storage.googleapis.com/...",
      "processing_status": "processing",
      "document_status": "pending",
      "extracted_data": null
    }
  ]
}
```

#### Error Responses

**404 - Client Not Found**
```json
{
  "error": "Client not found"
}
```

**500 - Upload Error**
```json
{
  "error": "Fehler beim Hochladen der Dateien",
  "details": "Error message here"
}
```

### Document Record Structure (Initial)

```javascript
{
  id: "uuid-v4",                    // Unique document identifier
  name: "original-filename.pdf",     // Original filename from upload
  filename: "gcs-filename.pdf",     // Filename in GCS
  type: "application/pdf",          // MIME type
  size: 123456,                      // File size in bytes
  uploadedAt: "2024-01-15T10:30:00.000Z",  // ISO timestamp
  url: "https://storage.googleapis.com/...", // GCS URL
  processing_status: "processing",  // Initial status
  document_status: "pending",        // Initial document status
  extracted_data: null               // Will be populated by webhook
}
```

### Status Updates

The endpoint updates the client status in the following scenarios:

1. **Normal Upload Flow:**
   - If `current_status === 'portal_access_sent'` → Updates to `'documents_uploaded'`
   - Adds status history entry

2. **Post-Payment Upload:**
   - If `first_payment_received === true` and `payment_ticket_type === 'document_request'`
   - Updates `payment_ticket_type` to `'processing_wait'`
   - Sets `documents_uploaded_after_payment_at` timestamp
   - Adds status history entry

---

## AI Processing Webhook

### Endpoint Details

**URL:** `POST /api/webhooks/ai-processing`

**Location:** `server/routes/webhooks.js`

**Purpose:** Receives AI processing results from FastAPI service and updates document records with extracted data, classifications, and processing status.

### Request

#### Headers
- `Content-Type: application/json`
- Webhook signature verification (via `webhookVerifier.middleware`)

#### Body Structure
```json
{
  "job_id": "job-uuid-here",
  "client_id": "client-uuid-or-aktenzeichen",
  "status": "completed",
  "manual_review_required": false,
  "review_reasons": [],
  "results": [
    {
      "id": "document-uuid",
      "filename": "document.pdf",
      "processing_status": "completed",
      "document_status": "creditor_confirmed",
      "is_creditor_document": true,
      "confidence": 0.95,
      "manual_review_required": false,
      "extracted_data": {
        "creditor_data": {
          "creditor_name": "Example Creditor",
          "reference_number": "REF123",
          "amount": 1500.00,
          "currency": "EUR"
        }
      },
      "validation": {
        "requires_manual_review": false,
        "review_reasons": []
      },
      "summary": "Creditor document extracted successfully",
      "processing_time_ms": 2500
    }
  ],
  "summary": {
    "total_documents": 3,
    "processed": 3,
    "creditor_documents": 2,
    "errors": 0
  }
}
```

### Webhook Processing Flow

1. **Validation**
   - Verifies webhook signature
   - Validates required fields (`client_id`, `job_id`)
   - Finds client in database (by ID or Aktenzeichen)

2. **Document Status Determination**
   For each document result:
   - **Completed + Creditor Document:**
     - If `confidence >= 0.8` and `!manual_review_required` → `creditor_confirmed`
     - Otherwise → `needs_review`
   - **Completed + Non-Creditor Document:**
     - → `non_creditor_confirmed`
   - **Error Status:**
     - → `needs_review` with error reason

3. **Duplicate Detection**
   - Checks for duplicate reference numbers
   - Marks duplicates with `is_duplicate: true`
   - Updates status to `duplicate` if found

4. **Database Update**
   - Updates each document with processing results
   - **Preserves original fields:** `id`, `name`, `filename`, `type`, `size`, `url`, `uploadedAt`
   - **Updates processing fields:** All AI-extracted data and status fields
   - Converts Mongoose documents to plain objects to prevent field loss

5. **Client Status Updates**
   - Calculates processing statistics
   - Updates client status based on completion:
     - All docs completed + has creditors → `documents_completed`
     - All docs completed + no creditors → `no_creditors_found`
     - Some docs still processing → `documents_processing`

6. **Creditor Deduplication** (if applicable)
   - If all documents completed AND payment received
   - Deduplicates auto-approved creditor documents
   - Merges with existing `final_creditor_list`

7. **Auto-Confirmation Timer Reset**
   - If new documents require review after admin approval
   - Resets approval status and reverts to `creditor_review`

8. **Zendesk Ticket Creation** (async)
   - Creates tickets for documents requiring manual review
   - One ticket per document
   - Includes document link, context, and review instructions

9. **Internal Webhook Trigger** (async)
   - Triggers `processing-complete` webhook for other integrations

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "processed_documents": 3,
  "processing_time_ms": 150
}
```

#### Error Responses

**400 - Missing client_id**
```json
{
  "error": "Missing client_id"
}
```

**404 - Client Not Found**
```json
{
  "error": "Client not found"
}
```

**500 - Processing Failed**
```json
{
  "error": "Webhook processing failed",
  "details": "Error message here"
}
```

### Document Record Structure (After Webhook Update)

```javascript
{
  // Original fields (preserved)
  id: "uuid-v4",
  name: "original-filename.pdf",
  filename: "gcs-filename.pdf",
  type: "application/pdf",
  size: 123456,
  uploadedAt: "2024-01-15T10:30:00.000Z",
  url: "https://storage.googleapis.com/...",
  
  // Processing fields (updated by webhook)
  processing_status: "completed",
  document_status: "creditor_confirmed",  // or "needs_review", "non_creditor_confirmed", "duplicate"
  status_reason: "KI: Gläubigerdokument bestätigt (95% Sicherheit)",
  is_creditor_document: true,
  confidence: 0.95,
  classification_success: true,
  manual_review_required: false,
  is_duplicate: false,
  duplicate_reason: null,
  
  // Extracted data
  extracted_data: {
    creditor_data: {
      creditor_name: "Example Creditor",
      reference_number: "REF123",
      amount: 1500.00,
      currency: "EUR",
      // ... other extracted fields
    }
  },
  
  // Validation
  validation: {
    requires_manual_review: false,
    review_reasons: []
  },
  
  // Summary
  summary: "Creditor document extracted successfully",
  processing_error: null,
  processing_time_ms: 2500,
  processed_at: "2024-01-15T10:35:00.000Z",
  processing_method: "fastapi_gemini_ai",
  processing_job_id: "job-uuid-here"
}
```

---

## Complete Workflow

### Step-by-Step Flow Diagram

```
1. Client Uploads Documents
   ↓
2. POST /api/clients/:clientId/documents
   ↓
3. Files Uploaded to GCS
   ↓
4. Document Records Created in MongoDB
   ↓
5. FastAPI Job Created (async)
   ↓
6. FastAPI Processes Documents with AI
   ↓
7. FastAPI Sends Webhook to /api/webhooks/ai-processing
   ↓
8. Webhook Updates Document Records
   ↓
9. Client Status Updated
   ↓
10. Zendesk Tickets Created (if review needed)
   ↓
11. Internal Webhooks Triggered (if applicable)
```

### Detailed Flow Description

#### Phase 1: Upload (Document Upload Endpoint)

1. **Client Request**
   - Client sends multipart form data with files
   - Endpoint validates client exists

2. **File Storage**
   - Each file uploaded to Google Cloud Storage
   - GCS returns URL and filename
   - If GCS upload fails, file is skipped (logged but doesn't fail entire request)

3. **Database Initialization**
   - Document records created with initial metadata
   - Client status updated if transitioning from `portal_access_sent`
   - Status history recorded

4. **AI Processing Trigger**
   - FastAPI service called asynchronously
   - Webhook URL provided for callback
   - Job ID stored in documents on success

#### Phase 2: Processing (FastAPI Service)

1. **FastAPI Receives Job**
   - Processes documents using Gemini AI
   - Extracts creditor data
   - Classifies document types
   - Calculates confidence scores

2. **Results Prepared**
   - Processing results compiled
   - Validation performed
   - Review requirements determined

#### Phase 3: Webhook Update (AI Processing Webhook)

1. **Webhook Received**
   - Signature verified
   - Client located in database

2. **Document Processing**
   - Each result analyzed
   - Status determined based on confidence and review requirements
   - Duplicates detected and marked

3. **Database Update**
   - Documents updated with AI results
   - **Critical:** Original fields preserved, only processing fields updated
   - Client status recalculated

4. **Workflow Actions**
   - Creditor deduplication (if payment received)
   - Auto-confirmation timer reset (if needed)
   - Zendesk tickets created (async, for review)
   - Internal webhooks triggered (async)

---

## Data Structures

### Document Status Values

| Status | Description | When Set |
|--------|-------------|----------|
| `pending` | Initial status after upload | Upload endpoint |
| `processing` | Currently being processed by AI | Upload endpoint → Webhook |
| `completed` | Processing finished successfully | Webhook |
| `failed` | Processing failed | Upload endpoint (FastAPI error) |
| `creditor_confirmed` | Creditor document, high confidence | Webhook (confidence ≥ 0.8) |
| `needs_review` | Requires manual review | Webhook (low confidence or error) |
| `non_creditor_confirmed` | Not a creditor document | Webhook |
| `duplicate` | Duplicate reference number found | Webhook |

### Client Status Transitions

```
portal_access_sent
    ↓ (documents uploaded)
documents_uploaded
    ↓ (some docs processing)
documents_processing
    ↓ (all docs completed)
documents_completed (if creditors found)
no_creditors_found (if no creditors)
    ↓ (if review needed)
creditor_review
    ↓ (admin approved)
awaiting_client_confirmation
```

### Processing Status Values

| Status | Description |
|--------|-------------|
| `processing` | Document is being processed |
| `completed` | Processing finished |
| `error` | Processing failed |
| `failed` | FastAPI job creation failed |

---

## Status Transitions

### Document Status Flow

```
Upload → processing/pending
    ↓
FastAPI Processing
    ↓
Webhook Update → completed + creditor_confirmed/needs_review/non_creditor_confirmed
```

### Client Status Flow

```
portal_access_sent
    ↓ (upload endpoint)
documents_uploaded
    ↓ (webhook - some docs done)
documents_processing
    ↓ (webhook - all docs done)
documents_completed OR no_creditors_found
```

### Special Status Handling

1. **Post-Payment Upload:**
   - If documents uploaded after payment request
   - `payment_ticket_type` updated to `processing_wait`
   - `documents_uploaded_after_payment_at` timestamp set

2. **Auto-Confirmation Reset:**
   - If new documents need review after admin approval
   - Status reverts to `creditor_review`
   - `admin_approved` reset to `false`

---

## Error Handling

### Upload Endpoint Errors

1. **Client Not Found (404)**
   - Returns immediately
   - No files processed

2. **GCS Upload Failure**
   - File skipped, logged
   - Other files continue processing
   - Response includes successfully uploaded documents

3. **FastAPI Call Failure**
   - Documents marked as `failed`
   - `processing_error` field set
   - Client receives success response (files uploaded, processing failed)

4. **Database Update Failure**
   - Transaction rolled back
   - Error returned to client

### Webhook Errors

1. **Missing client_id (400)**
   - Webhook rejected
   - FastAPI should retry

2. **Client Not Found (404)**
   - Webhook rejected
   - FastAPI should retry or alert

3. **Processing Error (500)**
   - Error logged
   - Response sent to FastAPI
   - FastAPI may retry

4. **Zendesk Ticket Failure**
   - Logged but doesn't fail webhook
   - Document still updated
   - Manual ticket creation may be needed

### Error Recovery

- **FastAPI Retries:** FastAPI service should implement retry logic for failed webhooks
- **Manual Processing:** Documents with `needs_review` status can be manually processed
- **Reprocessing:** Documents can be reprocessed via admin endpoints

---

## Integration Points

### FastAPI Service

**Endpoint:** FastAPI processing service (external)

**Communication:**
- Upload endpoint calls `fastApiClient.createProcessingJob()`
- FastAPI sends webhook to `/api/webhooks/ai-processing`
- Webhook includes job results

**Configuration:**
- `FASTAPI_URL`: FastAPI service URL
- `FASTAPI_API_KEY`: API key for authentication
- `WEBHOOK_BASE_URL`: Base URL for webhook callbacks

### Google Cloud Storage (GCS)

**Service:** `gcs-service.js`

**Functions Used:**
- `uploadToGCS(file)`: Uploads file and returns URL and filename

**Storage:**
- Files stored in GCS bucket
- URLs stored in document records
- Used for document access and Zendesk ticket links

### Zendesk Service

**Service:** `services/zendesk.js`

**Triggered By:** Webhook when documents need manual review

**Ticket Content:**
- Client information
- Document details and GCS link
- Review reasons
- Agent portal link
- Action instructions

**Ticket Storage:**
- Ticket ID stored in `client.zendesk_tickets` array
- Linked to specific document IDs

### Internal Webhooks

**Endpoint:** `/api/zendesk-webhooks/processing-complete`

**Triggered By:** Webhook after successful processing

**Purpose:** Notify other systems of processing completion

**Payload:**
- `client_id`: Client identifier
- `document_id`: First processed document ID (optional)

### Creditor Deduplication

**Service:** `utils/creditorDeduplication.js`

**Triggered By:** Webhook when all documents completed AND payment received

**Process:**
1. Filters auto-approved creditor documents
2. Deduplicates by reference number
3. Merges with existing `final_creditor_list`
4. Uses `highest_amount` strategy

---

## Configuration

### Environment Variables

```bash
# FastAPI Configuration
FASTAPI_URL=http://localhost:8000
FASTAPI_API_KEY=your-api-key
FASTAPI_TIMEOUT=30000

# Webhook Configuration
WEBHOOK_BASE_URL=https://your-backend-url.com
BACKEND_URL=https://your-backend-url.com

# Processing Configuration
MANUAL_REVIEW_CONFIDENCE_THRESHOLD=0.8

# Frontend URL (for Zendesk tickets)
FRONTEND_URL=https://your-frontend-url.com
```

### Thresholds

- **MANUAL_REVIEW_CONFIDENCE_THRESHOLD:** Default 0.8 (80%)
  - Documents with confidence ≥ threshold and no manual review flag → `creditor_confirmed`
  - Documents with confidence < threshold or manual review flag → `needs_review`

---

## Security Considerations

### Webhook Verification

- All webhooks verified using `webhookVerifier.middleware`
- Signature validation prevents unauthorized webhook calls
- FastAPI must include valid signature in webhook requests

### File Upload Security

- File type validation (can be enabled via `validateFileUpload` middleware)
- Rate limiting (can be enabled via `rateLimits.upload` middleware)
- File size limits enforced by multer

### Database Security

- All updates use `safeClientUpdate` to prevent race conditions
- Mutex locks prevent concurrent updates to same client
- Mongoose document conversion prevents field loss

---

## Monitoring and Logging

### Log Points

**Upload Endpoint:**
- Upload start/completion
- File details
- GCS upload status
- FastAPI job creation
- Status updates

**Webhook:**
- Webhook received
- Processing results per document
- Status transitions
- Duplicate detection
- Zendesk ticket creation
- Processing time

### Key Metrics to Monitor

- Upload success rate
- GCS upload failures
- FastAPI job creation failures
- Webhook processing time
- Document processing success rate
- Manual review rate
- Duplicate detection rate

---

## Troubleshooting

### Common Issues

1. **Fields Lost After Webhook Update**
   - **Solution:** Ensure Mongoose documents are converted to plain objects using `toObject()`
   - **Check:** Verify `existingDocObj` conversion in webhook code

2. **Documents Not Updating**
   - **Check:** Document ID matching between upload and webhook
   - **Check:** Client ID matching (supports both UUID and Aktenzeichen)

3. **FastAPI Not Receiving Webhook**
   - **Check:** `WEBHOOK_BASE_URL` configuration
   - **Check:** Network connectivity
   - **Check:** Webhook signature verification

4. **Zendesk Tickets Not Created**
   - **Check:** Zendesk service configuration
   - **Check:** Async execution (tickets created in `setImmediate`)
   - **Check:** Error logs for Zendesk API failures

5. **Duplicate Detection Not Working**
   - **Check:** Reference number extraction in `extracted_data.creditor_data.reference_number`
   - **Check:** Document status must be `creditor_confirmed` or `needs_review` for duplicate check

---

## API Examples

### Upload Documents

```bash
curl -X POST \
  https://api.example.com/api/clients/123e4567-e89b-12d3-a456-426614174000/documents \
  -H "Authorization: Bearer client-token" \
  -F "documents=@file1.pdf" \
  -F "documents=@file2.pdf"
```

### Webhook Payload Example

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "manual_review_required": false,
  "review_reasons": [],
  "results": [
    {
      "id": "doc-uuid-1",
      "filename": "invoice.pdf",
      "processing_status": "completed",
      "document_status": "creditor_confirmed",
      "is_creditor_document": true,
      "confidence": 0.95,
      "manual_review_required": false,
      "extracted_data": {
        "creditor_data": {
          "creditor_name": "Example Creditor GmbH",
          "reference_number": "INV-2024-001",
          "amount": 1500.00,
          "currency": "EUR",
          "due_date": "2024-02-15"
        }
      },
      "validation": {
        "requires_manual_review": false,
        "review_reasons": []
      },
      "summary": "Creditor document extracted successfully",
      "processing_time_ms": 2500
    }
  ],
  "summary": {
    "total_documents": 1,
    "processed": 1,
    "creditor_documents": 1,
    "errors": 0
  }
}
```

---

## Version History

- **v1.0** (2024-01-15): Initial documentation
  - Document upload endpoint
  - AI processing webhook
  - Field preservation fix
  - Mongoose document conversion

---

## Related Documentation

- [FastAPI Client Documentation](../utils/fastApiClient.js)
- [Creditor Deduplication](../utils/creditorDeduplication.js)
- [Webhook Verifier](../utils/webhookVerifier.js)
- [GCS Service](../services/gcs-service.js)
- [Client Model](../models/Client.js)

