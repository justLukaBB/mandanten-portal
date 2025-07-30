const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Zendesk Webhook: Portal Link Sent
// Triggered when agent uses "Portal-Link senden" macro
router.post('/portal-link-sent', rateLimits.general, async (req, res) => {
  try {
    console.log('🔗 Zendesk Webhook: Portal-Link-Sent received', req.body);
    
    // Handle both direct format and Zendesk webhook format
    let email, aktenzeichen, firstName, lastName, zendesk_ticket_id, zendesk_user_id, phone, address;
    
    if (req.body.ticket && req.body.ticket.requester) {
      // Zendesk webhook format
      const requester = req.body.ticket.requester;
      const ticket = req.body.ticket;
      
      email = requester.email;
      aktenzeichen = requester.aktenzeichen;
      zendesk_ticket_id = ticket.id;
      zendesk_user_id = requester.id;
      phone = requester.phone || '';
      address = '';
      
      // Parse name - assume "FirstName LastName" format
      const nameParts = (requester.name || '').split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
      
      console.log('📋 Parsed Zendesk webhook data:', {
        email, aktenzeichen, firstName, lastName, zendesk_ticket_id, zendesk_user_id
      });
    } else {
      // Direct format (for backward compatibility)
      ({
        email,
        aktenzeichen,
        firstName,
        lastName,
        zendesk_ticket_id,
        zendesk_user_id,
        phone,
        address
      } = req.body);
    }

    // Validate required fields
    if (!email || !aktenzeichen || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Missing required fields: email, aktenzeichen, firstName, lastName'
      });
    }

    // Check if client already exists
    let client = await Client.findOne({ 
      $or: [
        { email: email },
        { aktenzeichen: aktenzeichen }
      ]
    });

    if (client) {
      console.log(`📋 Client exists, updating: ${client.aktenzeichen}`);
      
      // Update existing client with Zendesk info
      client.zendesk_ticket_id = zendesk_ticket_id;
      client.zendesk_user_id = zendesk_user_id;
      client.portal_link_sent = true;
      client.portal_link_sent_at = new Date();
      client.current_status = 'portal_access_sent';
      
      // Add to Zendesk tickets array
      if (!client.zendesk_tickets.some(t => t.ticket_id === zendesk_ticket_id)) {
        client.zendesk_tickets.push({
          ticket_id: zendesk_ticket_id,
          ticket_type: 'portal_access',
          status: 'active',
          created_at: new Date()
        });
      }
      
      // Add status history entry
      client.status_history.push({
        id: uuidv4(),
        status: 'portal_access_sent',
        changed_by: 'agent',
        zendesk_ticket_id: zendesk_ticket_id,
        metadata: {
          action: 'portal_link_resent',
          agent_action: 'Portal-Link senden macro'
        }
      });
    } else {
      console.log(`👤 Creating new client: ${aktenzeichen}`);
      
      // Create new client
      client = new Client({
        id: uuidv4(),
        aktenzeichen: aktenzeichen,
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone || '',
        address: address || '',
        
        // Zendesk integration
        zendesk_user_id: zendesk_user_id,
        zendesk_ticket_id: zendesk_ticket_id,
        zendesk_tickets: [{
          ticket_id: zendesk_ticket_id,
          ticket_type: 'portal_access',
          status: 'active',
          created_at: new Date()
        }],
        
        // Portal access
        portal_link_sent: true,
        portal_link_sent_at: new Date(),
        portal_token: uuidv4(),
        
        // Status
        current_status: 'portal_access_sent',
        workflow_status: 'portal_access_sent', // Legacy compatibility
        
        // Status tracking
        status_history: [{
          id: uuidv4(),
          status: 'created',
          changed_by: 'system',
          zendesk_ticket_id: zendesk_ticket_id,
          metadata: {
            created_via: 'zendesk_webhook'
          }
        }, {
          id: uuidv4(),
          status: 'portal_access_sent',
          changed_by: 'agent',
          zendesk_ticket_id: zendesk_ticket_id,
          metadata: {
            agent_action: 'Portal-Link senden macro'
          }
        }]
      });
    }

    await client.save();
    
    console.log(`✅ Client updated/created successfully: ${client.aktenzeichen}`);
    
    // Return success response to Zendesk
    res.json({
      success: true,
      message: 'Portal access configured',
      client_id: client.id,
      aktenzeichen: client.aktenzeichen,
      portal_status: 'active',
      next_step: 'Client should receive portal access email'
    });

  } catch (error) {
    console.error('❌ Error in portal-link-sent webhook:', error);
    res.status(500).json({
      error: 'Failed to process portal link webhook',
      details: error.message
    });
  }
});

// NEW: Zendesk Webhook: User Payment Confirmed (Phase 2)
// Triggered when agent checks "erste_rate_bezahlt_user" checkbox on USER profile
router.post('/user-payment-confirmed', rateLimits.general, async (req, res) => {
  try {
    console.log('💰 Zendesk Webhook: User-Payment-Confirmed received', req.body);
    
    const {
      user_id,        // Zendesk user ID
      email,
      external_id,    // This is the aktenzeichen
      name,
      agent_email
    } = req.body;

    if (!external_id && !email) {
      return res.status(400).json({
        error: 'Missing required field: external_id (aktenzeichen) or email'
      });
    }

    // Find client by aktenzeichen (external_id) or email
    const client = await Client.findOne({ 
      $or: [
        { aktenzeichen: external_id },
        { email: email }
      ]
    });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        external_id: external_id,
        email: email
      });
    }

    console.log(`📋 Processing user payment confirmation for: ${client.firstName} ${client.lastName}`);

    // Update client status
    client.first_payment_received = true;
    client.current_status = 'payment_confirmed';
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'payment_confirmed',
      changed_by: 'agent',
      zendesk_user_id: user_id,
      metadata: {
        agent_email: agent_email || 'system',
        agent_action: 'erste_rate_bezahlt_user checkbox on user profile',
        payment_date: new Date()
      }
    });

    await client.save();

    // Analyze documents and creditors for review
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    const creditorDocs = documents.filter(d => d.is_creditor_document === true);
    
    // Check which creditors need manual review (confidence < 80%)
    const needsReview = creditors.filter(c => (c.confidence || 0) < 0.8);
    const confidenceOk = creditors.filter(c => (c.confidence || 0) >= 0.8);
    
    // Generate automatic review ticket content
    const reviewTicketContent = generateCreditorReviewTicketContent(
      client, documents, creditors, needsReview.length > 0
    );

    // Prepare data for Zendesk ticket creation
    const ticketData = {
      subject: `Gläubiger-Review: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`,
      requester_email: client.email,
      requester_id: user_id,
      tags: ['gläubiger-review', 'payment-confirmed', needsReview.length > 0 ? 'manual-review-needed' : 'auto-approved'],
      priority: needsReview.length > 0 ? 'normal' : 'low',
      type: 'task',
      comment: {
        body: reviewTicketContent,
        public: false // Internal note
      }
    };

    console.log(`✅ Payment confirmed for ${client.aktenzeichen}. Documents: ${documents.length}, Creditors: ${creditors.length}, Need Review: ${needsReview.length}`);

    res.json({
      success: true,
      message: 'User payment confirmation processed - Ready to create review ticket',
      client_status: 'payment_confirmed',
      documents_count: documents.length,
      creditor_documents: creditorDocs.length,
      extracted_creditors: creditors.length,
      creditors_need_review: needsReview.length,
      creditors_confidence_ok: confidenceOk.length,
      manual_review_required: needsReview.length > 0,
      zendesk_ticket_data: ticketData,
      review_dashboard_url: needsReview.length > 0 
        ? `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`
        : null,
      next_step: needsReview.length > 0 
        ? 'Create review ticket with manual correction needed' 
        : 'Create review ticket - All creditors verified - Ready for client confirmation'
    });

  } catch (error) {
    console.error('❌ Error in user-payment-confirmed webhook:', error);
    res.status(500).json({
      error: 'Failed to process user payment confirmation',
      details: error.message
    });
  }
});

// PRIMARY: Zendesk Webhook: Payment Confirmed
// Triggered when agent checks "erste_rate_bezahlt" checkbox on a ticket
router.post('/payment-confirmed', rateLimits.general, async (req, res) => {
  try {
    console.log('💰 Zendesk Webhook: Payment-Confirmed received', req.body);
    
    // Extract data from the webhook payload
    // The aktenzeichen comes from ticket.requester.aktenzeichen (custom field)
    let aktenzeichen, zendesk_ticket_id, requester_email, requester_name, agent_email;
    
    if (req.body.ticket) {
      // Standard webhook format with ticket data
      const ticket = req.body.ticket;
      const requester = ticket.requester || {};
      
      aktenzeichen = requester.aktenzeichen; // This is the custom field!
      zendesk_ticket_id = ticket.id;
      requester_email = requester.email;
      requester_name = requester.name;
      agent_email = req.body.agent_email || req.body.current_user?.email || 'system';
      
      console.log('📋 Extracted ticket data:', {
        aktenzeichen,
        zendesk_ticket_id,
        requester_email,
        requester_name
      });
    } else {
      // Fallback for direct format (backward compatibility)
      ({
        aktenzeichen,
        zendesk_ticket_id,
        agent_email
      } = req.body);
    }

    if (!aktenzeichen) {
      console.error('❌ Missing aktenzeichen in webhook payload:', req.body);
      return res.status(400).json({
        error: 'Missing required field: aktenzeichen',
        hint: 'Make sure ticket.requester.aktenzeichen is populated in Zendesk webhook'
      });
    }

    // Find client by aktenzeichen
    const client = await Client.findOne({ aktenzeichen: aktenzeichen });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        aktenzeichen: aktenzeichen
      });
    }

    console.log(`📋 Processing payment confirmation for: ${client.firstName} ${client.lastName}`);

    // Update client status
    client.first_payment_received = true;
    client.current_status = 'payment_confirmed';
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'payment_confirmed',
      changed_by: 'agent',
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_email: agent_email,
        agent_action: 'erste_rate_bezahlt checkbox (legacy ticket-based)',
        payment_date: new Date()
      }
    });

    await client.save();

    // Analyze documents and creditors for review
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    const creditorDocs = documents.filter(d => d.is_creditor_document === true);
    
    // Check which creditors need manual review (confidence < 80%)
    const needsReview = creditors.filter(c => (c.confidence || 0) < 0.8);
    const confidenceOk = creditors.filter(c => (c.confidence || 0) >= 0.8);
    
    // Generate automatic review ticket content
    const reviewTicketContent = generateCreditorReviewTicketContent(
      client, documents, creditors, needsReview.length > 0
    );

    console.log(`✅ Payment confirmed for ${client.aktenzeichen}. Documents: ${documents.length}, Creditors: ${creditors.length}, Need Review: ${needsReview.length}`);

    res.json({
      success: true,
      message: 'Payment confirmation processed - Creditor review ticket ready',
      client_status: 'payment_confirmed',
      documents_count: documents.length,
      creditor_documents: creditorDocs.length,
      extracted_creditors: creditors.length,
      creditors_need_review: needsReview.length,
      creditors_confidence_ok: confidenceOk.length,
      manual_review_required: needsReview.length > 0,
      review_ticket_content: reviewTicketContent,
      review_dashboard_url: needsReview.length > 0 
        ? `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`
        : null,
      next_step: needsReview.length > 0 
        ? 'Create review ticket - Manual correction needed' 
        : 'All creditors verified - Send confirmation request to client'
    });

  } catch (error) {
    console.error('❌ Error in payment-confirmed webhook:', error);
    res.status(500).json({
      error: 'Failed to process payment confirmation',
      details: error.message
    });
  }
});

// Zendesk Webhook: Start Manual Review (Phase 2)
// Triggered when agent clicks "Manuelle Prüfung starten" button
router.post('/start-manual-review', rateLimits.general, async (req, res) => {
  try {
    console.log('🔍 Zendesk Webhook: Start-Manual-Review received', req.body);
    
    const { aktenzeichen, zendesk_ticket_id, agent_email } = req.body;

    if (!aktenzeichen) {
      return res.status(400).json({
        error: 'Missing required field: aktenzeichen'
      });
    }

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        aktenzeichen: aktenzeichen
      });
    }

    // Update client status to indicate review in progress
    client.current_status = 'under_manual_review';
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'under_manual_review',
      changed_by: 'agent',
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_email: agent_email,
        agent_action: 'Started manual creditor review',
        review_started_at: new Date()
      }
    });

    await client.save();

    const reviewUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`;

    console.log(`✅ Manual review started for ${client.aktenzeichen}`);

    res.json({
      success: true,
      message: 'Manual review session started',
      client_status: 'under_manual_review',
      review_dashboard_url: reviewUrl,
      documents_to_review: (client.documents || []).filter(d => d.is_creditor_document).length,
      creditors_need_review: (client.final_creditor_list || []).filter(c => (c.confidence || 0) < 0.8).length,
      next_step: 'Agent should open review dashboard and correct AI extractions'
    });

  } catch (error) {
    console.error('❌ Error in start-manual-review webhook:', error);
    res.status(500).json({
      error: 'Failed to start manual review',
      details: error.message
    });
  }
});

// Zendesk Webhook: Manual Review Complete (Phase 2)
// Triggered when agent completes manual review and clicks "Review abgeschlossen"
router.post('/manual-review-complete', rateLimits.general, async (req, res) => {
  try {
    console.log('✅ Zendesk Webhook: Manual-Review-Complete received', req.body);
    
    const { aktenzeichen, zendesk_ticket_id, agent_email } = req.body;

    if (!aktenzeichen) {
      return res.status(400).json({
        error: 'Missing required field: aktenzeichen'
      });
    }

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        aktenzeichen: aktenzeichen
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
        agent_email: agent_email,
        agent_action: 'Completed manual creditor review',
        review_completed_at: new Date()
      }
    });

    await client.save();

    // Generate final creditor summary for Zendesk ticket update
    const creditors = client.final_creditor_list || [];
    const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
    
    const finalCreditorsList = creditors.map(c => 
      `✅ ${c.sender_name || 'Unbekannt'} - ${c.claim_amount || 'N/A'}€`
    ).join('\n');

    const finalTicketContent = `✅ REVIEW ABGESCHLOSSEN

📊 FINALE GLÄUBIGER-LISTE:
${finalCreditorsList}

💰 FINALE GESAMTSCHULD: ${totalDebt.toFixed(2)}€

🚀 BEREIT FÜR KUNDEN-BESTÄTIGUNG
[BUTTON: Gläubigerliste zur Bestätigung senden]

📁 Mandant: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`;

    console.log(`✅ Manual review completed for ${client.aktenzeichen}`);

    res.json({
      success: true,
      message: 'Manual review completed successfully',
      client_status: 'manual_review_complete',
      creditors_count: creditors.length,
      total_debt: totalDebt,
      final_ticket_content: finalTicketContent,
      next_step: 'Ready to send creditor confirmation request to client'
    });

  } catch (error) {
    console.error('❌ Error in manual-review-complete webhook:', error);
    res.status(500).json({
      error: 'Failed to complete manual review',
      details: error.message
    });
  }
});

// Zendesk Webhook: Creditor Confirmation Request
// Triggered when agent uses "Gläubigerliste zur Bestätigung" macro
router.post('/creditor-confirmation-request', rateLimits.general, async (req, res) => {
  try {
    console.log('📋 Zendesk Webhook: Creditor-Confirmation-Request received', req.body);
    
    const {
      aktenzeichen,
      zendesk_ticket_id,
      agent_email
    } = req.body;

    if (!aktenzeichen) {
      return res.status(400).json({
        error: 'Missing required field: aktenzeichen'
      });
    }

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        aktenzeichen: aktenzeichen
      });
    }

    // Update client status
    client.current_status = 'awaiting_client_confirmation';
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'awaiting_client_confirmation',
      changed_by: 'agent',
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_email: agent_email,
        agent_action: 'Gläubigerliste zur Bestätigung macro',
        creditors_count: client.final_creditor_list?.length || 0
      }
    });

    await client.save();

    console.log(`✅ Creditor confirmation request processed for ${client.aktenzeichen}`);

    res.json({
      success: true,
      message: 'Creditor confirmation request processed',
      client_status: 'awaiting_client_confirmation',
      portal_url: `${process.env.FRONTEND_URL}/portal/confirm-creditors?token=${client.portal_token}`,
      creditors_count: client.final_creditor_list?.length || 0,
      next_step: 'Client will receive confirmation email with portal link'
    });

  } catch (error) {
    console.error('❌ Error in creditor-confirmation-request webhook:', error);
    res.status(500).json({
      error: 'Failed to process creditor confirmation request',
      details: error.message
    });
  }
});

// Helper function to generate creditor review ticket content for Phase 2
function generateCreditorReviewTicketContent(client, documents, creditors, needsManualReview) {
  const completedDocs = documents.filter(d => d.processing_status === 'completed');
  const creditorDocs = documents.filter(d => d.is_creditor_document === true);
  const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
  
  // Separate creditors by confidence level
  const confidenceOk = creditors.filter(c => (c.confidence || 0) >= 0.8);
  const needsReview = creditors.filter(c => (c.confidence || 0) < 0.8);
  
  // Generate creditor lists
  const verifiedCreditors = confidenceOk.map(c => 
    `✅ ${c.sender_name || 'Unbekannt'} - ${c.claim_amount || 'N/A'}€ (Confidence: ${Math.round((c.confidence || 0) * 100)}%)`
  ).join('\n');
  
  const reviewCreditors = needsReview.map(c => 
    `⚠️ ${c.sender_name || 'Unbekannt'} - ${c.claim_amount || 'N/A'}€ (Confidence: ${Math.round((c.confidence || 0) * 100)}%) → PRÜFUNG NÖTIG`
  ).join('\n');

  const reviewUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`;

  return `🤖 GLÄUBIGER-ANALYSE FÜR: ${client.firstName} ${client.lastName}

📊 AI-VERARBEITUNG ABGESCHLOSSEN:
• Dokumente verarbeitet: ${completedDocs.length}/${documents.length}
• Gläubiger erkannt: ${creditors.length}
• Manuelle Prüfung erforderlich: ${needsReview.length} ${needsManualReview ? '⚠️' : '✅'}

📋 ERKANNTE GLÄUBIGER:
${verifiedCreditors || 'Keine verifizierten Gläubiger'}

${reviewCreditors ? `🔍 MANUELLE PRÜFUNG ERFORDERLICH:
${reviewCreditors}` : ''}

💰 GESCHÄTZTE GESAMTSCHULD: ${totalDebt.toFixed(2)}€

${needsManualReview ? `🔧 AGENT-AKTIONEN:
[BUTTON: Manuelle Prüfung starten] → ${reviewUrl}

Nach der manuellen Prüfung:
[BUTTON: Gläubigerliste zur Bestätigung senden]` : `✅ ALLE GLÄUBIGER VERIFIZIERT:
[BUTTON: Gläubigerliste zur Bestätigung senden]`}

🔗 Mandant Portal: ${process.env.FRONTEND_URL}/login?token=${client.portal_token}
📁 Aktenzeichen: ${client.aktenzeichen}`;
}

// Helper function to generate Zendesk ticket content (legacy)
function generateGlaeubierProcessContent(client, documents, creditors) {
  const completedDocs = documents.filter(d => d.processing_status === 'completed');
  const creditorDocs = documents.filter(d => d.is_creditor_document === true);
  const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);

  const creditorsList = creditors.map(c => 
    `• ${c.sender_name || 'Unbekannt'} - ${c.claim_amount || 'N/A'}€ (Ref: ${c.reference_number || 'N/A'})`
  ).join('\n');

  return `🤖 AUTOMATISCHE DOKUMENTEN-ANALYSE ABGESCHLOSSEN

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}

📊 DOKUMENTE-STATUS:
- Hochgeladen: ${documents.length} Dokumente
- Verarbeitet: ${completedDocs.length} Dokumente
- Gläubigerdokumente erkannt: ${creditorDocs.length}
- Verarbeitung: ${completedDocs.length === documents.length ? '✅ Abgeschlossen' : '⏳ In Bearbeitung'}

📋 ERKANNTE GLÄUBIGER (${creditors.length}):
${creditorsList || 'Keine Gläubiger erkannt'}

💰 GESCHÄTZTE GESAMTSCHULD: ${totalDebt.toFixed(2)} EUR

⚠️ AGENT-AKTION ERFORDERLICH:
${creditors.length > 0 
  ? '📤 Gläubigerliste zur Bestätigung an Mandant senden' 
  : '📄 Dokumente beim Mandant anfordern - keine Gläubigerdokumente gefunden'
}

🔗 Portal-Link: ${process.env.FRONTEND_URL}/login?token=${client.portal_token}`;
}

module.exports = router;