const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const webhookVerifier = require('../utils/webhookVerifier');          
const creditorDeduplication = require('../utils/creditorDeduplication'); 
const Client = require('../models/Client');                           
const { findCreditorByName } = require('../utils/creditorLookup');

// Lazy load server functions to avoid circular dependency
let serverFunctions = null;
function getServerFunctions() {
  if (!serverFunctions) {
    serverFunctions = require('../server');
  }
  return serverFunctions;
}

const MANUAL_REVIEW_CONFIDENCE_THRESHOLD =
  parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8;



/**
 * Enrich a creditor document with contact info from local DB when missing.
 * Uses caching to avoid repeated lookups for identical names within a request.
 */
async function enrichCreditorContactFromDb(docResult, cache) {
  if (!docResult?.is_creditor_document) return;

  const isMissing = (val) => {
    if (val === undefined || val === null) return true;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return true;
      const lower = trimmed.toLowerCase();
      if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
    }
    return false;
  };

  const creditorData = docResult.extracted_data?.creditor_data || {};
  const missingEmail = isMissing(creditorData.email);
  const missingSenderEmail = isMissing(creditorData.sender_email);
  const missingAddress = isMissing(creditorData.address);
  const missingSenderAddress = isMissing(creditorData.sender_address);
  const needEmail = missingEmail || missingSenderEmail;
  const needAddress = missingAddress || missingSenderAddress;

  if (!needEmail && !needAddress) return;

  const candidateName =
    creditorData.sender_name ||
    creditorData.glaeubiger_name ||
    creditorData.creditor_name ||
    creditorData.name ||
    creditorData.creditor ||
    docResult.creditor_name ||
    docResult.sender_name ||
    docResult.name;

  if (!candidateName) return;

  const cacheKey = candidateName.toLowerCase().trim();
  let match = cache.get(cacheKey);
  if (match === undefined) {
    match = await findCreditorByName(candidateName);
    cache.set(cacheKey, match || null);
  }

  if (!match) return;

  const updatedCreditorData = { ...creditorData };
  const beforeEmail = updatedCreditorData.email;
  const beforeAddress = updatedCreditorData.address;
  const beforeSenderEmail = updatedCreditorData.sender_email;
  const beforeSenderAddress = updatedCreditorData.sender_address;

  if (match.email) {
    if (missingEmail) {
      updatedCreditorData.email = match.email;
    }
    if (missingSenderEmail) {
      updatedCreditorData.sender_email = match.email;
    }
  }
  if (match.address) {
    if (missingAddress) {
      updatedCreditorData.address = match.address;
    }
    if (missingSenderAddress) {
      updatedCreditorData.sender_address = match.address;
    }
  }

  const matchedId = match._id?.toString?.() || match.id || match._id;
  if (matchedId) {
    updatedCreditorData.creditor_database_id = matchedId;
  }
  updatedCreditorData.creditor_database_match = true;

  docResult.extracted_data = docResult.extracted_data || {};
  docResult.extracted_data.creditor_data = updatedCreditorData;

  console.log('[webhook] creditor enrichment applied', {
    name: candidateName,
    email_before: beforeEmail || null,
    email_after: updatedCreditorData.email || null,
    sender_email_before: beforeSenderEmail || null,
    sender_email_after: updatedCreditorData.sender_email || null,
    address_before: beforeAddress || null,
    address_after: updatedCreditorData.address || null,
    sender_address_before: beforeSenderAddress || null,
    sender_address_after: updatedCreditorData.sender_address || null,
    match_id: matchedId || null,
  });
}

/**
 * Webhook receiver for FastAPI AI processing results
 * POST /webhooks/ai-processing
 */
router.post(
  '/ai-processing',
  express.raw({ type: 'application/json' }),
  webhookVerifier.middleware,
  async (req, res) => {
    const startTime = Date.now();
    const rawBody = req.body.toString('utf8');

    console.log('\n📨 ================================');
    console.log('📨 WEBHOOK RECEIVED FROM FASTAPI');
    console.log('📨 ================================');
    console.log('📦 Raw body length:', rawBody.length, 'bytes');
    console.log('📄 Raw body preview:', rawBody.substring(0, 200));

    let data;
    try {
      data = JSON.parse(rawBody);
      console.log('✅ JSON parsed successfully');
    } catch (parseError) {
      console.log('❌ JSON parse error:', parseError.message);
      return res.status(400).json({
        error: 'Invalid JSON',
        details: parseError.message,
        preview: rawBody.substring(0, 100)
      });
    }

    const { safeClientUpdate, getClient, triggerProcessingCompleteWebhook, getIO } = getServerFunctions();

    try {
      const {
        job_id,
        client_id,
        status,
        manual_review_required,
        review_reasons,
        results,
        summary,
        deduplication,          
        deduplicated_creditors, 
      } = data;

      console.log(`\n🔔 WEBHOOK RECEIVED`);
      console.log(`🔑 Job ID: ${job_id}`);
      console.log(`👤 Client ID: ${client_id}`);
      console.log(`📊 Status: ${status}`);
      console.log(`⚠️ Manual Review Required: ${manual_review_required}`);
      console.log(`📄 Documents Processed: ${results?.length || 0}`);
      console.log(`📈 Summary: ${JSON.stringify(summary)}`);
      console.log(`🧹 Dedup (FastAPI): ${JSON.stringify(deduplication || {})}`);
      console.log(`👥 Deduped creditors (FastAPI): ${Array.isArray(deduplicated_creditors) ? deduplicated_creditors.length : 0}`);

      if (!client_id) {
        return res.status(400).json({ error: 'Missing client_id' });
      }

      let client = await Client.findOne({ id: client_id });
      if (!client) client = await Client.findOne({ aktenzeichen: client_id });
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Normalize deduplicated creditors (FastAPI) and ensure IDs exist for persistence
      const normalizedDedupCreditors = Array.isArray(deduplicated_creditors)
        ? deduplicated_creditors.map((c) => ({
            ...c,
            id: c.id || uuidv4(),
          }))
        : [];

      const processedDocuments = [];
      const creditorDocuments = [];
      const documentsNeedingReview = [];
      const creditorLookupCache = new Map();

      // Per-document status handling (kept as-is)
      for (const docResult of results || []) {
        let finalDocumentStatus = docResult.document_status || 'pending';
        let statusReason = '';

        if (docResult.processing_status === 'completed') {
          if (docResult.is_creditor_document) {
            const confidence = docResult.confidence || 0;
            if (confidence >= MANUAL_REVIEW_CONFIDENCE_THRESHOLD && !docResult.manual_review_required) {
              finalDocumentStatus = 'creditor_confirmed';
              statusReason = `KI: Gläubigerdokument bestätigt (${Math.round(confidence * 100)}% Sicherheit)`;
              creditorDocuments.push(docResult);
            } else {
              finalDocumentStatus = 'needs_review';
              statusReason = docResult.manual_review_required
                ? 'KI: Manuelle Prüfung erforderlich'
                : `KI: Niedrige Sicherheit (${Math.round(confidence * 100)}%)`;
              documentsNeedingReview.push(docResult);
            }
          } else {
            finalDocumentStatus = 'non_creditor_confirmed';
            statusReason = `KI: Kein Gläubigerdokument (${docResult.classification?.document_type || 'Unbekannt'})`;
          }
        } else if (docResult.processing_status === 'error') {
          finalDocumentStatus = 'needs_review';
          statusReason = `Verarbeitungsfehler: ${docResult.processing_error || docResult.error || 'Unbekannt'}`;
          documentsNeedingReview.push(docResult);
        }

        await enrichCreditorContactFromDb(docResult, creditorLookupCache);

        processedDocuments.push({
          ...docResult,
          document_status: finalDocumentStatus,
          status_reason: statusReason,
        });

        if (docResult.is_creditor_document) {
          const enrichedEmail = docResult.extracted_data?.creditor_data?.email;
          const enrichedSenderEmail = docResult.extracted_data?.creditor_data?.sender_email;
          const enrichedAddress = docResult.extracted_data?.creditor_data?.address;
          const enrichedSenderAddress = docResult.extracted_data?.creditor_data?.sender_address;
          if (enrichedEmail || enrichedAddress || enrichedSenderEmail || enrichedSenderAddress) {
            console.log('[webhook] creditor doc after enrichment', {
              doc_id: docResult.id,
              email: enrichedEmail || null,
              sender_email: enrichedSenderEmail || null,
              address: enrichedAddress || null,
              sender_address: enrichedSenderAddress || null,
            });
          }
        }
      }

      // Duplicate detection against existing docs (unchanged)
      for (const doc of processedDocuments) {
        if (
          doc.document_status === 'creditor_confirmed' &&
          doc.extracted_data?.creditor_data?.reference_number
        ) {
          const refNumber = doc.extracted_data.creditor_data.reference_number;
          const existingDoc = client.documents?.find(
            (d) =>
              d.id !== doc.id &&
              d.extracted_data?.creditor_data?.reference_number === refNumber &&
              (d.document_status === 'creditor_confirmed' || d.document_status === 'needs_review')
          );
          if (existingDoc) {
            doc.is_duplicate = true;
            doc.duplicate_reason = `Duplikat gefunden - Referenznummer "${refNumber}" bereits vorhanden in "${existingDoc.name}"`;
            doc.document_status = 'duplicate';
          }
        }
      }

      // Persist documents + merge FastAPI-deduped creditors into final_creditor_list
      await safeClientUpdate(client_id, (clientDoc) => {
        // Handle multi-creditor splits and standard updates (kept as in your snippet)
        for (const docResult of processedDocuments) {
          if (docResult.source_document_id) {
            const sourceDoc = clientDoc.documents.find((d) => d.id === docResult.source_document_id);
            if (sourceDoc) {
              const creditorName =
                docResult.extracted_data?.creditor_data?.sender_name ||
                docResult.extracted_data?.creditor_data?.glaeubiger_name ||
                `Creditor ${docResult.creditor_index}`;
              const displayName = `${sourceDoc.name} - Gläubiger ${docResult.creditor_index}/${docResult.creditor_count}: ${creditorName}`;

              const newCreditorEntry = {
                id: docResult.id,
                name: displayName,
                filename: sourceDoc.filename,
                type: sourceDoc.type,
                size: sourceDoc.size,
                url: sourceDoc.url,
                uploadedAt: sourceDoc.uploadedAt,
                source_document_id: docResult.source_document_id,
                creditor_index: docResult.creditor_index,
                creditor_count: docResult.creditor_count,
                hidden_from_portal: true,
                processing_status: docResult.processing_status,
                document_status: docResult.document_status,
                status_reason: docResult.status_reason,
                is_creditor_document: docResult.is_creditor_document,
                confidence: docResult.confidence,
                classification_success: docResult.classification_success,
                manual_review_required: docResult.manual_review_required,
                is_duplicate: docResult.is_duplicate || false,
                duplicate_reason: docResult.duplicate_reason,
                extracted_data: docResult.extracted_data,
                validation: docResult.validation,
                summary: docResult.summary,
                processing_error: docResult.processing_error || docResult.error,
                processing_time_ms: docResult.processing_time_ms,
                processed_at: new Date().toISOString(),
                processing_method: 'fastapi_gemini_ai',
                processing_job_id: job_id,
              };

              clientDoc.documents.push(newCreditorEntry);
            }
          } else {
            const idx = clientDoc.documents.findIndex((d) => d.id === docResult.id);
            if (idx !== -1) {
              const existingDoc = clientDoc.documents[idx];
              const existingObj = existingDoc.toObject ? existingDoc.toObject() : existingDoc;
              clientDoc.documents[idx] = {
                ...existingObj,
                id: existingDoc.id,
                name: existingDoc.name,
                filename: existingDoc.filename,
                type: existingDoc.type,
                size: existingDoc.size,
                url: existingDoc.url,
                uploadedAt: existingDoc.uploadedAt,
                processing_status: docResult.processing_status,
                document_status: docResult.document_status,
                status_reason: docResult.status_reason,
                is_creditor_document: docResult.is_creditor_document,
                confidence: docResult.confidence,
                classification_success: docResult.classification_success,
                manual_review_required: docResult.manual_review_required,
                is_duplicate: docResult.is_duplicate || false,
                duplicate_reason: docResult.duplicate_reason,
                extracted_data: docResult.extracted_data,
                validation: docResult.validation,
                summary: docResult.summary,
                processing_error: docResult.processing_error || docResult.error,
                processing_time_ms: docResult.processing_time_ms,
                processed_at: new Date().toISOString(),
                processing_method: 'fastapi_gemini_ai',
                processing_job_id: job_id,
              };
            }
          }
        }

        // Update source documents for multi-creditor splits (kept)
        const sourceDocumentIds = new Set();
        const creditorEntriesBySource = new Map();
        clientDoc.documents.forEach((doc) => {
          if (doc.source_document_id) {
            sourceDocumentIds.add(doc.source_document_id);
            if (!creditorEntriesBySource.has(doc.source_document_id)) {
              creditorEntriesBySource.set(doc.source_document_id, []);
            }
            creditorEntriesBySource.get(doc.source_document_id).push(doc);
          }
        });
        sourceDocumentIds.forEach((sourceId) => {
          const sourceDocIndex = clientDoc.documents.findIndex((d) => d.id === sourceId);
          if (sourceDocIndex !== -1) {
            const creditorEntries = creditorEntriesBySource.get(sourceId) || [];
            const needsReviewCount = creditorEntries.filter((c) => c.document_status === 'needs_review').length;
            const confirmedCount = creditorEntries.filter((c) => c.document_status === 'creditor_confirmed').length;
            let overallStatus = 'creditor_confirmed';
            let overallReason = `${creditorEntries.length} Gläubiger erkannt`;
            if (needsReviewCount > 0) {
              overallStatus = 'needs_review';
              overallReason = `${needsReviewCount} von ${creditorEntries.length} Gläubigern benötigen Prüfung`;
            }
            clientDoc.documents[sourceDocIndex].processing_status = 'completed';
            clientDoc.documents[sourceDocIndex].document_status = overallStatus;
            clientDoc.documents[sourceDocIndex].status_reason = overallReason;
            clientDoc.documents[sourceDocIndex].is_creditor_document = true;
            clientDoc.documents[sourceDocIndex].creditor_count = creditorEntries.length;
          }
        });

        // Stats and status updates (kept)
        const completedDocs = clientDoc.documents.filter((doc) => doc.processing_status === 'completed');
        const creditorDocs = completedDocs.filter((doc) => doc.is_creditor_document === true);
        const totalDocs = clientDoc.documents.length;
        const allDocsCompleted = completedDocs.length === totalDocs && totalDocs > 0;

        if (clientDoc.current_status === 'documents_uploaded' && completedDocs.length > 0) {
          if (allDocsCompleted) {
            if (creditorDocs.length > 0) {
              clientDoc.current_status = 'documents_completed';
            } else {
              clientDoc.current_status = 'no_creditors_found';
            }
            clientDoc.status_history = clientDoc.status_history || [];
            clientDoc.status_history.push({
              id: uuidv4(),
              status: clientDoc.current_status,
              changed_by: 'system',
              metadata: {
                total_documents: totalDocs,
                completed_documents: completedDocs.length,
                creditor_documents: creditorDocs.length,
                processing_job_id: job_id,
                processing_completed_timestamp: new Date().toISOString(),
              },
              created_at: new Date(),
            });
          } else {
            clientDoc.current_status = 'documents_processing';
          }
        }

        // Node-side merge of FastAPI-deduped creditors (cross-job guard)
        if (normalizedDedupCreditors.length > 0) {
          const existing = clientDoc.final_creditor_list || [];
          clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
            existing,
            normalizedDedupCreditors,
            'highest_amount'
          );
          clientDoc.deduplication_stats =
            deduplication || {
              original_count: normalizedDedupCreditors.length,
              unique_count: normalizedDedupCreditors.length,
              duplicates_removed: 0,
            };
        }

        // Existing auto-confirmation timer reset logic (kept)
        if (
          clientDoc.current_status === 'awaiting_client_confirmation' &&
          clientDoc.admin_approved &&
          clientDoc.admin_approved_at
        ) {
          const docsNeedingReview = clientDoc.documents.filter((doc) => {
            const uploadedAfterApproval = new Date(doc.uploadedAt) > new Date(clientDoc.admin_approved_at);
            const needsReview = doc.document_status === 'needs_review' || doc.manual_review_required === true;
            const notReviewed = !doc.manually_reviewed;
            return uploadedAfterApproval && needsReview && notReviewed;
          });
          if (docsNeedingReview.length > 0) {
            clientDoc.current_status = 'creditor_review';
            clientDoc.admin_approved = false;
            clientDoc.admin_approved_at = null;
            clientDoc.status_history.push({
              id: uuidv4(),
              status: 'reverted_to_creditor_review',
              changed_by: 'system',
              metadata: {
                reason: 'New documents processed requiring agent review',
                documents_needing_review: docsNeedingReview.length,
                auto_confirmation_timer_reset: true,
              },
              created_at: new Date(),
            });
          }
        }

        // Payment + all docs complete flow (keep your existing behavior)
        if (allDocsCompleted && clientDoc.first_payment_received) {
          const autoApprovedCreditorDocs = completedDocs.filter(
            (doc) =>
              doc.is_creditor_document === true &&
              !doc.validation?.requires_manual_review &&
              !doc.manual_review_required &&
              doc.document_status === 'creditor_confirmed'
          );
          if (autoApprovedCreditorDocs.length > 0) {
            const dedupedFromDocs = creditorDeduplication.deduplicateCreditorsFromDocuments(
              autoApprovedCreditorDocs,
              'highest_amount'
            );
            const existingCreditors = clientDoc.final_creditor_list || [];
            const mergedCreditors = creditorDeduplication.mergeCreditorLists(
              existingCreditors,
              dedupedFromDocs,
              'highest_amount'
            );
            clientDoc.final_creditor_list = mergedCreditors;
          }
        }

        return clientDoc;
      });

      // Emit live update to admin sockets
      const io = getIO ? getIO() : null;
      if (io) {
        try {
          const latestClient = await getClient(client_id);
          io.to(`client:${client_id}`).emit('client_updated', {
            client_id,
            documents: latestClient.documents || [],
            final_creditor_list: latestClient.final_creditor_list || [],
            deduplication_stats: latestClient.deduplication_stats || null,
          });
        } catch (emitErr) {
          console.error('❌ Socket emit failed:', emitErr.message || emitErr);
        }
      }

      // Zendesk logic (kept)
      if (documentsNeedingReview.length > 0) {
        const updatedClient = await getClient(client_id);
        const docsByReason = {};
        documentsNeedingReview.forEach((doc) => {
          const reason =
            doc.status_reason || doc.validation?.review_reasons?.join(', ') || 'Manuelle Prüfung erforderlich';
          if (!docsByReason[reason]) docsByReason[reason] = [];
          docsByReason[reason].push(doc);
        });

        setImmediate(async () => {
          try {
            const ZendeskService = require('../services/zendeskService');
            const zendeskService = new ZendeskService();
            const clientForTicket = await getClient(client_id);
            for (const doc of documentsNeedingReview) {
              const docRecord = clientForTicket.documents?.find((d) => d.id === doc.id);
              const gcsUrl = docRecord?.url || docRecord?.gcs_path || 'N/A';
              const originalName = doc.filename || doc.name || 'Unbekanntes Dokument';
              const reviewReasons =
                doc.validation?.review_reasons ||
                (doc.status_reason ? [doc.status_reason] : []) ||
                ['Manuelle Prüfung erforderlich'];

              const ticketResult = await zendeskService.createTicket({
                subject: `🔄 Dokumentprüfung erforderlich: ${clientForTicket.firstName} ${clientForTicket.lastName} (${clientForTicket.aktenzeichen})`,
                content: `**🔄 DOKUMENTPRÜFUNG ERFORDERLICH**
👤 Client: ${clientForTicket.firstName} ${clientForTicket.lastName}
📧 Email: ${clientForTicket.email}
📁 Aktenzeichen: ${clientForTicket.aktenzeichen}
📄 Dokument: ${originalName}
⚠️ Gründe: ${reviewReasons.map((r) => `• ${r}`).join('\n')}
🔗 GCS: ${gcsUrl}
Job ID: ${job_id}`,
                requesterEmail: clientForTicket.email,
                tags: ['document-review', 'ai-processing', 'manual-review-required', 'creditor-documents'],
                priority: 'normal',
              });

              if (ticketResult.success) {
                await safeClientUpdate(client_id, (clientDoc) => {
                  clientDoc.zendesk_tickets = clientDoc.zendesk_tickets || [];
                  clientDoc.zendesk_tickets.push({
                    ticket_id: ticketResult.ticket_id,
                    ticket_type: 'creditor_review',
                    ticket_scenario: 'document_review',
                    status: 'open',
                    created_at: new Date(),
                    document_ids: [doc.id],
                  });
                  return clientDoc;
                });
              }
            }
          } catch (zendeskError) {
            console.error(`❌ Failed to create Zendesk ticket:`, zendeskError);
          }
        });
      }

      if (status === 'completed' || status === 'partial') {
        const firstDocId = processedDocuments[0]?.id;
        setImmediate(async () => {
          try {
            const { triggerProcessingCompleteWebhook } = getServerFunctions();
            await triggerProcessingCompleteWebhook(client_id, firstDocId);
          } catch (err) {
            console.error('Failed to trigger internal webhook:', err);
          }
        });
      }

      const processingTime = Date.now() - startTime;
      return res.json({
        success: true,
        message: 'Webhook processed successfully',
        processed_documents: processedDocuments.length,
        processing_time_ms: processingTime,
        deduplication: deduplication || null,
        deduplicated_creditors: deduplicated_creditors || [],
      });
    } catch (error) {
      console.error('Webhook processing failed', error);
      return res.status(500).json({ error: 'Webhook processing failed', details: error.message });
    }
  }
);

/** Health check */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: ['POST /webhooks/ai-processing'],
  });
});

module.exports = router;

