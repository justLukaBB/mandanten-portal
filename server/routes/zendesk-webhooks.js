const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { rateLimits } = require('../middleware/security');
const ZendeskService = require('../services/zendeskService');
const CreditorContactService = require('../services/creditorContactService');

const router = express.Router();

// Initialize Zendesk service
const zendeskService = new ZendeskService();

// Middleware to handle Zendesk's specific JSON format
const parseZendeskPayload = (req, res, next) => {
  console.log('🔍 Zendesk Payload Parser - Original body type:', typeof req.body);
  
  // If body is a string, try to parse it
  if (typeof req.body === 'string') {
    try {
      console.log('📜 Attempting to parse string body as JSON...');
      req.body = JSON.parse(req.body);
      console.log('✅ Successfully parsed string body to JSON');
    } catch (e) {
      console.error('❌ Failed to parse string body:', e.message);
      return res.status(400).json({
        error: 'Invalid JSON in request body',
        details: e.message,
        receivedType: typeof req.body,
        receivedBody: req.body.substring(0, 100) + '...'
      });
    }
  }
  
  // Log the final parsed body
  console.log('📦 Final parsed body:', JSON.stringify(req.body, null, 2));
  next();
};

// Zendesk Webhook: Portal Link Sent
// Triggered when agent uses "Portal-Link senden" macro
router.post('/portal-link-sent', parseZendeskPayload, rateLimits.general, async (req, res) => {
  try {
    console.log('🔗 Zendesk Webhook: Portal-Link-Sent received', req.body);
    
    // Handle both direct format and Zendesk webhook format
    let email, aktenzeichen, firstName, lastName, zendesk_ticket_id, zendesk_user_id, phone, address;
    
    if (req.body.ticket && req.body.ticket.requester) {
      // Zendesk webhook format
      const requester = req.body.ticket.requester;
      const ticket = req.body.ticket;
      
      email = requester.email;
      aktenzeichen = requester.aktenzeichen; // This is the custom field!
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
      
      try {
        // Update only specific fields to avoid document validation issues
        const updateData = {
          zendesk_ticket_id: zendesk_ticket_id,
          zendesk_user_id: zendesk_user_id,
          portal_link_sent: true,
          portal_link_sent_at: new Date(),
          current_status: 'portal_access_sent',
          updated_at: new Date()
        };
        
        // Update with $push and $set to avoid document array validation
        const updatedClient = await Client.findOneAndUpdate(
        { _id: client._id },
        {
          $set: updateData,
          $push: {
            zendesk_tickets: {
              ticket_id: zendesk_ticket_id,
              ticket_type: 'portal_access',
              status: 'active',
              created_at: new Date()
            },
            status_history: {
              id: uuidv4(),
              status: 'portal_access_sent',
              changed_by: 'agent',
              zendesk_ticket_id: zendesk_ticket_id,
              metadata: {
                action: 'portal_link_resent',
                agent_action: 'Portal-Link senden macro'
              }
            }
          }
        },
        { 
          new: true,
          runValidators: false, // Skip validation for legacy documents
          strict: false // Allow fields not in schema
        }
      );
      
      // Use the updated client directly - no reload needed
      client = updatedClient;
      
      } catch (updateError) {
        console.error('❌ Error updating existing client, falling back to basic update:', updateError.message);
        
        // Fallback: Just update the critical fields without touching documents
        client.zendesk_ticket_id = zendesk_ticket_id;
        client.zendesk_user_id = zendesk_user_id;
        client.portal_link_sent = true;
        client.portal_link_sent_at = new Date();
        client.current_status = 'portal_access_sent';
        client.updated_at = new Date();
        
        // Save without validation for documents
        await client.save({ validateModifiedOnly: true });
      }
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
      
      await client.save();
    }
    
    console.log(`✅ Client updated/created successfully: ${client.aktenzeichen}`);
    console.log(`   📋 Client details:`, {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      aktenzeichen: client.aktenzeichen,
      current_status: client.current_status,
      created_at: client.created_at,
      updated_at: client.updated_at
    });
    
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
router.post('/user-payment-confirmed', parseZendeskPayload, rateLimits.general, async (req, res) => {
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

    // ANALYZE CURRENT STATE AND DETERMINE SCENARIO (same logic as payment-confirmed webhook)
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    const creditorDocs = documents.filter(d => d.is_creditor_document === true);
    
    const state = {
      hasDocuments: documents.length > 0,
      allProcessed: documents.length > 0 && completedDocs.length === documents.length,
      hasCreditors: creditors.length > 0,
      needsManualReview: creditors.some(c => (c.confidence || 0) < 0.8)
    };

    // DETERMINE PAYMENT TICKET TYPE BASED ON SCENARIO
    let ticketType, nextAction;

    if (!state.hasDocuments) {
      // No documents uploaded yet
      ticketType = 'document_request';
      nextAction = 'send_document_upload_request';
      client.payment_ticket_type = 'document_request';
      client.document_request_sent_at = new Date();
      
    } else if (!state.allProcessed) {
      // Documents uploaded but still processing
      ticketType = 'processing_wait';
      nextAction = 'wait_for_processing_complete';
      client.payment_ticket_type = 'processing_wait';
      
    } else if (!state.hasCreditors) {
      // Documents processed but no creditors found
      ticketType = 'no_creditors_found';
      nextAction = 'manual_document_check';
      client.payment_ticket_type = 'no_creditors_found';
      
    } else {
      // Documents processed, creditors found - ready for review
      if (state.needsManualReview) {
        ticketType = 'manual_review';
        nextAction = 'start_manual_review';
        client.payment_ticket_type = 'manual_review';
      } else {
        ticketType = 'auto_approved';
        nextAction = 'send_confirmation_to_client';
        client.payment_ticket_type = 'auto_approved';
      }
    }

    // Update client with payment processing info
    client.payment_processed_at = new Date();
    
    // Save client with error handling for document validation issues
    try {
      await client.save({ validateModifiedOnly: true });
    } catch (saveError) {
      console.error('⚠️ Error saving client with payment_processed_at, using direct update:', saveError.message);
      
      // Use direct update to bypass validation
      await Client.findOneAndUpdate(
        { _id: client._id },
        {
          $set: {
            payment_processed_at: new Date(),
            payment_ticket_type: client.payment_ticket_type
          }
        },
        { runValidators: false }
      );
    }
    
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

    console.log(`✅ Payment confirmed for ${client.aktenzeichen}. Ticket Type: ${ticketType}, Documents: ${documents.length}, Creditors: ${creditors.length}, Need Review: ${needsReview.length}`);

    res.json({
      success: true,
      message: `User payment confirmation processed - ${ticketType}`,
      client_status: 'payment_confirmed',
      payment_ticket_type: ticketType,
      next_action: nextAction,
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
      scenario_analysis: {
        hasDocuments: state.hasDocuments,
        allProcessed: state.allProcessed,
        hasCreditors: state.hasCreditors,
        needsManualReview: state.needsManualReview
      }
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
router.post('/payment-confirmed', parseZendeskPayload, rateLimits.general, async (req, res) => {
  try {
    console.log('💰 Zendesk Webhook: Payment-Confirmed received');
    console.log('Request Headers:', req.headers);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Body Type:', typeof req.body);
    console.log('Is req.body an object?', req.body && typeof req.body === 'object');
    
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

    // Save with validation workaround
    try {
      await client.save({ validateModifiedOnly: true });
    } catch (saveError) {
      console.error('⚠️ Error saving client with full validation, trying without document validation:', saveError.message);
      
      // Update using findOneAndUpdate to bypass document validation
      await Client.findOneAndUpdate(
        { _id: client._id },
        {
          $set: {
            first_payment_received: true,
            current_status: 'payment_confirmed',
            updated_at: new Date()
          },
          $push: {
            status_history: {
              id: uuidv4(),
              status: 'payment_confirmed',
              changed_by: 'agent',
              zendesk_ticket_id: zendesk_ticket_id,
              metadata: {
                agent_email: agent_email,
                agent_action: 'erste_rate_bezahlt checkbox',
                payment_date: new Date()
              }
            }
          }
        },
        { runValidators: false }
      );
    }

    // ANALYZE CURRENT STATE AND DETERMINE SCENARIO
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    const creditorDocs = documents.filter(d => d.is_creditor_document === true);
    
    const state = {
      hasDocuments: documents.length > 0,
      allProcessed: documents.length > 0 && completedDocs.length === documents.length,
      hasCreditors: creditors.length > 0,
      needsManualReview: creditors.some(c => (c.confidence || 0) < 0.8)
    };

    // DETERMINE TICKET TYPE AND CONTENT BASED ON SCENARIO
    let ticketType, ticketContent, nextAction, tags;

    if (!state.hasDocuments) {
      // SCENARIO 2: No documents uploaded yet
      ticketType = 'document_request';
      ticketContent = generateDocumentRequestTicket(client);
      nextAction = 'send_document_upload_request';
      tags = ['payment-confirmed', 'document-request', 'awaiting-documents'];
      
      // Track document request
      client.payment_ticket_type = 'document_request';
      client.document_request_sent_at = new Date();
      
    } else if (!state.allProcessed) {
      // SCENARIO 3: Documents uploaded but still processing
      ticketType = 'processing_wait';
      ticketContent = generateProcessingWaitTicket(client, documents, completedDocs);
      nextAction = 'wait_for_processing_complete';
      tags = ['payment-confirmed', 'processing-wait', 'ai-processing'];
      
      client.payment_ticket_type = 'processing_wait';
      
    } else if (!state.hasCreditors) {
      // SCENARIO: Documents processed but no creditors found
      ticketType = 'no_creditors_found';
      ticketContent = generateNoCreditorsTicket(client, documents);
      nextAction = 'manual_document_check';
      tags = ['payment-confirmed', 'no-creditors', 'manual-check-needed'];
      
      client.payment_ticket_type = 'no_creditors_found';
      
    } else {
      // SCENARIO 1: Documents processed, creditors found - ready for review
      if (state.needsManualReview) {
        ticketType = 'manual_review';
        ticketContent = generateCreditorReviewTicketContent(client, documents, creditors, true);
        nextAction = 'start_manual_review';
        tags = ['payment-confirmed', 'manual-review-needed', 'creditors-found'];
        client.payment_ticket_type = 'manual_review';
      } else {
        ticketType = 'auto_approved';
        ticketContent = generateCreditorReviewTicketContent(client, documents, creditors, false);
        nextAction = 'send_confirmation_to_client';
        tags = ['payment-confirmed', 'auto-approved', 'ready-for-confirmation'];
        client.payment_ticket_type = 'auto_approved';
      }
    }

    // Update client with payment processing info
    client.payment_processed_at = new Date();
    
    // Save client with error handling for document validation issues
    try {
      await client.save({ validateModifiedOnly: true });
    } catch (saveError) {
      console.error('⚠️ Error saving client with payment_processed_at (line 604), using direct update:', saveError.message);
      
      // Use direct update to bypass validation
      await Client.findOneAndUpdate(
        { _id: client._id },
        {
          $set: {
            payment_processed_at: new Date(),
            payment_ticket_type: client.payment_ticket_type
          }
        },
        { runValidators: false }
      );
    }

    // AUTOMATICALLY CREATE ZENDESK TICKET
    let zendeskTicket = null;
    let ticketCreationError = null;

    if (zendeskService.isConfigured()) {
      try {
        console.log('🎫 Creating automatic Zendesk ticket...');
        
        zendeskTicket = await zendeskService.createTicket({
          subject: generateTicketSubject(client, ticketType),
          content: ticketContent,
          requesterEmail: client.email,
          tags: tags,
          priority: ticketType === 'manual_review' ? 'normal' : 'low',
          type: 'task'
        });

        if (zendeskTicket.success) {
          // Store the created ticket ID for reference
          client.zendesk_tickets = client.zendesk_tickets || [];
          client.zendesk_tickets.push({
            ticket_id: zendeskTicket.ticket_id,
            ticket_type: 'payment_review',
            ticket_scenario: ticketType,
            status: 'active',
            created_at: new Date()
          });
          
          // Add to status history
          client.status_history.push({
            id: uuidv4(),
            status: 'zendesk_ticket_created',
            changed_by: 'system',
            metadata: {
              zendesk_ticket_id: zendeskTicket.ticket_id,
              ticket_scenario: ticketType,
              ticket_subject: generateTicketSubject(client, ticketType)
            }
          });

          // Save using update to avoid validation issues with legacy documents
          try {
            await client.save({ validateModifiedOnly: true });
          } catch (saveError) {
            console.error('⚠️ Error saving after ticket creation, using direct update:', saveError.message);
            
            // Use direct update to bypass validation
            await Client.findOneAndUpdate(
              { _id: client._id },
              {
                $push: {
                  zendesk_tickets: {
                    ticket_id: zendeskTicket.ticket_id,
                    ticket_type: 'payment_review',
                    ticket_scenario: ticketType,
                    status: 'active',
                    created_at: new Date()
                  },
                  status_history: {
                    id: uuidv4(),
                    status: 'zendesk_ticket_created',
                    changed_by: 'system',
                    metadata: {
                      zendesk_ticket_id: zendeskTicket.ticket_id,
                      ticket_scenario: ticketType,
                      ticket_subject: generateTicketSubject(client, ticketType)
                    }
                  }
                }
              },
              { runValidators: false }
            );
          }
          
          console.log(`✅ Zendesk ticket created: ${zendeskTicket.ticket_id}`);
          
          // AUTO-SEND DOCUMENT REMINDER EMAIL for document_request scenarios
          if (ticketType === 'document_request') {
            try {
              console.log(`📧 Auto-sending document reminder email to ${client.email}...`);
              
              // Generate email content
              const emailSubject = `Dokumente benötigt für Ihr Insolvenzverfahren - Aktenzeichen ${client.aktenzeichen}`;
              const portalUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login`;
              
              const emailBody = `Sehr geehrte/r ${client.firstName} ${client.lastName},

vielen Dank für Ihre erste Ratenzahlung! Wir haben diese erhalten und können nun mit Ihrem Insolvenzverfahren fortfahren.

Um den nächsten Schritt einzuleiten, benötigen wir dringend Ihre Gläubigerdokumente.

IHRE ZUGANGSDATEN:
==================
Portal-Link: ${portalUrl}
E-Mail: ${client.email}
Aktenzeichen: ${client.aktenzeichen}

BENÖTIGTE DOKUMENTE:
===================
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge
• Inkasso-Schreiben
• Kreditverträge
• Sonstige Gläubigerschreiben

WICHTIG: Bitte laden Sie ALLE Dokumente Ihrer Gläubiger hoch, auch ältere Schreiben.

So laden Sie Ihre Dokumente hoch:
1. Klicken Sie auf den Portal-Link oben
2. Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Aktenzeichen an
3. Klicken Sie auf "Dokumente hochladen"
4. Wählen Sie Ihre Dokumente aus oder fotografieren Sie diese mit Ihrem Smartphone

Bei Fragen oder technischen Problemen erreichen Sie uns unter:
info@ra-scuric.de
0234 9136810

Mit freundlichen Grüßen
Ihr Insolvenz-Team

PS: Diese E-Mail wurde automatisch generiert, nachdem Ihre Zahlung eingegangen ist.`;
              
              // Create side conversation to send email
              const sideConversationResult = await zendeskService.createSideConversation(
                zendeskTicket.ticket_id,
                {
                  recipientEmail: client.email,
                  recipientName: `${client.firstName} ${client.lastName}`,
                  subject: emailSubject,
                  body: emailBody,
                  internalNote: true
                }
              );
              
              if (sideConversationResult.success) {
                console.log(`✅ Document reminder email sent to ${client.email}`);
                
                // Update client status history
                client.status_history.push({
                  id: uuidv4(),
                  status: 'document_reminder_email_sent',
                  changed_by: 'system',
                  metadata: {
                    side_conversation_id: sideConversationResult.side_conversation_id,
                    email_sent_to: client.email,
                    zendesk_ticket_id: zendeskTicket.ticket_id
                  }
                });
                
                // Update document request timestamp
                client.document_request_email_sent_at = new Date();
                
                // Save client updates
                try {
                  await client.save({ validateModifiedOnly: true });
                } catch (saveError) {
                  console.error('⚠️ Error saving after email sent, using direct update:', saveError.message);
                  
                  await Client.findOneAndUpdate(
                    { _id: client._id },
                    {
                      $set: {
                        document_request_email_sent_at: new Date()
                      },
                      $push: {
                        status_history: {
                          id: uuidv4(),
                          status: 'document_reminder_email_sent',
                          changed_by: 'system',
                          metadata: {
                            side_conversation_id: sideConversationResult.side_conversation_id,
                            email_sent_to: client.email,
                            zendesk_ticket_id: zendeskTicket.ticket_id
                          }
                        }
                      }
                    },
                    { runValidators: false }
                  );
                }
              } else {
                console.error(`❌ Failed to send document reminder email: ${sideConversationResult.error}`);
              }
              
            } catch (emailError) {
              console.error(`❌ Error sending document reminder email for ${client.aktenzeichen}:`, emailError.message);
            }
          }
          
          // AUTO-TRIGGER CREDITOR CONTACT for auto_approved scenarios
          if (ticketType === 'auto_approved' && creditors.length > 0) {
            try {
              console.log(`🚀 Auto-triggering creditor contact for auto-approved client ${client.aktenzeichen}...`);
              
              const creditorService = new CreditorContactService();
              const creditorContactResult = await creditorService.processClientCreditorConfirmation(client.aktenzeichen);
              
              console.log(`✅ Auto-approved creditor contact started: Main ticket ID ${creditorContactResult.main_ticket_id}, ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);
              
              // Update client status
              client.current_status = 'creditor_contact_initiated';
              client.payment_ticket_type = 'creditor_contact_initiated';
              client.updated_at = new Date();
              
              client.status_history.push({
                id: uuidv4(),
                status: 'creditor_contact_initiated',
                changed_by: 'system',
                metadata: {
                  triggered_by: 'auto_approved_payment_confirmation',
                  main_ticket_id: creditorContactResult.main_ticket_id,
                  emails_sent: creditorContactResult.emails_sent,
                  total_creditors: creditors.length,
                  side_conversations_created: creditorContactResult.side_conversation_results?.length || 0
                }
              });
              
              // Save with error handling
              try {
                await client.save({ validateModifiedOnly: true });
              } catch (saveError) {
                console.error('⚠️ Error saving client after successful creditor contact, using direct update:', saveError.message);
                await Client.findOneAndUpdate(
                  { _id: client._id },
                  {
                    $set: {
                      current_status: 'creditor_contact_initiated',
                      payment_ticket_type: 'creditor_contact_initiated',
                      updated_at: new Date()
                    },
                    $push: {
                      status_history: {
                        id: uuidv4(),
                        status: 'creditor_contact_initiated',
                        changed_by: 'system',
                        metadata: {
                          triggered_by: 'auto_approved_payment_confirmation',
                          main_ticket_id: creditorContactResult.main_ticket_id,
                          emails_sent: creditorContactResult.emails_sent,
                          total_creditors: creditors.length,
                          side_conversations_created: creditorContactResult.side_conversation_results?.length || 0
                        }
                      }
                    }
                  },
                  { runValidators: false }
                );
              }
              
            } catch (creditorError) {
              console.error(`❌ Failed to auto-trigger creditor contact for ${client.aktenzeichen}:`, creditorError.message);
              
              client.current_status = 'creditor_contact_failed';
              client.status_history.push({
                id: uuidv4(),
                status: 'creditor_contact_failed',
                changed_by: 'system',
                metadata: {
                  error_message: creditorError.message,
                  requires_manual_action: true
                }
              });
              
              // Save with error handling
              try {
                await client.save({ validateModifiedOnly: true });
              } catch (saveError) {
                console.error('⚠️ Error saving client after failed creditor contact, using direct update:', saveError.message);
                await Client.findOneAndUpdate(
                  { _id: client._id },
                  {
                    $set: {
                      current_status: 'creditor_contact_failed'
                    },
                    $push: {
                      status_history: {
                        id: uuidv4(),
                        status: 'creditor_contact_failed',
                        changed_by: 'system',
                        metadata: {
                          error_message: creditorError.message,
                          requires_manual_action: true
                        }
                      }
                    }
                  },
                  { runValidators: false }
                );
              }
            }
          }
          
        } else {
          ticketCreationError = zendeskTicket.error;
          console.error('❌ Failed to create Zendesk ticket:', zendeskTicket.error);
        }
      } catch (error) {
        ticketCreationError = error.message;
        console.error('❌ Exception creating Zendesk ticket:', error);
      }
    } else {
      console.log('⚠️ Zendesk service not configured - skipping automatic ticket creation');
      ticketCreationError = 'Zendesk API not configured';
    }

    console.log(`✅ Payment confirmed for ${client.aktenzeichen}. Scenario: ${ticketType}, Documents: ${documents.length}, Creditors: ${creditors.length}`);

    res.json({
      success: true,
      message: `Payment confirmation processed - ${ticketType} scenario`,
      scenario: ticketType,
      client_status: 'payment_confirmed',
      state: state,
      ticket_data: {
        subject: generateTicketSubject(client, ticketType),
        content: ticketContent,
        tags: tags,
        priority: ticketType === 'manual_review' ? 'normal' : 'low'
      },
      zendesk_ticket: zendeskTicket ? {
        created: zendeskTicket.success,
        ticket_id: zendeskTicket.ticket_id,
        scenario: ticketType,
        error: ticketCreationError
      } : {
        created: false,
        error: ticketCreationError
      },
      review_dashboard_url: (ticketType === 'manual_review') 
        ? `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`
        : null,
      next_action: nextAction,
      documents_count: documents.length,
      creditor_documents_count: creditorDocs.length,
      extracted_creditors_count: creditors.length,
      processing_complete: state.allProcessed
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

// NEW: Processing Complete Webhook
// Triggered when AI processing finishes for a client who paid first rate
router.post('/processing-complete', rateLimits.general, async (req, res) => {
  try {
    console.log('🔄 Zendesk Webhook: Processing-Complete received', req.body);
    
    const { client_id, document_id } = req.body;

    if (!client_id) {
      return res.status(400).json({
        error: 'Missing required field: client_id'
      });
    }

    const client = await Client.findOne({ id: client_id });
    
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        client_id: client_id
      });
    }

    // Check if this client paid first rate and is waiting for processing
    if (!client.first_payment_received || client.payment_ticket_type !== 'processing_wait') {
      return res.json({
        success: true,
        message: 'Processing complete but client not in waiting state',
        client_status: client.current_status,
        payment_ticket_type: client.payment_ticket_type
      });
    }

    // Check if all documents are now processed
    const documents = client.documents || [];
    const completedDocs = documents.filter(d => d.processing_status === 'completed');
    
    if (completedDocs.length < documents.length) {
      console.log(`Still processing: ${documents.length - completedDocs.length} documents remaining`);
      return res.json({
        success: true,
        message: 'Still processing remaining documents',
        progress: `${completedDocs.length}/${documents.length}`
      });
    }

    // All documents processed - analyze and create review ticket
    const creditors = client.final_creditor_list || [];
    const state = {
      hasCreditors: creditors.length > 0,
      needsManualReview: creditors.some(c => (c.confidence || 0) < 0.8)
    };

    let ticketType, ticketContent, tags;

    if (!state.hasCreditors) {
      ticketType = 'no_creditors_found';
      ticketContent = generateNoCreditorsTicket(client, documents);
      tags = ['processing-complete', 'no-creditors', 'manual-check-needed'];
      client.payment_ticket_type = 'no_creditors_found';
    } else if (state.needsManualReview) {
      ticketType = 'manual_review';
      ticketContent = generateCreditorReviewTicketContent(client, documents, creditors, true);
      tags = ['processing-complete', 'manual-review-needed', 'creditors-found'];
      client.payment_ticket_type = 'manual_review';
    } else {
      ticketType = 'auto_approved';
      ticketContent = generateCreditorReviewTicketContent(client, documents, creditors, false);
      tags = ['processing-complete', 'auto-approved', 'ready-for-confirmation'];
      client.payment_ticket_type = 'auto_approved';
    }

    // Mark all documents processed timestamp
    client.all_documents_processed_at = new Date();
    
    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: 'processing_complete',
      changed_by: 'system',
      metadata: {
        documents_processed: documents.length,
        creditors_found: creditors.length,
        processing_duration_ms: Date.now() - new Date(client.payment_processed_at).getTime(),
        final_ticket_type: ticketType
      }
    });

    await client.save();

    // ADD PROCESSING COMPLETE COMMENT TO ORIGINAL TICKET
    let zendeskComment = null;
    let commentError = null;

    // Try to find the original ticket ID from client's zendesk_tickets
    const originalTicket = client.zendesk_tickets?.find(t => t.ticket_type === 'main_ticket' || t.status === 'active');
    const originalTicketId = originalTicket?.ticket_id || client.zendesk_ticket_id;

    if (zendeskService.isConfigured() && originalTicketId) {
      try {
        console.log(`💬 Adding processing complete comment to ticket ${originalTicketId}...`);
        
        // Generate processing complete comment
        const processingCompleteComment = `**🔄 PROCESSING COMPLETE - ANALYSIS READY**\n\n👤 **Client:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})\n⏰ **Completed:** ${new Date().toLocaleString('de-DE')}\n\n${generateInternalComment(client, ticketType, documents, creditors, state)}`;
        const ticketStatus = getTicketStatusForScenario(ticketType);
        const ticketTags = ['processing-complete', `scenario-${ticketType}`, ...tags];
        
        zendeskComment = await zendeskService.addInternalComment(originalTicketId, {
          content: processingCompleteComment,
          // status: ticketStatus, // REMOVED: Don't change the original ticket status
          tags: ticketTags
        });

        if (zendeskComment.success) {
          console.log(`✅ Processing complete comment added to ticket ${originalTicketId}`);
          
          // Update client ticket tracking
          if (originalTicket) {
            originalTicket.last_comment_at = new Date();
            originalTicket.processing_complete_scenario = ticketType;
          }
          
          await client.save();
          
          // AUTO-TRIGGER CREDITOR CONTACT for auto_approved scenarios (processing-complete)
          if (ticketType === 'auto_approved' && creditors.length > 0) {
            try {
              console.log(`🚀 Auto-triggering creditor contact for processing-complete auto-approved client ${client.aktenzeichen}...`);
              
              const creditorService = new CreditorContactService();
              const creditorContactResult = await creditorService.processClientCreditorConfirmation(client.aktenzeichen);
              
              console.log(`✅ Processing-complete auto-approved creditor contact started: Main ticket ID ${creditorContactResult.main_ticket_id}, ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);
              
              // Update client status
              client.current_status = 'creditor_contact_initiated';
              client.payment_ticket_type = 'creditor_contact_initiated';
              client.updated_at = new Date();
              
              client.status_history.push({
                id: uuidv4(),
                status: 'creditor_contact_initiated',
                changed_by: 'system',
                metadata: {
                  triggered_by: 'processing_complete_auto_approved',
                  main_ticket_id: creditorContactResult.main_ticket_id,
                  emails_sent: creditorContactResult.emails_sent,
                  total_creditors: creditors.length,
                  side_conversations_created: creditorContactResult.side_conversation_results?.length || 0
                }
              });
              
              await client.save();
              
            } catch (creditorError) {
              console.error(`❌ Failed to auto-trigger creditor contact for processing-complete ${client.aktenzeichen}:`, creditorError.message);
              
              client.current_status = 'creditor_contact_failed';
              client.status_history.push({
                id: uuidv4(),
                status: 'creditor_contact_failed',
                changed_by: 'system',
                metadata: {
                  error_message: creditorError.message,
                  requires_manual_action: true,
                  triggered_from: 'processing_complete_auto_approved'
                }
              });
              
              await client.save();
            }
          }
          
        } else {
          commentError = zendeskComment.error;
          console.error('❌ Failed to add processing complete comment:', zendeskComment.error);
        }
      } catch (error) {
        commentError = error.message;
        console.error('❌ Exception adding processing complete comment:', error);
      }
    } else {
      if (!zendeskService.isConfigured()) {
        console.log('⚠️ Zendesk service not configured - skipping comment');
        commentError = 'Zendesk API not configured';
      } else {
        console.log('⚠️ No original ticket ID found - cannot add comment');
        commentError = 'No original ticket ID available';
      }
    }

    console.log(`✅ Processing complete for ${client.aktenzeichen}. Ticket type: ${ticketType}`);

    res.json({
      success: true,
      message: 'Processing complete - Review ticket ready',
      scenario: ticketType,
      client_status: client.current_status,
      ticket_data: {
        subject: `UPDATE: ${generateTicketSubject(client, ticketType)}`,
        content: ticketContent,
        tags: tags,
        priority: ticketType === 'manual_review' ? 'normal' : 'low'
      },
      zendesk_comment: zendeskComment ? {
        added: zendeskComment.success,
        ticket_id: originalTicketId,
        scenario: ticketType,
        error: commentError
      } : {
        added: false,
        error: commentError
      },
      review_dashboard_url: (ticketType === 'manual_review') 
        ? `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/admin/review/${client.id}`
        : null,
      processing_duration_seconds: Math.round((Date.now() - new Date(client.payment_processed_at).getTime()) / 1000),
      documents_processed: documents.length,
      creditors_found: creditors.length
    });

  } catch (error) {
    console.error('❌ Error in processing-complete webhook:', error);
    res.status(500).json({
      error: 'Failed to process completion webhook',
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

// Helper function to generate ticket subject based on type
function generateTicketSubject(client, ticketType) {
  const name = `${client.firstName} ${client.lastName}`;
  const aktenzeichen = client.aktenzeichen;
  
  switch(ticketType) {
    case 'document_request':
      return `Dokumente benötigt: ${name} (${aktenzeichen})`;
    case 'processing_wait':
      return `AI-Verarbeitung läuft: ${name} (${aktenzeichen})`;
    case 'no_creditors_found':
      return `Keine Gläubiger gefunden: ${name} (${aktenzeichen})`;
    case 'manual_review':
      return `Gläubiger-Review: ${name} - Manuelle Prüfung (${aktenzeichen})`;
    case 'auto_approved':
      return `Gläubiger-Review: ${name} - Bereit zur Bestätigung (${aktenzeichen})`;
    default:
      return `Gläubiger-Review: ${name} (${aktenzeichen})`;
  }
}

// Helper function to generate document request ticket content
function generateDocumentRequestTicket(client) {
  return `📄 DOKUMENTE BENÖTIGT

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT am ${client.payment_processed_at ? new Date(client.payment_processed_at).toLocaleDateString('de-DE') : 'heute'}

⚠️ STATUS: Keine Dokumente hochgeladen

🔧 AGENT-AKTIONEN:
1. [BUTTON: Dokumenten-Upload-Email senden]
2. [BUTTON: Mandant anrufen]
3. [BUTTON: SMS senden]

📝 EMAIL-VORLAGE:
Sehr geehrte/r ${client.firstName} ${client.lastName},

vielen Dank für Ihre erste Ratenzahlung! 

Um mit Ihrem Insolvenzverfahren fortzufahren, benötigen wir noch Ihre Gläubigerdokumente.

Bitte laden Sie alle Mahnungen, Rechnungen und Schreiben Ihrer Gläubiger hier hoch:
🔗 ${process.env.FRONTEND_URL}/login?token=${client.portal_token}

📋 Benötigte Dokumente:
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge
• Inkasso-Schreiben
• Kreditverträge
• Sonstige Gläubigerschreiben

Mit freundlichen Grüßen
Ihr Insolvenz-Team

🔗 Portal-Zugang: ${process.env.FRONTEND_URL}/login?token=${client.portal_token}`;
}

// Helper function to generate processing wait ticket content
function generateProcessingWaitTicket(client, documents, completedDocs) {
  const processing = documents.filter(d => d.processing_status !== 'completed');
  const estimatedTime = processing.length * 30; // 30 seconds per document
  
  return `⏳ AI-VERARBEITUNG LÄUFT

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT

🔄 VERARBEITUNGSSTATUS:
• Dokumente hochgeladen: ${documents.length}
• Bereits verarbeitet: ${completedDocs.length}/${documents.length}
• Noch in Bearbeitung: ${processing.length}

⏱️ Geschätzte Wartezeit: ${Math.ceil(estimatedTime / 60)} Minuten

📋 DOKUMENTE IN BEARBEITUNG:
${processing.map(d => `• ${d.name || 'Unbekannt'} (${d.processing_status})`).join('\n') || 'Alle Dokumente verarbeitet'}

🔧 AGENT-AKTIONEN:
• ⏳ Warten Sie auf Verarbeitungsabschluss
• 🔄 Sie erhalten automatisch ein Update-Ticket wenn fertig
• 📞 Bei Problemen nach 10+ Minuten: Support kontaktieren

📝 HINWEIS: Dieses Ticket wird automatisch aktualisiert, sobald die AI-Verarbeitung abgeschlossen ist.

🔗 Portal-Zugang: ${process.env.FRONTEND_URL}/login?token=${client.portal_token}`;
}

// Helper function to generate no creditors ticket content
function generateNoCreditorsTicket(client, documents) {
  const creditorDocs = documents.filter(d => d.is_creditor_document === true);
  const nonCreditorDocs = documents.filter(d => d.is_creditor_document === false);
  
  return `⚠️ KEINE GLÄUBIGER GEFUNDEN

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT

📊 DOKUMENT-ANALYSE ERGEBNIS:
• Hochgeladen: ${documents.length} Dokumente
• Als Gläubigerdokument erkannt: ${creditorDocs.length}
• Als Nicht-Gläubigerdokument eingestuft: ${nonCreditorDocs.length}
• Extrahierte Gläubiger: 0

⚠️ PROBLEM: Keine Gläubigerdaten extrahiert

🔍 MÖGLICHE URSACHEN:
• Falsche Dokumenttypen hochgeladen
• Schlechte Bildqualität
• Unvollständige Scans
• AI-Klassifizierung fehlerhaft

🔧 AGENT-AKTIONEN:
1. [BUTTON: Dokumente manuell prüfen] → ${process.env.FRONTEND_URL}/admin/review/${client.id}
2. [BUTTON: Mandant kontaktieren - bessere Dokumente anfordern]
3. [BUTTON: Manuelle Gläubiger-Erfassung starten]

📋 HOCHGELADENE DOKUMENTE:
${documents.map(d => `• ${d.name || 'Unbekannt'} - ${d.is_creditor_document ? '✅ Gläubiger' : '❌ Kein Gläubiger'}`).join('\n')}

📝 NÄCHSTE SCHRITTE:
1. Manuelle Dokumentenprüfung durchführen
2. Bei Bedarf bessere Dokumente beim Mandant anfordern
3. Ggf. Gläubiger manuell erfassen

🔗 Portal-Zugang: ${process.env.FRONTEND_URL}/login?token=${client.portal_token}`;
}

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

// Helper function to generate internal comment for original ticket
function generateInternalComment(client, ticketType, documents, creditors, state) {
  const baseInfo = `**💰 PAYMENT CONFIRMED - AUTOMATED ANALYSIS**\n\n👤 **Client:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})\n📧 **Email:** ${client.email}\n⏰ **Processed:** ${new Date().toLocaleString('de-DE')}`;
  
  switch(ticketType) {
    case 'document_request':
      return `${baseInfo}\n\n⚠️ **STATUS: DOCUMENTS REQUIRED**\n\n📊 **Analysis:**\n• Documents uploaded: ${documents.length}\n• Processing status: No documents found\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[CLIENT PORTAL ACCESS]** ${process.env.FRONTEND_URL}/login?token=${client.portal_token}\n\n📧 **Email Template:**\n\"Sehr geehrte/r ${client.firstName} ${client.lastName},\n\nvielen Dank für Ihre erste Ratenzahlung!\n\nBitte laden Sie Ihre Gläubigerdokumente hier hoch:\n${process.env.FRONTEND_URL}/login?token=${client.portal_token}\n\nBenötigte Dokumente: Mahnungen, Rechnungen, Inkasso-Schreiben\"\n\n📋 **Automatic Process:**\n• After document upload, system re-analyzes automatically\n• This ticket will be updated with results\n• No further agent action needed until then
`;
    
    case 'auto_approved':
      const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
      const creditorsList = creditors.map(c => 
        `• ${c.sender_name || 'Unknown'} - €${c.claim_amount || 'N/A'} (${Math.round((c.confidence || 0) * 100)}% confidence)`
      ).join('\n');
      
      return `${baseInfo}\n\n✅ **STATUS: AI PROCESSED - FULLY AUTOMATED**\n\n📊 **Analysis Results:**\n• Documents processed: ${documents.length}\n• Creditors found: ${creditors.length}\n• Total debt: €${totalDebt.toFixed(2)}\n• All creditors ≥80% confidence\n\n🏛️ **VERIFIED CREDITORS:**\n${creditorsList}\n\n🚀 **AUTOMATED ACTIONS:**\n• ✅ Creditor contact process started automatically\n• ✅ Client portal access granted\n• ✅ Creditor list sent for confirmation\n\n📋 **NO AGENT ACTION REQUIRED** - Process fully automated`;
    
    case 'manual_review':
      const needsReview = creditors.filter(c => (c.confidence || 0) < 0.8);
      const confident = creditors.filter(c => (c.confidence || 0) >= 0.8);
      
      return `${baseInfo}\n\n⚠️ **STATUS: MANUAL REVIEW REQUIRED**\n\n📊 **Analysis Results:**\n• Documents processed: ${documents.length}\n• Creditors found: ${creditors.length}\n• Need manual review: ${needsReview.length}\n• Auto-verified: ${confident.length}\n\n🔍 **CREDITORS NEEDING REVIEW:**\n${needsReview.map(c => `• ${c.sender_name || 'Unknown'} - €${c.claim_amount || 'N/A'} (${Math.round((c.confidence || 0) * 100)}% confidence)`).join('\n')}\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[MANUAL REVIEW DASHBOARD]** ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/agent/review/${client.id}\n\n📋 **Process:**\n1. Click link above to open Review Dashboard\n2. Manually verify and correct low-confidence extractions\n3. System automatically continues after completion\n4. Creditor contact starts automatically\n5. This ticket gets updated with final results\n\n✅ **Auto-verified creditors will be processed automatically**
`;
    
    case 'no_creditors_found':
      return `${baseInfo}\n\n⚠️ **STATUS: NO CREDITORS FOUND**\n\n📊 **Analysis Results:**\n• Documents processed: ${documents.length}\n• Creditor documents detected: ${documents.filter(d => d.is_creditor_document).length}\n• Creditors extracted: 0\n\n🔍 **POSSIBLE ISSUES:**\n• Documents may not contain creditor information\n• Poor document quality / non-standard format\n• AI classification error\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[DOCUMENT REVIEW]** ${process.env.FRONTEND_URL}/admin/clients/${client.id}\n\n📋 **Documents Uploaded:**\n${documents.map(d => `• ${d.name} - ${d.is_creditor_document ? '✅ Creditor doc' : '❌ Other doc'}`).join('\n')}\n\n📧 **Options:**\n1. Review documents manually via link above\n2. Request better quality documents from client\n3. Manual creditor entry if needed
`;
    
    case 'processing_wait':
      const processing = documents.filter(d => d.processing_status !== 'completed');
      return `${baseInfo}\n\n⏳ **STATUS: AI PROCESSING IN PROGRESS**\n\n📊 **Processing Status:**\n• Documents uploaded: ${documents.length}\n• Processing complete: ${documents.length - processing.length}/${documents.length}\n• Estimated time remaining: ${Math.ceil(processing.length * 0.5)} minutes\n\n🔄 **DOCUMENTS IN QUEUE:**\n${processing.map(d => `• ${d.name} (${d.processing_status})`).join('\n')}\n\n⏰ **NO AGENT ACTION REQUIRED**\n• System will automatically update this ticket when processing completes\n• Appropriate workflow will continue based on analysis results\n\n📋 **Next Steps:**\n• Wait for AI processing to complete\n• Ticket will be updated automatically with results`;
    
    default:
      return `${baseInfo}\n\n❓ **STATUS: UNKNOWN SCENARIO**\n\nPlease check system logs for details.`;
  }
}

// Helper function to get ticket status based on scenario
function getTicketStatusForScenario(ticketType) {
  switch(ticketType) {
    case 'document_request':
      return 'pending'; // Waiting for customer
    case 'auto_approved':
      return 'open'; // Automated process active
    case 'manual_review':
      return 'pending'; // Waiting for agent review
    case 'no_creditors_found':
      return 'pending'; // Needs agent investigation
    case 'processing_wait':
      return 'open'; // System processing
    default:
      return 'open';
  }
}

module.exports = router;