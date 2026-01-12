
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
          console.log(`\n🔍 Processing docResult:`);
          console.log(`   ID: ${docResult.id}`);
          console.log(`   Has source_document_id: ${!!docResult.source_document_id}`);
          console.log(`   source_document_id value: ${docResult.source_document_id}`);
          console.log(`   creditor_index: ${docResult.creditor_index}`);
          console.log(`   creditor_count: ${docResult.creditor_count}`);

          if (docResult.source_document_id) {
            // This is a creditor entry split from a multi-creditor document
            // Find the source document to copy metadata
            const sourceDoc = client.documents.find(d => d.id === docResult.source_document_id);

            console.log(`   Found source doc: ${!!sourceDoc}`);
            if (sourceDoc) {
              console.log(`   Source doc ID: ${sourceDoc.id}`);
              console.log(`   Source doc name: ${sourceDoc.name}`);
            }

            if (sourceDoc) {
              // Get creditor name for display
              const creditorName = docResult.extracted_data?.creditor_data?.sender_name ||
                                    docResult.extracted_data?.creditor_data?.glaeubiger_name ||
                                    `Creditor ${docResult.creditor_index}`;

              // Create descriptive name: "document.pdf - Creditor 1/5: Vodafone GmbH"
              const displayName = `${sourceDoc.name} - Gläubiger ${docResult.creditor_index}/${docResult.creditor_count}: ${creditorName}`;

              // Create a new document entry for this creditor
              const newCreditorEntry = {
                id: docResult.id,
                name: displayName,  // More descriptive name
                filename: sourceDoc.filename,
                type: sourceDoc.type,
                size: sourceDoc.size,
                url: sourceDoc.url,
                uploadedAt: sourceDoc.uploadedAt,
                // Multi-creditor metadata
                source_document_id: docResult.source_document_id,
                creditor_index: docResult.creditor_index,
                creditor_count: docResult.creditor_count,
                hidden_from_portal: true,  // Hide creditor splits from client portal
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
              console.log(`   Pushing newCreditorEntry with source_document_id: ${newCreditorEntry.source_document_id}`);
              console.log(`   hidden_from_portal: ${newCreditorEntry.hidden_from_portal}`);
              client.documents.push(newCreditorEntry);
              console.log(`✅ Added multi-creditor entry [${docResult.creditor_index}/${docResult.creditor_count}]: ${docResult.summary}`);

              // Verify it was added with source_document_id
              const justAdded = client.documents[client.documents.length - 1];
              console.log(`   Verified just added doc has source_document_id: ${!!justAdded.source_document_id}`);
              console.log(`   Verified just added doc has hidden_from_portal: ${!!justAdded.hidden_from_portal}`);
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

        // Update source documents that were split into multiple creditors
        // Find all unique source_document_ids from the newly added entries
        const sourceDocumentIds = new Set();
        const creditorEntriesBySource = new Map();

        client.documents.forEach(doc => {
          if (doc.source_document_id) {
            sourceDocumentIds.add(doc.source_document_id);

            // Track creditor entries for this source
            if (!creditorEntriesBySource.has(doc.source_document_id)) {
              creditorEntriesBySource.set(doc.source_document_id, []);
            }
            creditorEntriesBySource.get(doc.source_document_id).push(doc);
          }
        });

        console.log(`\n🔍 UPDATING SOURCE DOCUMENTS:`);
        console.log(`   Found ${sourceDocumentIds.size} unique source document IDs`);
        sourceDocumentIds.forEach(id => console.log(`   - ${id}`));

        // Update source documents with aggregated status
        sourceDocumentIds.forEach(sourceId => {
          console.log(`\n🔍 Looking for source document with ID: ${sourceId}`);
          const sourceDocIndex = client.documents.findIndex(d => d.id === sourceId);
          console.log(`   Found at index: ${sourceDocIndex}`);

          if (sourceDocIndex !== -1) {
            const sourceDoc = client.documents[sourceDocIndex];
            const creditorEntries = creditorEntriesBySource.get(sourceId) || [];

            console.log(`   Document name: ${sourceDoc.name}`);
            console.log(`   Split into ${creditorEntries.length} creditor entries`);

            // Determine overall status for source document
            const needsReviewCount = creditorEntries.filter(c => c.document_status === 'needs_review').length;
            const confirmedCount = creditorEntries.filter(c => c.document_status === 'creditor_confirmed').length;

            let overallStatus = 'creditor_confirmed';
            let overallReason = `${creditorEntries.length} Gläubiger erkannt`;

            if (needsReviewCount > 0) {
              overallStatus = 'needs_review';
              overallReason = `${needsReviewCount} von ${creditorEntries.length} Gläubigern benötigen Prüfung`;
            }

            // Update source document
            client.documents[sourceDocIndex].processing_status = 'completed';
            client.documents[sourceDocIndex].document_status = overallStatus;
            client.documents[sourceDocIndex].status_reason = overallReason;
            client.documents[sourceDocIndex].is_creditor_document = true;
            client.documents[sourceDocIndex].creditor_count = creditorEntries.length;

            console.log(`✅ Updated source document status: ${overallStatus}`);
            console.log(`   Reason: ${overallReason}`);
          } else {
            console.log(`   ⚠️  Source document ${sourceId} not found in client.documents`);
          }
        });

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



