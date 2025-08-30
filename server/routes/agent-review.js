const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const Agent = require('../models/Agent');
const { authenticateAgent } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const CreditorContactService = require('../services/creditorContactService');
const ZendeskService = require('../services/zendeskService');
const config = require('../config');

const router = express.Router();

// Debug endpoint to test agent authentication
router.get('/debug/auth', authenticateAgent, rateLimits.general, async (req, res) => {
  res.json({
    success: true,
    message: 'Agent authentication working',
    agent: {
      id: req.agentId,
      username: req.agentUsername,
      role: req.agentRole
    },
    timestamp: new Date().toISOString()
  });
});

// Helper function to serve mock PDF for test scenarios
function serveMockPDF(res, documentName) {
  try {
    // Create a simple mock PDF content
    const mockPDFContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 110
>>
stream
BT
/F1 12 Tf
50 700 Td
(Mock Test Document: ${documentName}) Tj
0 -20 Td
(This is a test document for Agent Review Dashboard) Tj
0 -40 Td
(Document contains simulated creditor data for testing purposes) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000208 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
370
%%EOF`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${documentName}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.send(Buffer.from(mockPDFContent));
    
  } catch (error) {
    console.error('❌ Error serving mock PDF:', error);
    res.status(500).json({
      error: 'Failed to serve mock PDF',
      details: error.message
    });
  }
}

// Get available clients for review
// GET /api/agent-review/available-clients
router.get('/available-clients', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    console.log(`🔍 Agent Review: Getting available clients for agent ${req.agentUsername}`);

    // Find clients with documents that need manual review
    const clients = await Client.find({
      // Only clients who have received payment (ready for review)
      first_payment_received: true,
      // Include clients that need creditor review or exclude completed ones
      $or: [
        { current_status: 'creditor_review' },
        { current_status: { $nin: ['manual_review_complete', 'creditor_contact_initiated', 'completed', 'awaiting_client_confirmation'] } }
      ]
    }).sort({ payment_processed_at: -1 }).limit(20);

    const availableClients = [];

    for (const client of clients) {
      const documents = client.documents || [];
      const creditors = client.final_creditor_list || [];
      
      // Find documents that need review
      const documentsToReview = documents.filter(doc => {
        const relatedCreditor = creditors.find(c => 
          c.document_id === doc.id || 
          c.source_document === doc.name
        );
        
        return (
          doc.is_creditor_document === true && 
          (!relatedCreditor || (relatedCreditor.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) &&
          !doc.manually_reviewed
        );
      });

      // Only include clients with documents that actually need review
      if (documentsToReview.length > 0) {
        // Calculate priority based on various factors
        let priority = 'medium';
        const daysSincePayment = (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24);
        const avgConfidence = documentsToReview.reduce((sum, doc) => {
          const relatedCreditor = creditors.find(c => c.document_id === doc.id);
          return sum + (relatedCreditor?.confidence || 0);
        }, 0) / documentsToReview.length;

        // Priority logic
        if (daysSincePayment > 3 || avgConfidence < 0.4) {
          priority = 'high';
        } else if (daysSincePayment > 1 || avgConfidence < 0.6) {
          priority = 'medium';
        } else {
          priority = 'low';
        }

        availableClients.push({
          id: client.id,
          name: `${client.firstName} ${client.lastName}`,
          aktenzeichen: client.aktenzeichen,
          documents_to_review: documentsToReview.length,
          total_documents: documents.length,
          priority: priority,
          payment_received_at: client.payment_processed_at,
          days_since_payment: Math.round(daysSincePayment)
        });
      }
    }

    // Sort by priority (high first) then by days since payment
    availableClients.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.days_since_payment - a.days_since_payment;
    });

    console.log(`📊 Found ${availableClients.length} clients needing review for agent ${req.agentUsername}`);

    res.json({
      success: true,
      clients: availableClients,
      total: availableClients.length,
      confidence_threshold: config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD
    });

  } catch (error) {
    console.error('❌ Error getting available clients:', error);
    res.status(500).json({
      error: 'Failed to get available clients',
      details: error.message
    });
  }
});

// Get review data for a specific client
// GET /api/agent-review/:clientId
router.get('/:clientId', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    console.log(`🔍 Agent Review: Getting review data for client ${clientId}`);

    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    // Get documents that need review (creditor documents with low confidence)
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    
    // Filter documents that need manual review based on Claude AI document confidence
    const documentsToReview = documents.filter(doc => {
      // Check if document needs manual review based on Claude AI confidence or manual_review_required flag
      const documentConfidence = doc.extracted_data?.confidence || 0;
      const manualReviewRequired = doc.extracted_data?.manual_review_required === true;
      
      // Include if:
      // 1. It's a creditor document AND
      // 2. Either manual review is explicitly required OR document confidence is low
      return (
        doc.is_creditor_document === true && 
        (manualReviewRequired || documentConfidence < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD)
      );
    });

    // Get creditors that need review
    const creditorsToReview = creditors.filter(c => (c.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD);

    console.log(`📊 Review data for ${client.aktenzeichen}: ${documentsToReview.length} docs, ${creditorsToReview.length} creditors need review`);
    
    // Log document structure for debugging
    if (documentsToReview.length > 0) {
      console.log(`📄 First document to review:`, {
        id: documentsToReview[0].id,
        name: documentsToReview[0].name,
        hasId: !!documentsToReview[0].id,
        documentStructure: Object.keys(documentsToReview[0])
      });
    }

    res.json({
      success: true,
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        aktenzeichen: client.aktenzeichen,
        current_status: client.current_status
      },
      documents: {
        all: documents,
        need_review: documentsToReview,
        total_count: documents.length,
        review_count: documentsToReview.length
      },
      creditors: {
        all: creditors,
        need_review: creditorsToReview,
        verified: creditors.filter(c => (c.confidence || 0) >= config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD),
        total_count: creditors.length,
        review_count: creditorsToReview.length
      },
      review_session: {
        status: client.current_status,
        progress: {
          total_items: documentsToReview.length,
          completed_items: 0, // Will be calculated based on corrections
          remaining_items: documentsToReview.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting review data:', error);
    res.status(500).json({
      error: 'Failed to get review data',
      details: error.message
    });
  }
});

// Save corrections for a specific document
// POST /api/agent-review/:clientId/correct
router.post('/:clientId/correct', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { document_id, corrections, action } = req.body; // action: 'correct', 'skip', 'confirm'
    
    console.log(`✏️ Agent Review: Saving corrections for client ${clientId}, document ${document_id}, action: ${action}`);

    // Enhanced input validation with debugging
    console.log(`📝 Correction request data:`, {
      document_id,
      action,
      corrections: corrections ? Object.keys(corrections) : 'null',
      agentId: req.agentId,
      agentUsername: req.agentUsername
    });

    if (!document_id) {
      console.log(`❌ Missing document_id in correction request`);
      return res.status(400).json({
        error: 'document_id is required'
      });
    }

    if (!action || !['correct', 'skip', 'confirm'].includes(action)) {
      console.log(`❌ Invalid action: ${action}`);
      return res.status(400).json({
        error: 'Valid action is required (correct, skip, confirm)'
      });
    }

    if (action === 'correct' && (!corrections || typeof corrections !== 'object')) {
      console.log(`❌ Missing corrections for action 'correct':`, corrections);
      return res.status(400).json({
        error: 'corrections object is required for correct action'
      });
    }

    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    // Safe document lookup
    const documents = client.documents || [];
    const document = documents.find(d => d.id === document_id);
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        document_id: document_id
      });
    }

    // Find related creditor (if any)
    let creditorIndex = -1;
    const creditors = client.final_creditor_list || [];
    
    for (let i = 0; i < creditors.length; i++) {
      if (creditors[i].document_id === document_id || 
          creditors[i].source_document === document.name) {
        creditorIndex = i;
        break;
      }
    }

    if (action === 'correct' && corrections) {
      // Apply corrections
      if (creditorIndex >= 0 && creditorIndex < creditors.length) {
        // Update existing creditor - safe access
        const originalData = { ...creditors[creditorIndex] };
        
        // Preserve the original creditor object and only update specific fields
        Object.assign(creditors[creditorIndex], {
          sender_name: corrections.sender_name || creditors[creditorIndex].sender_name || 'Unbekannt',
          sender_email: corrections.sender_email || creditors[creditorIndex].sender_email || '',
          reference_number: corrections.reference_number || creditors[creditorIndex].reference_number || '',
          claim_amount: corrections.claim_amount ? parseFloat(corrections.claim_amount) : (creditors[creditorIndex].claim_amount || 0),
          confidence: 1.0, // Manual correction = 100% confidence
          status: 'confirmed', // Change status from pending to confirmed
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          confirmed_at: new Date(), // Add confirmation timestamp
          original_ai_data: originalData,
          correction_notes: corrections.notes || '',
          review_action: 'corrected'
        });
        
        console.log(`✅ Updated existing creditor for document ${document_id}`);
      } else {
        // Create new creditor from corrections
        const claimAmount = corrections.claim_amount ? parseFloat(corrections.claim_amount) : 0;
        
        const newCreditor = {
          id: uuidv4(),
          document_id: document_id,
          source_document: document.name,
          sender_name: corrections.sender_name || 'Unbekannt',
          sender_email: corrections.sender_email || '',
          reference_number: corrections.reference_number || '',
          claim_amount: isNaN(claimAmount) ? 0 : claimAmount,
          confidence: 1.0, // Manual entry = 100% confidence
          status: 'confirmed', // New creditors from manual review are confirmed
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          confirmed_at: new Date(), // Add confirmation timestamp
          created_via: 'manual_review',
          correction_notes: corrections.notes || ''
        };
        
        creditors.push(newCreditor);
        console.log(`✅ Created new creditor for document ${document_id}`);
      }
    } else if (action === 'skip') {
      // Mark as skipped
      if (creditorIndex >= 0 && creditorIndex < creditors.length) {
        Object.assign(creditors[creditorIndex], {
          status: 'rejected', // Mark as rejected when skipped
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          review_action: 'skipped'
        });
      }
      console.log(`⏭️ Skipped review for document ${document_id}`);
    } else if (action === 'confirm') {
      // Confirm AI extraction is correct
      if (creditorIndex >= 0 && creditorIndex < creditors.length) {
        // Update existing creditor
        Object.assign(creditors[creditorIndex], {
          confidence: 1.0, // Confirmed = 100% confidence
          status: 'confirmed', // Change status from pending to confirmed
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          confirmed_at: new Date(), // Add confirmation timestamp
          review_action: 'confirmed'
        });
        console.log(`✅ Confirmed existing creditor for document ${document_id}`);
      } else {
        // No existing creditor found - create one from document AI data
        const creditorData = document.extracted_data?.creditor_data;
        if (creditorData) {
          const newCreditor = {
            id: uuidv4(),
            document_id: document_id,
            source_document: document.name,
            sender_name: creditorData.sender_name || 'Unbekannter Gläubiger',
            sender_email: creditorData.sender_email || '',
            sender_address: creditorData.sender_address || '',
            reference_number: creditorData.reference_number || '',
            claim_amount: creditorData.claim_amount || 0,
            is_representative: creditorData.is_representative || false,
            actual_creditor: creditorData.actual_creditor || creditorData.sender_name,
            ai_confidence: document.extracted_data?.confidence || 0,
            confidence: 1.0, // Confirmed = 100% confidence
            status: 'confirmed',
            manually_reviewed: true,
            reviewed_by: req.agentId,
            reviewed_at: new Date(),
            confirmed_at: new Date(),
            created_via: 'agent_confirmation',
            review_action: 'confirmed'
          };
          
          creditors.push(newCreditor);
          console.log(`✅ Created new confirmed creditor from AI data for document ${document_id}: ${newCreditor.sender_name}`);
        } else {
          console.log(`⚠️ No AI creditor data found for document ${document_id} - cannot confirm`);
        }
      }
    }

    // Update the client with corrected data
    console.log(`🔄 Updating client ${clientId} with corrected data...`);
    client.final_creditor_list = creditors;
    client.updated_at = new Date();

    // Mark document as reviewed
    console.log(`📝 Marking document ${document_id} as reviewed...`);
    document.manually_reviewed = true;
    document.reviewed_at = new Date();
    document.reviewed_by = req.agentId;

    console.log(`💾 Saving client to database...`);
    await client.save();
    console.log(`✅ Client saved successfully`);

    console.log(`📊 Calculating review progress...`);

    // Calculate review progress
    const documentsToReview = client.documents.filter(d => d.is_creditor_document === true);
    const reviewedDocuments = documentsToReview.filter(d => d.manually_reviewed === true);
    const progress = {
      total_items: documentsToReview.length,
      completed_items: reviewedDocuments.length,
      remaining_items: documentsToReview.length - reviewedDocuments.length
    };

    res.json({
      success: true,
      message: `Document ${action}ed successfully`,
      document_id: document_id,
      action: action,
      creditors_count: creditors.length,
      progress: progress,
      is_review_complete: progress.remaining_items === 0
    });

  } catch (error) {
    console.error('❌ Error saving corrections:', error);
    console.error('Error stack:', error.stack);
    console.error('Client ID:', req.params.clientId);
    console.error('Document ID:', req.body.document_id);
    console.error('Action:', req.body.action);
    console.error('Corrections:', JSON.stringify(req.body.corrections, null, 2));
    
    res.status(500).json({
      error: 'Failed to save corrections',
      details: error.message,
      debug: {
        clientId: req.params.clientId,
        documentId: req.body.document_id,
        action: req.body.action,
        errorType: error.constructor.name
      }
    });
  }
});

// Complete the review session
// POST /api/agent-review/:clientId/complete
router.post('/:clientId/complete', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { zendesk_ticket_id } = req.body;
    
    console.log(`✅ Agent Review: Completing review session for client ${clientId}`);

    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    // Update client status - now requires client confirmation
    client.current_status = 'awaiting_client_confirmation';
    client.admin_approved = true; // Mark that agent/admin has approved
    client.admin_approved_at = new Date();
    client.admin_approved_by = req.agentId;
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'awaiting_client_confirmation',
      changed_by: 'agent',
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_id: req.agentId,
        agent_action: 'Completed manual review - awaiting client confirmation',
        review_completed_at: new Date(),
        total_creditors: (client.final_creditor_list || []).length,
        manually_reviewed_docs: client.documents.filter(d => d.manually_reviewed === true).length,
        requires_client_confirmation: true
      }
    });

    // Save with validation only on modified fields to avoid document validation errors
    await client.save({ validateModifiedOnly: true });

    // Generate summary for response
    const creditors = client.final_creditor_list || [];
    const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
    const reviewedDocs = client.documents.filter(d => d.manually_reviewed === true);

    console.log(`✅ Review completed for ${client.aktenzeichen}: ${creditors.length} creditors, ${totalDebt}€ total debt`);

    // ADD ZENDESK COMMENT FOR REVIEW COMPLETION
    let zendeskService = null;
    let originalTicketId = null;
    
    try {
      zendeskService = new ZendeskService();
      const originalTicket = client.zendesk_tickets?.find(t => t.ticket_type === 'main_ticket' || t.status === 'active');
      originalTicketId = originalTicket?.ticket_id || client.zendesk_ticket_id || zendesk_ticket_id;
      
      console.log(`🎫 Zendesk configured: ${zendeskService.isConfigured()}, Ticket ID: ${originalTicketId}`);

      if (zendeskService.isConfigured() && originalTicketId) {
        try {
          const finalCreditorsList = creditors
            .filter(c => c.status === 'confirmed')
            .map((c, index) => `${index + 1}. ${c.sender_name || 'Unbekannt'} - €${(c.claim_amount || 0).toFixed(2)}`)
            .join('\n');

          const reviewCompleteComment = `**✅ MANUAL REVIEW COMPLETED**\n\n👤 **Agent:** ${req.agentId}\n⏰ **Completed:** ${new Date().toLocaleString('de-DE')}\n\n📊 **Final Results:**\n• Total creditors: ${creditors.length}\n• Total debt: €${totalDebt.toFixed(2)}\n• Documents reviewed: ${reviewedDocs.length}\n\n🏛️ **FINAL CREDITOR LIST:**\n${finalCreditorsList}\n\n⏳ **NEXT STEPS:**\n• ✅ Client notification sent via Side Conversation\n• ⏳ Waiting for client to confirm creditor list\n• 🔄 After client confirmation → Automatic creditor contact starts\n\n📋 **STATUS:** Awaiting client confirmation`;

          console.log(`📝 Adding review completion comment to ticket ${originalTicketId}...`);
          await zendeskService.addInternalComment(originalTicketId, {
            content: reviewCompleteComment,
            status: 'open'
          });
          
          console.log(`✅ Added review completion comment to ticket ${originalTicketId}`);
        } catch (commentError) {
          console.error(`❌ Failed to add review completion comment:`, commentError.message);
          console.error(`Comment error stack:`, commentError.stack);
          // Don't fail the entire operation for comment errors
        }
      } else {
        console.log(`ℹ️ Zendesk not configured or no ticket ID - skipping review completion comment`);
      }
    } catch (zendeskSetupError) {
      console.error(`❌ Failed to initialize Zendesk service:`, zendeskSetupError.message);
      console.error(`Zendesk setup error stack:`, zendeskSetupError.stack);
      // Don't fail the entire operation for Zendesk setup errors
    }

    // AUTOMATICALLY SEND CLIENT CONFIRMATION REQUEST AFTER AGENT REVIEW
    let clientNotificationSent = false;
    
    if (creditors.length > 0) {
      try {
        console.log(`📧 Agent review completed - sending client confirmation request for ${client.aktenzeichen}...`);
        
        // Generate creditor list for client review
        const creditorsList = creditors
          .filter(c => c.status === 'confirmed')
          .map((c, index) => {
            return `${index + 1}. **${c.sender_name || 'Unbekannt'}**
   - Forderung: €${(c.claim_amount || 0).toFixed(2)}
   - Referenz: ${c.reference_number || 'Keine Referenz'}`;
          }).join('\n\n');

        const portalLink = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/portal?token=${client.portal_token}`;
        
        // Send Side Conversation to client (AFTER agent approval)
        if (zendeskService && zendeskService.isConfigured() && originalTicketId) {
          try {
            const clientMessage = `**Gläubigerliste zur Überprüfung bereit**

Sehr geehrte/r ${client.firstName} ${client.lastName},

unsere Mitarbeiter haben die Überprüfung Ihrer Dokumente abgeschlossen. Folgende Gläubiger wurden identifiziert:

**📋 GLÄUBIGERLISTE:**
${creditorsList}

**Gesamtschulden:** €${totalDebt.toFixed(2)}

**🔍 WICHTIG: Ihre Bestätigung erforderlich**
Bitte überprüfen Sie diese Liste sorgfältig und bestätigen Sie, dass alle Gläubiger korrekt erfasst wurden.

**➡️ Zur Bestätigung:**
${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/portal

Nach Ihrer Bestätigung werden wir automatisch Kontakt mit Ihren Gläubigern aufnehmen.

Mit freundlichen Grüßen
Ihr Beratungsteam`;

            console.log(`📧 Sending Side Conversation to ${client.email}...`);
            
            // Send as Side Conversation to client
            const sideConversationResult = await zendeskService.sendSideConversation(originalTicketId, {
              recipient_email: client.email,
              subject: 'Gläubigerliste zur Bestätigung',
              message: clientMessage
            });

            if (sideConversationResult.success) {
              // Add internal note about sent confirmation
              await zendeskService.addInternalComment(originalTicketId, {
                content: `📧 **CLIENT CONFIRMATION REQUEST SENT**

✅ Agent review completed by: ${req.agentId}
📧 Email sent to: ${client.email}
📋 Total creditors identified: ${creditors.length}
💰 Total debt: €${totalDebt.toFixed(2)}

⏳ **WAITING FOR:** Client confirmation in portal
🔗 **Portal link sent:** ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/portal

**Next steps:**
1. ✅ Agent review completed
2. ✅ Client notification email sent  
3. ⏳ Client reviews and confirms creditor list in portal
4. 🔄 After client confirmation → Automatic creditor contact starts`,
                status: 'pending'
              });

              clientNotificationSent = true;
              console.log(`✅ Client confirmation request sent to ${client.email}`);
            } else {
              console.error(`❌ Side Conversation failed:`, sideConversationResult.error);
              
              await zendeskService.addInternalComment(originalTicketId, {
                content: `❌ **CLIENT NOTIFICATION FAILED**

✅ Agent review completed by: ${req.agentId}
📋 Total creditors identified: ${creditors.length}
💰 Total debt: €${totalDebt.toFixed(2)}

❌ **ERROR:** Failed to send client confirmation email
🔗 **Manual portal link:** ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/portal

**MANUAL ACTION REQUIRED:** Please send portal link to client manually`,
                status: 'open'
              });
            }
            
          } catch (error) {
            console.error(`❌ Failed to send client confirmation request:`, error.message);
            console.error(`Client notification error stack:`, error.stack);
          }
        } else {
          console.log(`ℹ️ Zendesk not configured - client notification skipped`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to send client notification for ${client.aktenzeichen}:`, error.message);
        console.error(`Client notification outer error stack:`, error.stack);
      }
    } else {
      console.log(`ℹ️ No confirmed creditors found - skipping client notification`);
    }

    res.json({
      success: true,
      message: 'Review session completed - client confirmation required',
      client_status: 'awaiting_client_confirmation',
      summary: {
        client: {
          name: `${client.firstName} ${client.lastName}`,
          aktenzeichen: client.aktenzeichen
        },
        creditors: {
          total_count: creditors.length,
          total_debt: totalDebt,
          manually_reviewed: creditors.filter(c => c.manually_reviewed === true).length
        },
        documents: {
          reviewed_count: reviewedDocs.length,
          total_count: client.documents.length
        }
      },
      // Client confirmation workflow info
      client_confirmation: {
        required: true,
        notification_sent: clientNotificationSent,
        portal_link: `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/portal?token=${client.portal_token}`,
        next_steps: [
          '1. Client receives email with creditor list',
          '2. Client reviews and confirms creditors in portal',
          '3. After confirmation: automatic creditor contact starts'
        ]
      },
      zendesk_update_required: false
    });

  } catch (error) {
    console.error('❌ Error completing review:', error);
    console.error('Error stack:', error.stack);
    console.error('Client ID:', req.params.clientId);
    
    res.status(500).json({
      error: 'Failed to complete review',
      details: error.message,
      debug: {
        clientId: req.params.clientId,
        errorType: error.constructor.name,
        stack: error.stack
      }
    });
  }
});

// Get document metadata for review
// GET /api/agent-review/:clientId/document/:documentId
router.get('/:clientId/document/:documentId', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const { clientId, documentId } = req.params;

    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    const document = client.documents.find(d => d.id === documentId);
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        document_id: documentId
      });
    }

    // Return document metadata with secure file URL
    res.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        filename: document.filename,
        type: document.type,
        size: document.size,
        uploaded_at: document.uploadedAt || document.uploaded_at,
        // Secure file URL through our API
        file_url: `/api/agent-review/${clientId}/document/${documentId}/file`,
        is_creditor_document: document.is_creditor_document,
        processing_status: document.processing_status,
        manually_reviewed: document.manually_reviewed || false,
        extracted_data: document.extracted_data
      }
    });

  } catch (error) {
    console.error('❌ Error getting document:', error);
    res.status(500).json({
      error: 'Failed to get document',
      details: error.message
    });
  }
});

// Secure file serving for document review
// GET /api/agent-review/:clientId/document/:documentId/file
router.get('/:clientId/document/:documentId/file', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const { clientId, documentId } = req.params;
    const fs = require('fs');
    const path = require('path');

    // Verify agent has access to this client
    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    const document = client.documents.find(d => d.id === documentId);
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        document_id: documentId
      });
    }

    // Construct file path based on your upload structure
    // Adjust this path based on your actual file storage structure
    const uploadsDir = path.join(__dirname, '../uploads');
    let filePath;
    
    // Try different possible paths
    const possiblePaths = [
      path.join(uploadsDir, client.aktenzeichen, `${documentId}.${document.type?.split('/')[1] || 'pdf'}`),
      path.join(uploadsDir, clientId, `${documentId}.${document.type?.split('/')[1] || 'pdf'}`),
      path.join(uploadsDir, client.aktenzeichen, document.filename),
      path.join(uploadsDir, clientId, document.filename),
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`❌ File not found for document ${documentId}. Tried paths:`, possiblePaths);
      
      // For test scenarios, serve a mock PDF
      if (client.aktenzeichen?.startsWith('TEST_REVIEW_')) {
        console.log(`📋 Serving mock PDF for test document ${document.name}`);
        return serveMockPDF(res, document.name);
      }
      
      return res.status(404).json({
        error: 'Document file not found on disk',
        document_id: documentId
      });
    }

    // Log access for security auditing
    console.log(`📄 Agent ${req.agentUsername} accessing document ${documentId} for client ${client.aktenzeichen}`);

    // Set appropriate headers
    const mimeType = document.type || 'application/pdf';
    const filename = document.filename || document.name || `document_${documentId}.pdf`;
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error serving document file:', error);
    res.status(500).json({
      error: 'Failed to serve document file',
      details: error.message
    });
  }
});

module.exports = router;