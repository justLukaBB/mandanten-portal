---
phase: 13-payment-handler-no-documents-case
plan: 01
subsystem: payment-handler, email-service
tags: [payment-handler, document-request, resend-email, idempotency, no-documents]
requires:
  - phase: 02-payment-status-logic
    provides: handleUserPaymentConfirmed method, payment_ticket_type enum
provides:
  - Payment handler branches on document existence before Gläubigeranalyse
  - Resend email sent to client asking for documents when none exist at payment confirmation
  - Idempotency via no_documents_email_sent flag prevents duplicate emails
  - Early return skips all Gläubigeranalyse + Zendesk ticket logic when no documents
affects:
  - phase: 14-auto-continuation-after-document-upload
    how: Phase 14 hooks into post-processing to auto-continue when documents arrive after payment
tech-stack:
  added: []
  modified: []
requirements-completed: [PAY-01, PAY-02, PAY-03]
---

## Summary

Added a document-existence branch to the payment handler so that when 1. Rate is confirmed and the client has no creditor documents, the system sends a Resend email asking the client to upload documents — instead of running the Gläubigeranalyse and creating a pointless Zendesk review ticket.

## Changes

### server/models/Client.js
- Added `no_documents_email_sent` (Boolean, default: false) field for idempotency tracking
- Added `no_documents_email_sent_at` (Date) field for audit trail

### server/services/emailService.js
- Added `generateDocumentRequestEmailHtml(clientName, portalUrl)` — German HTML email with Scuric branding, CTA button to portal
- Added `generateDocumentRequestEmailText(clientName, portalUrl)` — plain text fallback
- Added `sendDocumentRequestEmail(email, clientName, portalUrl)` — sends via Resend with dev mode console fallback, same pattern as `sendVerificationCode`

### server/controllers/zendeskWebhookController.js
- Added no-documents branch in `handleUserPaymentConfirmed` after loading `creditorDocs`/`creditors` (line ~521) but before `isMissingValue` helper
- Branch condition: `creditorDocs.length === 0 && creditors.length === 0`
- When triggered: sends document request email (once via idempotency guard), sets `payment_ticket_type: "document_request"`, returns early — no Gläubigeranalyse, no Zendesk ticket
- When documents exist: existing flow runs completely unchanged

## Verification

| Check | Result |
|-------|--------|
| PAY-01: No docs → Resend email sent | ✅ `sendDocumentRequestEmail` called in no-docs branch |
| PAY-02: No docs → No Zendesk ticket | ✅ Early `return res.json()` skips all Zendesk logic |
| PAY-03: Docs exist → Existing flow unchanged | ✅ Branch condition fails, code falls through to isMissingValue |
| Idempotency: Email sent once only | ✅ `no_documents_email_sent` flag checked before sending |
| No syntax errors | ✅ `node -e "require(…)"` passes |
| Branch before isMissingValue | ✅ Line 571 (return) < line 577 (isMissingValue) |
