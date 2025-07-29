const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Get review data for a specific client
// GET /api/agent-review/:clientId
router.get('/:clientId', authenticateAdmin, rateLimits.general, async (req, res) => {
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
        (!relatedCreditor || (relatedCreditor.confidence || 0) < 0.8)
      );
    });

    // Get creditors that need review
    const creditorsToReview = creditors.filter(c => (c.confidence || 0) < 0.8);

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
        verified: creditors.filter(c => (c.confidence || 0) >= 0.8),
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
router.post('/:clientId/correct', authenticateAdmin, rateLimits.general, async (req, res) => {
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
          reviewed_by: req.adminId,
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
          reviewed_by: req.adminId,
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
        creditors[creditorIndex].reviewed_by = req.adminId;
        creditors[creditorIndex].reviewed_at = new Date();
        creditors[creditorIndex].review_action = 'skipped';
      }
      console.log(`⏭️ Skipped review for document ${document_id}`);
    } else if (action === 'confirm') {
      // Confirm AI extraction is correct
      if (creditorIndex >= 0) {
        creditors[creditorIndex].confidence = 1.0; // Confirmed = 100% confidence
        creditors[creditorIndex].manually_reviewed = true;
        creditors[creditorIndex].reviewed_by = req.adminId;
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
    document.reviewed_by = req.adminId;

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
router.post('/:clientId/complete', authenticateAdmin, rateLimits.general, async (req, res) => {
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
        agent_id: req.adminId,
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

    res.json({
      success: true,
      message: 'Review session completed successfully',
      client_status: 'manual_review_complete',
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
      next_step: 'Update Zendesk ticket with final creditor list',
      zendesk_update_required: true
    });

  } catch (error) {
    console.error('❌ Error completing review:', error);
    res.status(500).json({
      error: 'Failed to complete review',
      details: error.message
    });
  }
});

// Get document content for review (PDF/image data)
// GET /api/agent-review/:clientId/document/:documentId
router.get('/:clientId/document/:documentId', authenticateAdmin, rateLimits.general, async (req, res) => {
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

    // Return document metadata and download URL
    res.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        size: document.size,
        uploaded_at: document.uploaded_at,
        download_url: document.url || document.downloadUrl,
        is_creditor_document: document.is_creditor_document,
        processing_status: document.processing_status,
        manually_reviewed: document.manually_reviewed || false
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

module.exports = router;