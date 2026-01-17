const express = require('express');
const router = express.Router();
const webhookVerifier = require('../utils/webhookVerifier');
const creditorDeduplication = require('../utils/creditorDeduplication');
const Client = require('../models/Client');
const { findCreditorByName } = require('../utils/creditorLookup');
const aiDedupScheduler = require('../services/aiDedupScheduler');

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
const createWebhookController = require('../controllers/webhookController');

/**
 * Webhook Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 */
module.exports = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook }) => {
  const controller = createWebhookController({
    Client,
    safeClientUpdate,
    getClient,
    triggerProcessingCompleteWebhook
  });

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

      // ✅ FIX: Update deduplicated_creditors with enriched values from documents
      // FastAPI sends deduplicated_creditors with values BEFORE enrichment
      // We need to sync them with the enriched document values
      if (normalizedDedupCreditors.length > 0) {
        console.log('[webhook] Syncing deduplicated_creditors with enriched document values...');

        normalizedDedupCreditors.forEach((dedupCreditor) => {
          // Find the corresponding document by reference number or sender name
          const matchingDoc = processedDocuments.find(doc => {
            const docCreditor = doc.extracted_data?.creditor_data;
            if (!docCreditor) return false;

            // Match by reference number (most reliable)
            if (docCreditor.reference_number && docCreditor.reference_number !== 'N/A' &&
                dedupCreditor.reference_number === docCreditor.reference_number) {
              return true;
            }

            // Fallback: match by sender name
            if (docCreditor.sender_name && docCreditor.sender_name !== 'N/A' &&
                dedupCreditor.sender_name === docCreditor.sender_name) {
              return true;
            }

            return false;
          });

          if (matchingDoc) {
            const enrichedCreditor = matchingDoc.extracted_data.creditor_data;

            // Update with enriched email values
            // Prefer 'email' field, fallback to 'sender_email'
            const bestEmail = (enrichedCreditor.email && enrichedCreditor.email !== 'N/A')
              ? enrichedCreditor.email
              : (enrichedCreditor.sender_email && enrichedCreditor.sender_email !== 'N/A')
                ? enrichedCreditor.sender_email
                : null;

            if (bestEmail) {
              dedupCreditor.email = bestEmail;
              dedupCreditor.sender_email = bestEmail;
            }

            // Update with enriched address values
            // Prefer 'address' field over 'sender_address' (avoids Postfach)
            const bestAddress = (enrichedCreditor.address && enrichedCreditor.address !== 'N/A')
              ? enrichedCreditor.address
              : (enrichedCreditor.sender_address && enrichedCreditor.sender_address !== 'N/A')
                ? enrichedCreditor.sender_address
                : null;

            if (bestAddress) {
              dedupCreditor.address = bestAddress;
              dedupCreditor.sender_address = bestAddress;
            }

            console.log('[webhook] Synced deduplicated creditor:', {
              name: dedupCreditor.sender_name,
              email_after: dedupCreditor.email,
              address_after: dedupCreditor.address,
              used_email_field: bestEmail ? (enrichedCreditor.email === bestEmail ? 'email' : 'sender_email') : 'none',
              used_address_field: bestAddress ? (enrichedCreditor.address === bestAddress ? 'address' : 'sender_address') : 'none'
            });
          }
        });
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

        // NEW: Instant Add for Late Uploads - Logic to auto-add to final list (Bypass Agent Review)
        if (
          (clientDoc.current_status === 'awaiting_client_confirmation' || clientDoc.current_status === 'client_confirmation') &&
          clientDoc.admin_approved
        ) {
          // Filter for ANY creditor document found in this batch
          const newCreditorDocs = processedDocuments.filter(doc => 
            doc.is_creditor_document === true
          );

          if (newCreditorDocs.length > 0) {
            console.log(`[webhook] Found ${newCreditorDocs.length} late uploads. Auto-adding to final list (Bypassing Review).`);
            
            // 1. Mark these documents as "reviewed" by system to prevent status revert
            newCreditorDocs.forEach(doc => {
              // Find the document in the client object and update it
              const originalDocIndex = clientDoc.documents.findIndex(d => d.id === doc.id);
              if (originalDocIndex !== -1) {
                clientDoc.documents[originalDocIndex].manually_reviewed = true;
                clientDoc.documents[originalDocIndex].document_status = 'creditor_confirmed'; // Force status to confirmed
                clientDoc.documents[originalDocIndex].status_reason = 'Late upload - Auto-added to list';
                clientDoc.documents[originalDocIndex].review_action = 'auto_confirmed';
              }
              
              // Also update the local object for current processing context
              doc.manually_reviewed = true; 
              doc.document_status = 'creditor_confirmed';
            });

            // 2. Extract creditor data 
            const newCreditors = creditorDeduplication.deduplicateCreditorsFromDocuments(
              newCreditorDocs,
              'highest_amount'
            );

            // 3. Add to final list
            if (newCreditors.length > 0) {
              const existingList = clientDoc.final_creditor_list || [];
              
              clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
                existingList,
                newCreditors,
                'highest_amount'
              );

              // Add status history entry
              clientDoc.status_history = clientDoc.status_history || [];
              clientDoc.status_history.push({
                id: uuidv4(),
                status: clientDoc.current_status,
                changed_by: 'system',
                metadata: {
                  reason: 'Late uploads auto-added (User Request)',
                  added_creditors_count: newCreditors.length,
                  document_ids: newCreditorDocs.map(d => d.id)
                },
                created_at: new Date(),
              });
            }
          }
        }

        // Existing auto-confirmation timer reset logic (kept)
        if (
          clientDoc.current_status === 'awaiting_client_confirmation' &&
          clientDoc.admin_approved &&
          clientDoc.admin_approved_at
        ) {
          const docsNeedingReview = clientDoc.documents.filter((doc) => {
            // Check if this document was just processed in this batch
            const isJustProcessed = processedDocuments.some(pd => pd.id === doc.id);
            if (!isJustProcessed) return false;

            const needsReview = doc.document_status === 'needs_review' || doc.manual_review_required === true;
            const notReviewed = !doc.manually_reviewed;
            return needsReview && notReviewed;
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

      // Schedule AI re-deduplication (30 minutes after upload)
      // This ensures cross-job deduplication works correctly
      if (normalizedDedupCreditors.length > 0) {
        console.log(`[webhook] Scheduling AI re-dedup for client ${client_id} in 30 minutes...`);
        aiDedupScheduler.scheduleAIRededup(client_id, getClient);
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
module.exports = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook }) => {
  const controller = createWebhookController({
    Client,
    safeClientUpdate,
    getClient,
    triggerProcessingCompleteWebhook
  });

  /**
   * Webhook receiver for FastAPI AI processing results
   * POST /webhooks/ai-processing
   */
  router.post(
    '/ai-processing',
    express.raw({ type: 'application/json' }),
    webhookVerifier.optionalMiddleware, // Temporarily allow unsigned webhooks for testing
    controller.handleAiProcessing
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

  return router;
};
