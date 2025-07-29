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
    
    const {
      email,
      aktenzeichen,
      firstName,
      lastName,
      zendesk_ticket_id,
      zendesk_user_id,
      phone,
      address
    } = req.body;

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

// Zendesk Webhook: Payment Confirmed
// Triggered when agent checks "erste_rate_bezahlt" checkbox
router.post('/payment-confirmed', rateLimits.general, async (req, res) => {
  try {
    console.log('💰 Zendesk Webhook: Payment-Confirmed received', req.body);
    
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
        agent_action: 'erste_rate_bezahlt checkbox',
        payment_date: new Date()
      }
    });

    await client.save();

    // Generate response for Zendesk ticket
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    const creditorDocs = documents.filter(d => d.is_creditor_document === true);

    const ticketContent = generateGlaeubierProcessContent(client, documents, creditors);

    console.log(`✅ Payment confirmed for ${client.aktenzeichen}. Documents: ${documents.length}, Creditors: ${creditors.length}`);

    res.json({
      success: true,
      message: 'Payment confirmation processed',
      client_status: 'payment_confirmed',
      documents_count: documents.length,
      creditor_documents: creditorDocs.length,
      extracted_creditors: creditors.length,
      ticket_content: ticketContent,
      next_step: creditors.length > 0 ? 'Create creditor process ticket' : 'Request document upload'
    });

  } catch (error) {
    console.error('❌ Error in payment-confirmed webhook:', error);
    res.status(500).json({
      error: 'Failed to process payment confirmation',
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

// Helper function to generate Zendesk ticket content
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