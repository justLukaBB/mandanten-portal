const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const Agent = require('../models/Agent');
const { authenticateAgent } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const CreditorContactService = require('../services/creditorContactService');
const config = require('../config');

const router = express.Router();

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
    
    // Filter documents that need manual review
    const documentsToReview = documents.filter(doc => {
      // Get related creditor data
      const relatedCreditor = creditors.find(c => 
        c.document_id === doc.id || 
        c.source_document === doc.name
      );
      
      // Include if:
      // 1. It's a creditor document with low confidence
      // 2. Or if no creditor was extracted from this document
      return (
        doc.is_creditor_document === true && 
        (!relatedCreditor || (relatedCreditor.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD)
      );
    });

    // Get creditors that need review
    const creditorsToReview = creditors.filter(c => (c.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD);

    console.log(`📊 Review data for ${client.aktenzeichen}: ${documentsToReview.length} docs, ${creditorsToReview.length} creditors need review`);

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
    
    console.log(`✏️ Agent Review: Saving corrections for client ${clientId}, document ${document_id}`);

    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    // Find the document
    const document = client.documents.find(d => d.id === document_id);
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
      if (creditorIndex >= 0) {
        // Update existing creditor
        const originalData = { ...creditors[creditorIndex] };
        
        creditors[creditorIndex] = {
          ...creditors[creditorIndex],
          sender_name: corrections.sender_name || creditors[creditorIndex].sender_name,
          sender_email: corrections.sender_email || creditors[creditorIndex].sender_email,
          reference_number: corrections.reference_number || creditors[creditorIndex].reference_number,
          claim_amount: corrections.claim_amount || creditors[creditorIndex].claim_amount,
          confidence: 1.0, // Manual correction = 100% confidence
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          original_ai_data: originalData,
          correction_notes: corrections.notes || ''
        };
        
        console.log(`✅ Updated existing creditor for document ${document_id}`);
      } else {
        // Create new creditor from corrections
        const newCreditor = {
          id: uuidv4(),
          document_id: document_id,
          source_document: document.name,
          sender_name: corrections.sender_name || 'Unbekannt',
          sender_email: corrections.sender_email || '',
          reference_number: corrections.reference_number || '',
          claim_amount: parseFloat(corrections.claim_amount) || 0,
          confidence: 1.0, // Manual entry = 100% confidence
          manually_reviewed: true,
          reviewed_by: req.agentId,
          reviewed_at: new Date(),
          created_via: 'manual_review',
          correction_notes: corrections.notes || ''
        };
        
        creditors.push(newCreditor);
        console.log(`✅ Created new creditor for document ${document_id}`);
      }
    } else if (action === 'skip') {
      // Mark as skipped
      if (creditorIndex >= 0) {
        creditors[creditorIndex].manually_reviewed = true;
        creditors[creditorIndex].reviewed_by = req.agentId;
        creditors[creditorIndex].reviewed_at = new Date();
        creditors[creditorIndex].review_action = 'skipped';
      }
      console.log(`⏭️ Skipped review for document ${document_id}`);
    } else if (action === 'confirm') {
      // Confirm AI extraction is correct
      if (creditorIndex >= 0) {
        creditors[creditorIndex].confidence = 1.0; // Confirmed = 100% confidence
        creditors[creditorIndex].manually_reviewed = true;
        creditors[creditorIndex].reviewed_by = req.agentId;
        creditors[creditorIndex].reviewed_at = new Date();
        creditors[creditorIndex].review_action = 'confirmed';
      }
      console.log(`✅ Confirmed AI extraction for document ${document_id}`);
    }

    // Update the client with corrected data
    client.final_creditor_list = creditors;
    client.updated_at = new Date();

    // Mark document as reviewed
    document.manually_reviewed = true;
    document.reviewed_at = new Date();
    document.reviewed_by = req.agentId;

    await client.save();

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
    res.status(500).json({
      error: 'Failed to save corrections',
      details: error.message
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

    // Update client status
    client.current_status = 'manual_review_complete';
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'manual_review_complete',
      changed_by: 'agent',
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_id: req.agentId,
        agent_action: 'Completed manual review via dashboard',
        review_completed_at: new Date(),
        total_creditors: (client.final_creditor_list || []).length,
        manually_reviewed_docs: client.documents.filter(d => d.manually_reviewed === true).length
      }
    });

    await client.save();

    // Generate summary for response
    const creditors = client.final_creditor_list || [];
    const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
    const reviewedDocs = client.documents.filter(d => d.manually_reviewed === true);

    console.log(`✅ Review completed for ${client.aktenzeichen}: ${creditors.length} creditors, ${totalDebt}€ total debt`);

    // AUTO-TRIGGER CREDITOR CONTACT PROCESS
    let creditorContactResult = null;
    let creditorContactError = null;
    
    if (creditors.length > 0) {
      try {
        console.log(`🚀 Auto-triggering creditor contact process for ${client.aktenzeichen}...`);
        
        const creditorService = new CreditorContactService();
        creditorContactResult = await creditorService.processClientCreditorConfirmation(client.aktenzeichen);
        
        console.log(`✅ Creditor contact process started: Main ticket ID ${creditorContactResult.main_ticket_id}, ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);
        
        // Update client status to indicate creditor contact has started
        client.current_status = 'creditor_contact_initiated';
        client.updated_at = new Date();
        
        client.status_history.push({
          id: uuidv4(),
          status: 'creditor_contact_initiated',
          changed_by: 'system',
          metadata: {
            triggered_by: 'manual_review_completion',
            main_ticket_id: creditorContactResult.main_ticket_id,
            emails_sent: creditorContactResult.emails_sent,
            total_creditors: creditors.length,
            side_conversations_created: creditorContactResult.side_conversation_results?.length || 0
          }
        });
        
        await client.save();
        
      } catch (error) {
        console.error(`❌ Failed to auto-trigger creditor contact for ${client.aktenzeichen}:`, error.message);
        creditorContactError = error.message;
        
        // Still update status but mark as error
        client.current_status = 'creditor_contact_failed';
        client.status_history.push({
          id: uuidv4(),
          status: 'creditor_contact_failed',
          changed_by: 'system',
          metadata: {
            error_message: error.message,
            requires_manual_action: true
          }
        });
        
        await client.save();
      }
    }

    res.json({
      success: true,
      message: 'Review session completed successfully',
      client_status: creditorContactResult ? 'creditor_contact_initiated' : 'manual_review_complete',
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
      // Enhanced response with creditor contact info
      creditor_contact: creditorContactResult ? {
        success: true,
        main_ticket_id: creditorContactResult.main_ticket_id,
        main_ticket_subject: creditorContactResult.main_ticket_subject,
        emails_sent: creditorContactResult.emails_sent,
        total_creditors: creditors.length,
        side_conversations_created: creditorContactResult.side_conversation_results?.length || 0,
        next_step: 'Creditor emails sent via Side Conversations - Monitor responses in Zendesk'
      } : {
        success: false,
        error: creditorContactError,
        next_step: creditors.length === 0 ? 'No creditors to contact' : 'Manual creditor contact required'
      },
      zendesk_update_required: false // No longer needed - automatic process handles it
    });

  } catch (error) {
    console.error('❌ Error completing review:', error);
    res.status(500).json({
      error: 'Failed to complete review',
      details: error.message
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