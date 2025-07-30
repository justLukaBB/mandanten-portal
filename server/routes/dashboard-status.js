const express = require('express');
const Client = require('../models/Client');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Get enhanced dashboard status for all clients
// GET /api/dashboard-status
router.get('/', rateLimits.admin, authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Dashboard Status: Getting enhanced client statuses');

    const clients = await Client.find({}).sort({ updated_at: -1 });
    
    const clientStatuses = clients.map(client => {
      const status = getClientDisplayStatus(client);
      
      return {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        created_at: client.created_at,
        updated_at: client.updated_at,
        
        // Enhanced status info
        payment: status.payment,
        documents: status.documents,
        processing: status.processing,
        review: status.review,
        overall_status: status.overall_status,
        
        // Raw data for detailed views
        first_payment_received: client.first_payment_received,
        payment_ticket_type: client.payment_ticket_type,
        current_status: client.current_status,
        documents_count: client.documents?.length || 0,
        creditors_count: client.final_creditor_list?.length || 0,
        
        // Timestamps
        payment_processed_at: client.payment_processed_at,
        document_request_sent_at: client.document_request_sent_at,
        all_documents_processed_at: client.all_documents_processed_at,
        
        // Actions needed
        needs_attention: status.needs_attention,
        next_action: status.next_action
      };
    });

    // Statistics
    const stats = {
      total_clients: clients.length,
      payment_confirmed: clients.filter(c => c.first_payment_received).length,
      awaiting_documents: clients.filter(c => c.payment_ticket_type === 'document_request').length,
      processing: clients.filter(c => c.payment_ticket_type === 'processing_wait').length,
      manual_review_needed: clients.filter(c => c.payment_ticket_type === 'manual_review').length,
      auto_approved: clients.filter(c => c.payment_ticket_type === 'auto_approved').length,
      no_creditors: clients.filter(c => c.payment_ticket_type === 'no_creditors_found').length,
      needs_attention: clientStatuses.filter(c => c.needs_attention).length
    };

    res.json({
      success: true,
      clients: clientStatuses,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting dashboard status:', error);
    res.status(500).json({
      error: 'Failed to get dashboard status',
      details: error.message
    });
  }
});

// Get detailed status for specific client
// GET /api/dashboard-status/:clientId
router.get('/:clientId', rateLimits.admin, authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findOne({ id: clientId });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: clientId
      });
    }

    const status = getClientDisplayStatus(client);
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];

    res.json({
      success: true,
      client: {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        phone: client.phone,
        address: client.address,
        
        // Status information
        status: status,
        current_status: client.current_status,
        payment_ticket_type: client.payment_ticket_type,
        
        // Documents details
        documents: {
          total: documents.length,
          processed: documents.filter(d => d.processing_status === 'completed').length,
          processing: documents.filter(d => d.processing_status === 'processing').length,
          creditor_docs: documents.filter(d => d.is_creditor_document === true).length,
          list: documents.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type,
            size: d.size,
            uploaded_at: d.uploadedAt,
            processing_status: d.processing_status,
            is_creditor_document: d.is_creditor_document,
            confidence: d.confidence
          }))
        },
        
        // Creditors details
        creditors: {
          total: creditors.length,
          high_confidence: creditors.filter(c => (c.confidence || 0) >= 0.8).length,
          needs_review: creditors.filter(c => (c.confidence || 0) < 0.8).length,
          total_debt: creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0),
          list: creditors.map(c => ({
            id: c.id,
            sender_name: c.sender_name,
            claim_amount: c.claim_amount,
            confidence: c.confidence,
            status: c.status,
            manually_reviewed: c.manually_reviewed
          }))
        },
        
        // Timeline
        timeline: [
          { event: 'Client Created', date: client.created_at, status: 'completed' },
          client.portal_link_sent_at && { event: 'Portal Access Sent', date: client.portal_link_sent_at, status: 'completed' },
          client.payment_processed_at && { event: 'Payment Confirmed', date: client.payment_processed_at, status: 'completed' },
          client.document_request_sent_at && { event: 'Documents Requested', date: client.document_request_sent_at, status: 'completed' },
          client.all_documents_processed_at && { event: 'Processing Complete', date: client.all_documents_processed_at, status: 'completed' }
        ].filter(Boolean),
        
        // Status history
        status_history: client.status_history || [],
        
        // Timestamps
        created_at: client.created_at,
        updated_at: client.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Error getting client status:', error);
    res.status(500).json({
      error: 'Failed to get client status',
      details: error.message
    });
  }
});

// Helper function to calculate display status
function getClientDisplayStatus(client) {
  const documents = client.documents || [];
  const creditors = client.final_creditor_list || [];
  
  const status = {
    payment: client.first_payment_received ? '✅ Bezahlt' : '❌ Ausstehend',
    documents: `${documents.length} Dokumente`,
    processing: 'Unbekannt',
    review: 'Ausstehend',
    overall_status: 'created',
    needs_attention: false,
    next_action: 'Warten auf erste Rate'
  };
  
  // Calculate processing status
  if (documents.length === 0) {
    status.processing = '❌ Keine Dokumente';
  } else {
    const completed = documents.filter(d => d.processing_status === 'completed');
    const processing = documents.filter(d => d.processing_status === 'processing');
    
    if (completed.length === documents.length) {
      status.processing = '✅ Abgeschlossen';
    } else if (processing.length > 0) {
      status.processing = `⏳ ${completed.length}/${documents.length}`;
    } else {
      status.processing = `📋 ${completed.length}/${documents.length}`;
    }
  }
  
  // Calculate review status based on payment state
  if (!client.first_payment_received) {
    status.overall_status = 'awaiting_payment';
    status.review = '💰 Warte auf erste Rate';
    status.next_action = 'Warten auf erste Rate';
  } else if (client.payment_ticket_type) {
    switch(client.payment_ticket_type) {
      case 'document_request':
        status.overall_status = 'awaiting_documents';
        status.review = '📄 Warte auf Dokumente';
        status.next_action = 'Mandant kontaktieren - Dokumente anfordern';
        status.needs_attention = true;
        break;
        
      case 'processing_wait':
        status.overall_status = 'processing';
        status.review = '⏳ AI verarbeitet';
        status.next_action = 'Warten auf AI-Verarbeitung';
        break;
        
      case 'manual_review':
        status.overall_status = 'manual_review';
        status.review = '🔍 Manuelle Prüfung';
        status.next_action = 'Manuelle Gläubiger-Prüfung durchführen';
        status.needs_attention = true;
        break;
        
      case 'auto_approved':
        status.overall_status = 'ready_for_confirmation';
        status.review = '✅ Bereit zur Bestätigung';
        status.next_action = 'Gläubigerliste an Mandant senden';
        status.needs_attention = true;
        break;
        
      case 'no_creditors_found':
        status.overall_status = 'problem';
        status.review = '⚠️ Keine Gläubiger';
        status.next_action = 'Dokumente manuell prüfen';
        status.needs_attention = true;
        break;
        
      default:
        status.overall_status = 'unknown';
        status.review = '❓ Unbekannt';
        status.next_action = 'Status prüfen';
        status.needs_attention = true;
    }
  } else {
    // Payment received but no ticket type set yet (should not happen with new system)
    status.overall_status = 'payment_confirmed';
    status.review = '✅ Zahlung bestätigt';
    status.next_action = 'System prüfen - Ticket-Typ fehlt';
    status.needs_attention = true;
  }
  
  return status;
}

module.exports = router;