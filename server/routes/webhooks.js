
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Import utilities (adjust paths as needed)
const webhookVerifier = require('../utils/webhookVerifier');
const creditorDeduplication = require('../utils/creditorDeduplication');
const Client = require('../models/Client');

// Lazy load server functions to avoid circular dependency
// These will be loaded when first used
let serverFunctions = null;
function getServerFunctions() {
  if (!serverFunctions) {
    serverFunctions = require('../server');
  }
  return serverFunctions;
}

// These should be imported from your existing project
// const { getClient, safeClientUpdate, saveClient } = require('../utils/database');
// const { triggerProcessingCompleteWebhook } = require('../utils/webhooks');
// const zendeskService = require('../services/zendesk');

// Configuration
const MANUAL_REVIEW_CONFIDENCE_THRESHOLD = parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8;

/**
 * Webhook receiver for FastAPI AI processing results
 * 
 * POST /webhooks/ai-processing
 */
router.post('/ai-processing',
  express.raw({ type: 'application/json' }),
  webhookVerifier.middleware,
  async (req, res) => {
    const startTime = Date.now();
    const rawBody = req.body.toString('utf8');
    const data = JSON.parse(rawBody);
    
    // Load server functions once to avoid repeated lazy loading
    const { safeClientUpdate, getClient, triggerProcessingCompleteWebhook } = getServerFunctions();
    
    try {
      const {
        job_id,
        client_id,
        status,
        manual_review_required,
        review_reasons,
        results,
        summary
      } = data;
      
      console.log(`\n🔔 ================================`);
      console.log(`🔔 WEBHOOK RECEIVED - AI PROCESSING`);
      console.log(`🔔 ================================`);
      console.log(`🔑 Job ID: ${job_id}`);
      console.log(`👤 Client ID: ${client_id}`);
      console.log(`📊 Status: ${status}`);
      console.log(`⚠️  Manual Review Required: ${manual_review_required}`);
      console.log(`📄 Documents Processed: ${results?.length || 0}`);
      console.log(`📈 Summary: ${JSON.stringify(summary)}`);
      console.log(`⏰ Received at: ${new Date().toISOString()}`);
      
      // Validate required fields
      if (!client_id) {
        console.log(`❌ Missing client_id in webhook payload`);
        return res.status(400).json({ error: 'Missing client_id' });
      }
      
      // Get client
     
      let client = await Client.findOne({ id: client_id });
    if (!client) {
      client = await Client.findOne({ aktenzeichen: client_id });
    }
      if (!client) {
        console.log(`❌ Client not found: ${client_id}`);
        return res.status(404).json({ error: 'Client not found' });
      }
      
      console.log(`\n📋 PROCESSING RESULTS:`);
      
      // Process each document result
      const processedDocuments = [];
      const creditorDocuments = [];
      const documentsNeedingReview = [];
      
      for (const docResult of (results || [])) {
        console.log(`\n📄 Document: ${docResult.filename}`);
        console.log(`   ID: ${docResult.id}`);
        console.log(`   Processing Status: ${docResult.processing_status}`);
        console.log(`   Document Status: ${docResult.document_status}`);
        console.log(`   Is Creditor: ${docResult.is_creditor_document}`);
        console.log(`   Confidence: ${docResult.confidence}`);
        console.log(`   Manual Review: ${docResult.manual_review_required}`);
        
        // Determine final document status based on AI results
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
        
        console.log(`   Final Status: ${finalDocumentStatus}`);
        console.log(`   Status Reason: ${statusReason}`);
        
        processedDocuments.push({
          ...docResult,
          document_status: finalDocumentStatus,
          status_reason: statusReason
        });
      }

      // NEW: Handle multiple creditors per document
      // If a document contains multiple creditors, create separate entries for each
      const expandedDocuments = [];
      for (const doc of processedDocuments) {
        const creditors = doc.extracted_data?.creditors;

        // Check if document has multiple creditors
        if (creditors && Array.isArray(creditors) && creditors.length > 1) {
          console.log(`\n🔄 MULTI-CREDITOR DOCUMENT DETECTED: ${doc.filename}`);
          console.log(`   Splitting into ${creditors.length} separate entries`);

          // Create a separate document entry for each creditor
          for (let i = 0; i < creditors.length; i++) {
            const creditor = creditors[i];

            // Use per-creditor validation flags
            const creditorNeedsReview = creditor.manual_review_required || false;
            const creditorReviewReasons = creditor.review_reasons || [];

            // Determine status for this specific creditor
            let creditorStatus = doc.document_status;
            let creditorStatusReason = doc.status_reason;

            if (doc.is_creditor_document && doc.processing_status === 'completed') {
              const confidence = doc.confidence || 0;

              if (creditorNeedsReview) {
                // This specific creditor needs review
                creditorStatus = 'needs_review';
                creditorStatusReason = `KI: ${creditorReviewReasons.join(', ')}`;
              } else if (confidence >= MANUAL_REVIEW_CONFIDENCE_THRESHOLD) {
                // This creditor is auto-approved
                creditorStatus = 'creditor_confirmed';
                creditorStatusReason = `KI: Gläubigerdokument bestätigt (${Math.round(confidence * 100)}% Sicherheit)`;
              } else {
                // Low confidence
                creditorStatus = 'needs_review';
                creditorStatusReason = `KI: Niedrige Sicherheit (${Math.round(confidence * 100)}%)`;
              }
            }

            const creditorDoc = {
              ...doc,
              id: `${doc.id}-creditor-${i+1}`,  // Unique ID for each creditor entry
              source_document_id: doc.id,  // Link back to original document
              creditor_index: i + 1,
              creditor_count: creditors.length,
              // Override with per-creditor status
              document_status: creditorStatus,
              status_reason: creditorStatusReason,
              manual_review_required: creditorNeedsReview,
              // Set extracted_data.creditor_data to this specific creditor
              extracted_data: {
                ...doc.extracted_data,
                creditor_data: creditor,  // Single creditor for this entry
                // Keep legacy fields from this creditor
                Gläubiger_Name: creditor.glaeubiger_name || "N/A",
                Aktenzeichen: creditor.reference_number || "N/A",
                Gläubiger_Adresse: creditor.glaeubiger_adresse || "N/A",
                Gläubigervertreter_Name: creditor.glaeubiger_vertreter_name || "N/A",
                Gläubigervertreter_Adresse: creditor.glaeubiger_vertreter_adresse || "N/A",
                Forderungsbetrag: creditor.claim_amount_raw || "N/A",
                Email_Gläubiger: creditor.sender_email || "N/A",
                Email_Gläubiger_Vertreter: creditor.glaeubiger_vertreter_email || "N/A"
              },
              summary: `Creditor ${i+1}/${creditors.length}: ${creditor.sender_name || creditor.glaeubiger_name || 'N/A'}`
            };

            const reviewFlag = creditorNeedsReview ? '⚠️ REVIEW' : '✅ AUTO';
            console.log(`   [${i+1}/${creditors.length}] ${reviewFlag} ${creditor.sender_name || creditor.glaeubiger_name} (Ref: ${creditor.reference_number})`);
            expandedDocuments.push(creditorDoc);
          }
        } else {
          // Single creditor or no creditors - keep as-is
          expandedDocuments.push(doc);
        }
      }

      console.log(`\n📊 EXPANDED DOCUMENTS: ${processedDocuments.length} → ${expandedDocuments.length}`);

      // Replace processedDocuments with expanded list
      processedDocuments.length = 0;
      processedDocuments.push(...expandedDocuments);

      // Check for duplicates against existing documents
      for (const doc of processedDocuments) {
        if (doc.document_status === 'creditor_confirmed' && 
            doc.extracted_data?.creditor_data?.reference_number) {
          
          const refNumber = doc.extracted_data.creditor_data.reference_number;
          const existingDoc = client.documents?.find(d => 
            d.id !== doc.id && 
            d.extracted_data?.creditor_data?.reference_number === refNumber &&
            (d.document_status === 'creditor_confirmed' || d.document_status === 'needs_review')
          );
          
          if (existingDoc) {
            doc.is_duplicate = true;
            doc.duplicate_reason = `Duplikat gefunden - Referenznummer "${refNumber}" bereits vorhanden in "${existingDoc.name}"`;
            doc.document_status = 'duplicate';
            console.log(`⚠️  Duplicate detected: ${doc.filename} (ref: ${refNumber})`);
          }
        }
      }
      
      // Update client documents in MongoDB
      await safeClientUpdate(client_id, (client) => {
        // Update each processed document
        for (const docResult of processedDocuments) {
          // Check if this is a multi-creditor split entry
          if (docResult.source_document_id) {
            // This is a creditor entry split from a multi-creditor document
            // Find the source document to copy metadata
            const sourceDoc = client.documents.find(d => d.id === docResult.source_document_id);

            if (sourceDoc) {
              // Create a new document entry for this creditor
              const newCreditorEntry = {
                id: docResult.id,
                name: sourceDoc.name,
                filename: sourceDoc.filename,
                type: sourceDoc.type,
                size: sourceDoc.size,
                url: sourceDoc.url,
                uploadedAt: sourceDoc.uploadedAt,
                // Multi-creditor metadata
                source_document_id: docResult.source_document_id,
                creditor_index: docResult.creditor_index,
                creditor_count: docResult.creditor_count,
                // Processing results
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
                processing_job_id: job_id
              };

              // Add as new entry
              client.documents.push(newCreditorEntry);
              console.log(`✅ Added multi-creditor entry [${docResult.creditor_index}/${docResult.creditor_count}]: ${docResult.summary}`);
            } else {
              console.log(`⚠️  Source document not found for multi-creditor entry: ${docResult.source_document_id}`);
            }
          } else {
            // Standard single-creditor document update
            const docIndex = client.documents.findIndex(d => d.id === docResult.id);

            if (docIndex !== -1) {
              // Update existing document - preserve all original fields
              const existingDoc = client.documents[docIndex];

              // Convert Mongoose document to plain object if needed
              const existingDocObj = existingDoc.toObject ? existingDoc.toObject() : existingDoc;

              // Update only processing-related fields while preserving all original fields
              client.documents[docIndex] = {
                ...existingDocObj, // Preserve all existing fields first (as plain object)
                // Explicitly ensure key metadata fields are preserved
                id: existingDoc.id,
                name: existingDoc.name,
                filename: existingDoc.filename,
                type: existingDoc.type,
                size: existingDoc.size,
                url: existingDoc.url,
                uploadedAt: existingDoc.uploadedAt,
                // Update only processing-related fields
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
                processing_job_id: job_id
              };

              console.log(`✅ Updated document: ${docResult.filename} -> ${docResult.document_status}`);
            } else {
              console.log(`⚠️  Document not found in client: ${docResult.id}`);
            }
          }
        }
        
        // Calculate processing stats
        const completedDocs = client.documents.filter(doc => doc.processing_status === 'completed');
        const creditorDocs = completedDocs.filter(doc => doc.is_creditor_document === true);
        const totalDocs = client.documents.length;
        const allDocsCompleted = completedDocs.length === totalDocs && totalDocs > 0;
        
        console.log(`\n📊 PROCESSING STATS:`);
        console.log(`   Total documents: ${totalDocs}`);
        console.log(`   Completed: ${completedDocs.length}`);
        console.log(`   Creditor docs: ${creditorDocs.length}`);
        console.log(`   All completed: ${allDocsCompleted}`);
        
        // Update client status
        if (client.current_status === 'documents_uploaded' && completedDocs.length > 0) {
          if (allDocsCompleted) {
            if (creditorDocs.length > 0) {
              client.current_status = 'documents_completed';
              console.log(`✅ Status updated to 'documents_completed'`);
            } else {
              client.current_status = 'no_creditors_found';
              console.log(`⚠️  Status updated to 'no_creditors_found'`);
            }
            
            // Add status history
            client.status_history = client.status_history || [];
            client.status_history.push({
              id: uuidv4(),
              status: client.current_status,
              changed_by: 'system',
              metadata: {
                total_documents: totalDocs,
                completed_documents: completedDocs.length,
                creditor_documents: creditorDocs.length,
                processing_job_id: job_id,
                processing_completed_timestamp: new Date().toISOString()
              },
              created_at: new Date()
            });
          } else {
            client.current_status = 'documents_processing';
            console.log(`📊 Status updated to 'documents_processing'`);
          }
        }
        
        // Handle creditor deduplication if payment received and all docs processed
        if (allDocsCompleted && client.first_payment_received) {
          console.log(`\n🎯 ================================`);
          console.log(`🎯 PAYMENT + DOCUMENTS COMPLETE`);
          console.log(`🎯 ================================`);
          
          // Filter auto-approved creditor documents (high confidence, no manual review)
          const autoApprovedCreditorDocs = completedDocs.filter(doc =>
            doc.is_creditor_document === true &&
            !doc.validation?.requires_manual_review &&
            !doc.manual_review_required &&
            doc.document_status === 'creditor_confirmed'
          );
          
          console.log(`📄 Auto-approved creditor docs: ${autoApprovedCreditorDocs.length}`);
          
          if (autoApprovedCreditorDocs.length > 0) {
            // Deduplicate creditors from documents
            const deduplicatedCreditors = creditorDeduplication.deduplicateCreditorsFromDocuments(
              autoApprovedCreditorDocs,
              'highest_amount'
            );
            
            // Merge with existing final_creditor_list
            const existingCreditors = client.final_creditor_list || [];
            const mergedCreditors = creditorDeduplication.mergeCreditorLists(
              existingCreditors,
              deduplicatedCreditors,
              'highest_amount'
            );
            
            client.final_creditor_list = mergedCreditors;
            
            console.log(`✅ Final creditor list updated: ${mergedCreditors.length} creditors`);
            console.log(`🗑️  Duplicates removed: ${autoApprovedCreditorDocs.length - deduplicatedCreditors.length}`);
          }
        }
        
        // Check for auto-confirmation timer reset
        if (client.current_status === 'awaiting_client_confirmation' && 
            client.admin_approved && 
            client.admin_approved_at) {
          
          const docsNeedingReview = client.documents.filter(doc => {
            const uploadedAfterApproval = new Date(doc.uploadedAt) > new Date(client.admin_approved_at);
            const needsReview = doc.document_status === 'needs_review' || 
                               doc.manual_review_required === true;
            const notReviewed = !doc.manually_reviewed;
            
            return uploadedAfterApproval && needsReview && notReviewed;
          });
          
          if (docsNeedingReview.length > 0) {
            console.log(`🔄 ${docsNeedingReview.length} new docs require review - resetting timer`);
            
            client.current_status = 'creditor_review';
            client.admin_approved = false;
            client.admin_approved_at = null;
            
            client.status_history.push({
              id: uuidv4(),
              status: 'reverted_to_creditor_review',
              changed_by: 'system',
              metadata: {
                reason: 'New documents processed requiring agent review',
                documents_needing_review: docsNeedingReview.length,
                auto_confirmation_timer_reset: true
              },
              created_at: new Date()
            });
          }
        }
        
        return client;
      });
      
      // ============================================
      // CREATE ZENDESK TICKETS FOR MANUAL REVIEW
      // ============================================
      // According to workflow: When documents need review, create Zendesk ticket
      // with link to GCS document, context, and task description
      
      if (documentsNeedingReview.length > 0) {
        console.log(`\n🎫 ================================`);
        console.log(`🎫 CREATING ZENDESK TICKETS`);
        console.log(`🎫 ================================`);
        console.log(`📄 Documents needing review: ${documentsNeedingReview.length}`);
        console.log(`👤 Client: ${client_id} (${client.aktenzeichen || 'NO_AKTENZEICHEN'})`);
        
        // Get updated client to access document URLs
        const updatedClient = await getClient(client_id);
        
        // Group documents by review reason for better ticket organization
        const docsByReason = {};
        documentsNeedingReview.forEach(doc => {
          const reason = doc.status_reason || doc.validation?.review_reasons?.join(', ') || 'Manuelle Prüfung erforderlich';
          if (!docsByReason[reason]) {
            docsByReason[reason] = [];
          }
          docsByReason[reason].push(doc);
        });
        
        // Create Zendesk ticket(s) - async, don't wait
        setImmediate(async () => {
          try {
            // Import Zendesk service
            const ZendeskService = require('../services/zendeskService');
            const zendeskService = new ZendeskService();
            
            // Get fresh client data for ticket creation
            const clientForTicket = await getClient(client_id);
            
            // Create one ticket per document needing review (matching your pattern)
            for (const doc of documentsNeedingReview) {
              const docRecord = clientForTicket.documents?.find(d => d.id === doc.id);
              const gcsUrl = docRecord?.url || docRecord?.gcs_path || 'N/A';
              const originalName = doc.filename || doc.name || 'Unbekanntes Dokument';
              
              // Build review reasons text
              const reviewReasons = doc.validation?.review_reasons || 
                                   (doc.status_reason ? [doc.status_reason] : []) ||
                                   ['Manuelle Prüfung erforderlich'];
              
              const ticketResult = await zendeskService.createTicket({
                subject: `🔄 Dokumentprüfung erforderlich: ${clientForTicket.firstName} ${clientForTicket.lastName} (${clientForTicket.aktenzeichen})`,
                
                content: `**🔄 DOKUMENTPRÜFUNG ERFORDERLICH**

👤 **Client:** ${clientForTicket.firstName} ${clientForTicket.lastName}
📧 **Email:** ${clientForTicket.email}
📁 **Aktenzeichen:** ${clientForTicket.aktenzeichen}
📅 **Verarbeitet:** ${new Date().toLocaleString('de-DE')}
📄 **Dokument:** ${originalName}

📊 **Dokument-Informationen:**
• Status: ${doc.document_status}
• Ist Gläubigerdokument: ${doc.is_creditor_document ? 'Ja' : 'Nein'}
• Confidence: ${doc.confidence ? Math.round(doc.confidence * 100) + '%' : 'N/A'}
• GCS Link: ${gcsUrl}
• Job ID: ${job_id}

⚠️ **GRUND FÜR PRÜFUNG:**
${reviewReasons.map(reason => `• ${reason}`).join('\n')}

📋 **AKTION ERFORDERLICH:**
1. Bitte das Dokument im Agent Portal prüfen
2. Entscheiden Sie:
   - ✅ Gläubigerdokument → Bestätigen und Daten extrahieren
   - ❌ Kein Gläubigerdokument → Als nicht relevant markieren
3. Bei Bestätigung: Gläubigerdaten prüfen und zur Liste hinzufügen

🔗 **Agent Portal:** ${process.env.FRONTEND_URL || process.env.BACKEND_URL || 'https://mandanten-portal.onrender.com'}/agent/review/${client_id}

📋 **STATUS:** Dokumentprüfung - Review erforderlich
⏰ **Verarbeitungsmethode:** FastAPI Gemini AI`,

                requesterEmail: clientForTicket.email,
                tags: ['document-review', 'ai-processing', 'manual-review-required', 'creditor-documents'],
                priority: 'normal'
              });
              
              if (ticketResult.success) {
                console.log(`✅ Zendesk ticket created for document review: ${ticketResult.ticket_id}`);
                
                // Store ticket in client record
                await safeClientUpdate(client_id, (client) => {
                  client.zendesk_tickets = client.zendesk_tickets || [];
                  client.zendesk_tickets.push({
                    ticket_id: ticketResult.ticket_id,
                    ticket_type: 'creditor_review',
                    ticket_scenario: 'document_review',
                    status: 'open',
                    created_at: new Date(),
                    document_ids: [doc.id]
                  });
                  return client;
                });
              } else {
                console.error(`❌ Failed to create Zendesk ticket: ${ticketResult.error || 'Unknown error'}`);
              }
            }
            
            console.log(`✅ Zendesk ticket creation process completed`);
            console.log(`🎫 ================================\n`);
            
          } catch (zendeskError) {
            console.error(`❌ Failed to create Zendesk ticket:`, zendeskError);
            // Don't fail the webhook if Zendesk fails
          }
        });
      }
      
      // Trigger internal processing complete webhook (for other integrations)
      if (status === 'completed' || status === 'partial') {
        const firstDocId = processedDocuments[0]?.id;
        
        // Async - don't wait
        setImmediate(async () => {
          try {
            // Load server functions in async context (may be different execution context)
            const { triggerProcessingCompleteWebhook } = getServerFunctions();
            await triggerProcessingCompleteWebhook(client_id, firstDocId);
          } catch (err) {
            console.error('Failed to trigger internal webhook:', err);
          }
        });
      }
      
      const processingTime = Date.now() - startTime;
      
      console.log(`\n✅ ================================`);
      console.log(`✅ WEBHOOK PROCESSING COMPLETE`);
      console.log(`✅ ================================`);
      console.log(`🔑 Job ID: ${job_id}`);
      console.log(`👤 Client ID: ${client_id}`);
      console.log(`📄 Documents updated: ${processedDocuments.length}`);
      console.log(`📄 Creditor docs: ${creditorDocuments.length}`);
      console.log(`⚠️  Docs needing review: ${documentsNeedingReview.length}`);
      console.log(`⏱️  Processing time: ${processingTime}ms`);
      console.log(`⏰ Completed at: ${new Date().toISOString()}`);
      console.log(`\n`);
      
      // Respond to FastAPI
      res.json({
        success: true,
        message: 'Webhook processed successfully',
        processed_documents: processedDocuments.length,
        processing_time_ms: processingTime
      });
      
    } catch (error) {
      console.error(`\n❌ ================================`);
      console.error(`❌ WEBHOOK PROCESSING FAILED`);
      console.error(`❌ ================================`);
      console.error(`💥 Error: ${error.message}`);
      console.error(`📚 Stack: ${error.stack}`);
      console.error(`❌ ================================\n`);
      
      res.status(500).json({
        error: 'Webhook processing failed',
        details: error.message
      });
    }
  }
);

/**
 * Webhook health check
 * 
 * GET /health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /webhooks/ai-processing'
    ]
  });
});

module.exports = router;



