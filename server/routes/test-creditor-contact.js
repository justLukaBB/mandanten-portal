const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const { validateAktenzeichenParam } = require('../utils/sanitizeAktenzeichen');
const CreditorContactService = require('../services/creditorContactService');
const SideConversationMonitor = require('../services/sideConversationMonitor');

const router = express.Router();

// Global instances
const creditorContactService = new CreditorContactService();
const sideConversationMonitor = new SideConversationMonitor();

// Create a test client ready for creditor contact
// POST /api/test/creditor-contact/create-ready-client
router.post('/create-ready-client', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    console.log('🧪 Creating test client ready for creditor contact...');

    const testClientId = uuidv4();
    const testAktenzeichen = `TEST_CC_${Date.now()}`;

    // Create test client with confirmed creditors
    const testClient = new Client({
      id: testClientId,
      aktenzeichen: testAktenzeichen,
      firstName: 'Test',
      lastName: 'Creditor-Contact',
      email: 'test.creditor@example.com',
      phone: '+49 123 456789',
      address: 'Teststraße 123, 12345 Berlin',
      
      // Portal access
      portal_link_sent: true,
      portal_link_sent_at: new Date(),
      portal_token: uuidv4(),
      
      // Payment and approval status - READY FOR CREDITOR CONTACT
      first_payment_received: true,
      payment_processed_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      current_status: 'awaiting_client_confirmation',
      
      // CRITICAL: Admin approved (required for creditor contact)
      admin_approved: true,
      admin_approved_at: new Date(),
      admin_approved_by: 'test-admin',
      
      // NOT YET client confirmed (we'll do this manually)
      client_confirmed_creditors: false,
      client_confirmed_at: null,
      
      // Documents (for completeness)
      documents: [
        {
          id: uuidv4(),
          name: 'Creditor_Invoice_1.pdf',
          filename: 'creditor_invoice_1.pdf',
          type: 'application/pdf',
          size: 245760,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          manually_reviewed: true,
          reviewed_at: new Date(),
          reviewed_by: 'test-admin'
        },
        {
          id: uuidv4(),
          name: 'Creditor_Bill_2.pdf',
          filename: 'creditor_bill_2.pdf',
          type: 'application/pdf',
          size: 189440,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          manually_reviewed: true,
          reviewed_at: new Date(),
          reviewed_by: 'test-admin'
        }
      ],
      
      // FINAL CREDITOR LIST - READY FOR CONTACT
      final_creditor_list: [
        {
          id: uuidv4(),
          sender_name: 'Test Bank AG',
          sender_email: 'inkasso@test-bank.de',
          sender_address: 'Bankstraße 1, 12345 Berlin',
          reference_number: 'TB-2024-001',
          claim_amount: 1250.50,
          confidence: 1.0,
          status: 'confirmed', // CONFIRMED AND READY
          manually_reviewed: true,
          reviewed_by: 'test-admin',
          reviewed_at: new Date(),
          confirmed_at: new Date(),
          created_at: new Date()
        },
        {
          id: uuidv4(),
          sender_name: 'Credit Solutions GmbH',
          sender_email: 'forderungen@credit-solutions.de',
          sender_address: 'Inkassostraße 10, 54321 Hamburg',
          reference_number: 'CS-2024-987',
          claim_amount: 850.75,
          confidence: 1.0,
          status: 'confirmed', // CONFIRMED AND READY
          manually_reviewed: true,
          reviewed_by: 'test-admin',
          reviewed_at: new Date(),
          confirmed_at: new Date(),
          created_at: new Date()
        },
        {
          id: uuidv4(),
          sender_name: 'Rechtsanwaltskanzlei Schmidt & Partner',
          sender_email: 'info@schmidt-partner-law.de',
          sender_address: 'Anwaltsstraße 5, 98765 München',
          reference_number: 'SP-LAW-2024-555',
          claim_amount: 2100.00,
          confidence: 1.0,
          status: 'confirmed', // CONFIRMED AND READY
          manually_reviewed: true,
          reviewed_by: 'test-admin',
          reviewed_at: new Date(),
          confirmed_at: new Date(),
          created_at: new Date(),
          is_representative: true,
          actual_creditor: 'Hauptgläubiger XYZ GmbH'
        }
      ],
      
      // Status history
      status_history: [
        {
          id: uuidv4(),
          status: 'created',
          changed_by: 'system',
          metadata: { action: 'test_client_created' },
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000) // 2 days ago
        },
        {
          id: uuidv4(),
          status: 'payment_confirmed',
          changed_by: 'agent',
          metadata: { action: 'payment_received' },
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
        },
        {
          id: uuidv4(),
          status: 'awaiting_client_confirmation',
          changed_by: 'system',
          metadata: { 
            action: 'admin_review_completed',
            total_creditors: 3,
            admin_approved: true
          },
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        }
      ],
      
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
      updated_at: new Date()
    });

    await testClient.save();

    const totalDebt = testClient.final_creditor_list.reduce((sum, c) => sum + c.claim_amount, 0);

    console.log(`✅ Test client created successfully!`);
    console.log(`📊 Client: ${testClient.aktenzeichen} (${testClient.firstName} ${testClient.lastName})`);
    console.log(`📄 Creditors: ${testClient.final_creditor_list.length} confirmed, Total debt: €${totalDebt}`);
    console.log(`🎯 Status: ${testClient.current_status} (admin_approved: ${testClient.admin_approved})`);

    res.json({
      success: true,
      message: 'Test client ready for creditor contact created successfully',
      test_client: {
        id: testClient.id,
        aktenzeichen: testClient.aktenzeichen,
        name: `${testClient.firstName} ${testClient.lastName}`,
        email: testClient.email,
        status: testClient.current_status,
        admin_approved: testClient.admin_approved,
        client_confirmed: testClient.client_confirmed_creditors,
        creditors: {
          total: testClient.final_creditor_list.length,
          confirmed: testClient.final_creditor_list.filter(c => c.status === 'confirmed').length,
          total_debt: totalDebt
        },
        ready_for_contact: testClient.admin_approved && !testClient.client_confirmed_creditors,
        next_step: 'Use /manual-client-confirmation to simulate client confirmation and trigger creditor contact'
      },
      test_endpoints: {
        manual_client_confirmation: `/api/test/creditor-contact/manual-client-confirmation/${testClient.aktenzeichen}`,
        direct_creditor_trigger: `/api/test/creditor-contact/trigger-creditor-contact/${testClient.aktenzeichen}`,
        monitor_status: `/api/test/creditor-contact/monitor-status/${testClient.aktenzeichen}`,
        cleanup: `/api/test/creditor-contact/cleanup`
      }
    });

  } catch (error) {
    console.error('❌ Error creating test client:', error);
    res.status(500).json({
      error: 'Failed to create test client',
      details: error.message
    });
  }
});

// Manually trigger client confirmation (simulates portal confirmation)
// POST /api/test/creditor-contact/manual-client-confirmation/:aktenzeichen
router.post('/manual-client-confirmation/:aktenzeichen', authenticateAdmin, rateLimits.general, validateAktenzeichenParam, async (req, res) => {
  try {
    const { aktenzeichen } = req.params;
    console.log(`🎯 Manually triggering client confirmation for ${aktenzeichen}...`);

    // Simulate the webhook call that would come from the portal
    const axios = require('axios');
    const baseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
    const webhookUrl = `${baseUrl}/api/zendesk-webhooks/client-creditor-confirmed`;
    
    const webhookPayload = {
      aktenzeichen: aktenzeichen,
      creditors_confirmed: true,
      confirmed_at: new Date().toISOString()
    };

    console.log(`📞 Calling webhook: ${webhookUrl}`);
    console.log(`📤 Payload:`, webhookPayload);

    const response = await axios.post(webhookUrl, webhookPayload, {
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Manual-Client-Confirmation'
      }
    });

    console.log(`✅ Webhook response:`, response.data);

    res.json({
      success: true,
      message: `Manual client confirmation triggered for ${aktenzeichen}`,
      webhook_response: response.data,
      creditor_contact_initiated: response.data.creditor_contact_result?.success || false,
      monitoring_info: {
        check_status: `/api/test/creditor-contact/monitor-status/${aktenzeichen}`,
        check_sessions: `/api/test/creditor-contact/active-sessions`
      }
    });

  } catch (error) {
    console.error('❌ Error triggering manual client confirmation:', error);
    res.status(500).json({
      error: 'Failed to trigger manual client confirmation',
      details: error.message,
      response_data: error.response?.data
    });
  }
});

// Direct creditor contact trigger (bypasses client confirmation)
// POST /api/test/creditor-contact/trigger-creditor-contact/:aktenzeichen
router.post('/trigger-creditor-contact/:aktenzeichen', authenticateAdmin, rateLimits.general, validateAktenzeichenParam, async (req, res) => {
  try {
    const { aktenzeichen } = req.params;
    console.log(`🚀 Directly triggering creditor contact for ${aktenzeichen}...`);

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        aktenzeichen: aktenzeichen
      });
    }

    // Prepare client data
    const clientData = {
      name: `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone || '',
      address: client.address || ''
    };

    console.log(`📞 Calling creditorContactService.processClientCreditorConfirmation...`);
    const result = await creditorContactService.processClientCreditorConfirmation(aktenzeichen, clientData);
    console.log(`✅ Creditor contact process result:`, result);

    // Update client status if successful
    if (result.success) {
      client.current_status = 'creditor_contact_initiated';
      client.client_confirmed_creditors = true;
      client.client_confirmed_at = new Date();
      await client.save();
      
      // Start monitoring for this client
      console.log(`🔄 Starting monitoring for ${aktenzeichen}...`);
      const monitoringResult = sideConversationMonitor.startMonitoringForClient(aktenzeichen, 1);
      console.log(`📡 Monitoring result:`, monitoringResult);
    }

    res.json({
      success: result.success,
      message: `Direct creditor contact trigger completed for ${aktenzeichen}`,
      creditor_contact_result: result,
      monitoring_started: result.success,
      active_sessions: result.success ? 1 : 0,
      check_status: `/api/test/creditor-contact/monitor-status/${aktenzeichen}`
    });

  } catch (error) {
    console.error('❌ Error triggering direct creditor contact:', error);
    res.status(500).json({
      error: 'Failed to trigger direct creditor contact',
      details: error.message
    });
  }
});

// Check monitoring status for a client
// GET /api/test/creditor-contact/monitor-status/:aktenzeichen
router.get('/monitor-status/:aktenzeichen', authenticateAdmin, rateLimits.general, validateAktenzeichenParam, async (req, res) => {
  try {
    const { aktenzeichen } = req.params;
    console.log(`📊 Checking monitoring status for ${aktenzeichen}...`);

    // Get client creditor status from service
    const clientStatus = await creditorContactService.getClientCreditorStatus(aktenzeichen);
    
    // Get monitoring session info
    const monitoringSession = sideConversationMonitor.activeMonitoringSessions.get(aktenzeichen);
    
    // Get active side conversations
    const sideConversations = sideConversationMonitor.getClientSideConversations(aktenzeichen);

    const response = {
      success: true,
      client_reference: aktenzeichen,
      creditor_contact_status: clientStatus,
      monitoring_session: monitoringSession ? {
        active: monitoringSession.isActive,
        started_at: monitoringSession.startedAt,
        last_check: monitoringSession.lastCheck,
        responses_found: monitoringSession.responsesFound,
        side_conversations_count: monitoringSession.sideConversations?.length || 0,
        interval_minutes: monitoringSession.intervalMinutes
      } : null,
      side_conversations: sideConversations,
      all_active_sessions: Array.from(sideConversationMonitor.activeMonitoringSessions.keys()),
      global_monitor_running: !!sideConversationMonitor.globalMonitorInterval
    };

    console.log(`📈 Status summary for ${aktenzeichen}:`);
    console.log(`  - Creditor contacts: ${clientStatus.creditor_contacts?.length || 0}`);
    console.log(`  - Side conversations: ${sideConversations.length}`);
    console.log(`  - Monitoring active: ${!!monitoringSession?.isActive}`);
    console.log(`  - Global sessions: ${Array.from(sideConversationMonitor.activeMonitoringSessions.keys()).length}`);

    res.json(response);

  } catch (error) {
    console.error('❌ Error checking monitoring status:', error);
    res.status(500).json({
      error: 'Failed to check monitoring status',
      details: error.message
    });
  }
});

// Get all active monitoring sessions
// GET /api/test/creditor-contact/active-sessions
router.get('/active-sessions', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    console.log('📡 Getting all active monitoring sessions...');

    const activeSessions = Array.from(sideConversationMonitor.activeMonitoringSessions.entries()).map(([clientRef, session]) => ({
      client_reference: clientRef,
      started_at: session.startedAt,
      last_check: session.lastCheck,
      interval_minutes: session.intervalMinutes,
      responses_found: session.responsesFound,
      side_conversations_count: session.sideConversations?.length || 0,
      is_active: session.isActive
    }));

    // Get global creditor contacts summary
    const allContacts = Array.from(creditorContactService.creditorContacts.values());
    const contactsByClient = {};
    
    allContacts.forEach(contact => {
      if (!contactsByClient[contact.client_reference]) {
        contactsByClient[contact.client_reference] = [];
      }
      contactsByClient[contact.client_reference].push({
        creditor_name: contact.creditor_name,
        contact_status: contact.contact_status,
        side_conversation_id: contact.side_conversation_id,
        main_ticket_id: contact.main_zendesk_ticket_id
      });
    });

    res.json({
      success: true,
      summary: {
        active_monitoring_sessions: activeSessions.length,
        global_monitor_running: !!sideConversationMonitor.globalMonitorInterval,
        total_creditor_contacts: allContacts.length,
        clients_with_contacts: Object.keys(contactsByClient).length
      },
      active_sessions: activeSessions,
      creditor_contacts_by_client: contactsByClient,
      processed_messages_count: sideConversationMonitor.processedMessages.size
    });

  } catch (error) {
    console.error('❌ Error getting active sessions:', error);
    res.status(500).json({
      error: 'Failed to get active sessions',
      details: error.message
    });
  }
});

// List test clients ready for creditor contact testing
// GET /api/test/creditor-contact/test-clients
router.get('/test-clients', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    const testClients = await Client.find({
      aktenzeichen: { $regex: /^TEST_CC_/ }
    }).select('aktenzeichen firstName lastName final_creditor_list current_status admin_approved client_confirmed_creditors created_at').sort({ created_at: -1 }).limit(10);

    const clients = testClients.map(client => {
      const confirmedCreditors = (client.final_creditor_list || []).filter(c => c.status === 'confirmed');
      const totalDebt = confirmedCreditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
      
      return {
        aktenzeichen: client.aktenzeichen,
        name: `${client.firstName} ${client.lastName}`,
        status: client.current_status,
        admin_approved: client.admin_approved,
        client_confirmed: client.client_confirmed_creditors,
        creditors: {
          total: client.final_creditor_list?.length || 0,
          confirmed: confirmedCreditors.length,
          total_debt: totalDebt
        },
        ready_for_contact: client.admin_approved && !client.client_confirmed_creditors,
        created_at: client.created_at,
        test_endpoints: {
          manual_confirmation: `/api/test/creditor-contact/manual-client-confirmation/${client.aktenzeichen}`,
          direct_trigger: `/api/test/creditor-contact/trigger-creditor-contact/${client.aktenzeichen}`,
          monitor_status: `/api/test/creditor-contact/monitor-status/${client.aktenzeichen}`
        }
      };
    });

    res.json({
      success: true,
      test_clients: clients,
      total: clients.length,
      ready_for_testing: clients.filter(c => c.ready_for_contact).length
    });

  } catch (error) {
    console.error('❌ Error getting test clients:', error);
    res.status(500).json({
      error: 'Failed to get test clients',
      details: error.message
    });
  }
});

// Clean up test clients and reset monitoring
// DELETE /api/test/creditor-contact/cleanup
router.delete('/cleanup', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    console.log('🧹 Cleaning up test creditor contact data...');

    // Delete test clients
    const clientsResult = await Client.deleteMany({
      aktenzeichen: { $regex: /^TEST_CC_/ }
    });

    // Clear monitoring sessions
    const monitoringSessions = Array.from(sideConversationMonitor.activeMonitoringSessions.keys());
    sideConversationMonitor.activeMonitoringSessions.clear();
    
    // Clear global monitor
    if (sideConversationMonitor.globalMonitorInterval) {
      clearInterval(sideConversationMonitor.globalMonitorInterval);
      sideConversationMonitor.globalMonitorInterval = null;
    }
    
    // Clear creditor contacts
    const contactsCount = creditorContactService.creditorContacts.size;
    creditorContactService.creditorContacts.clear();
    creditorContactService.zendeskSync.clear();
    
    // Clear processed messages
    sideConversationMonitor.processedMessages.clear();

    console.log(`✅ Cleanup completed:`);
    console.log(`  - Deleted ${clientsResult.deletedCount} test clients`);
    console.log(`  - Cleared ${monitoringSessions.length} monitoring sessions`);
    console.log(`  - Cleared ${contactsCount} creditor contacts`);

    res.json({
      success: true,
      message: 'Test data cleanup completed',
      deleted: {
        test_clients: clientsResult.deletedCount,
        monitoring_sessions: monitoringSessions.length,
        creditor_contacts: contactsCount
      },
      cleared_sessions: monitoringSessions
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({
      error: 'Failed to cleanup test data',
      details: error.message
    });
  }
});

module.exports = router;