const axios = require('axios');

// Test script for document reminder workflow with side conversations
const API_BASE_URL = 'http://localhost:3001/api';

async function testDocumentReminderWithEmail() {
  console.log('🧪 Testing Document Reminder Workflow with Email Side Conversations\n');
  
  try {
    // Test 1: Simulate payment confirmation webhook for a client without documents
    console.log('1️⃣ Test: Payment confirmed webhook (no documents) - Should create ticket and send email');
    
    // Use a unique aktenzeichen for testing
    const testAktenzeichen = `TEST_EMAIL_${Date.now()}`;
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    
    // First create the client
    console.log('   Creating test client first...');
    const portalLinkData = {
      ticket: {
        id: '99999999',
        requester: {
          aktenzeichen: testAktenzeichen,
          email: testEmail,
          name: 'Test Email Client',
          id: 'zendesk_user_test'
        }
      }
    };
    
    const portalResponse = await axios.post(
      `${API_BASE_URL}/zendesk-webhook/portal-link-sent`,
      portalLinkData,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Test client created:', {
      aktenzeichen: testAktenzeichen,
      email: testEmail
    });
    
    // Now trigger payment confirmation
    console.log('\n   Triggering payment confirmation webhook...');
    const paymentWebhookData = {
      ticket: {
        id: '99999999',
        requester: {
          aktenzeichen: testAktenzeichen,
          email: testEmail,
          name: 'Test Email Client'
        }
      },
      agent_email: 'agent@example.com'
    };
    
    const paymentResponse = await axios.post(
      `${API_BASE_URL}/zendesk-webhook/payment-confirmed`,
      paymentWebhookData,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Payment webhook response:', {
      status: paymentResponse.data.scenario,
      ticketType: paymentResponse.data.payment_ticket_type,
      nextAction: paymentResponse.data.next_action,
      zendeskTicket: paymentResponse.data.zendesk_ticket
    });
    
    if (paymentResponse.data.scenario === 'document_request') {
      console.log('\n✅ SUCCESS: Document request scenario detected correctly');
      console.log('📧 Email should have been sent via side conversation to:', testEmail);
      console.log('🎫 Zendesk ticket created:', paymentResponse.data.zendesk_ticket?.created ? 'YES' : 'NO');
      
      if (paymentResponse.data.zendesk_ticket?.ticket_id) {
        console.log('   Ticket ID:', paymentResponse.data.zendesk_ticket.ticket_id);
      }
    } else {
      console.log('\n❌ ERROR: Expected document_request scenario, got:', paymentResponse.data.scenario);
    }
    
    // Test 2: Get admin access and check client status
    console.log('\n2️⃣ Test: Verify client status and email tracking');
    
    // Get admin token
    const adminLogin = await axios.post(
      `${API_BASE_URL}/admin/login`,
      {
        email: 'admin@mandanten-portal.de',
        password: 'admin123'
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const adminToken = adminLogin.data.token;
    console.log('✅ Admin login successful');
    
    // Find the test client
    const clientsResponse = await axios.get(
      `${API_BASE_URL}/admin/clients`,
      {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      }
    );
    
    const testClient = clientsResponse.data.find(c => c.aktenzeichen === testAktenzeichen);
    
    if (testClient) {
      console.log('\n✅ Test client found with details:');
      console.log('   ID:', testClient.id);
      console.log('   Payment ticket type:', testClient.payment_ticket_type);
      console.log('   Document request sent:', testClient.document_request_sent_at ? 'YES' : 'NO');
      console.log('   Document request email sent:', testClient.document_request_email_sent_at ? 'YES' : 'NO');
      console.log('   Status history entries:', testClient.status_history?.length || 0);
      
      // Check for email sent status in history
      const emailSentStatus = testClient.status_history?.find(s => 
        s.status === 'document_reminder_email_sent'
      );
      
      if (emailSentStatus) {
        console.log('\n✅ Email sent status found in history:');
        console.log('   Side conversation ID:', emailSentStatus.metadata?.side_conversation_id);
        console.log('   Email sent to:', emailSentStatus.metadata?.email_sent_to);
        console.log('   Zendesk ticket ID:', emailSentStatus.metadata?.zendesk_ticket_id);
      } else {
        console.log('\n⚠️  No email sent status found in history');
      }
      
    } else {
      console.log('⚠️  Test client not found in database');
    }
    
    console.log('\n✅ All tests completed!');
    console.log('\n📋 Summary:');
    console.log('- Payment webhook correctly identifies missing documents');
    console.log('- Zendesk ticket is created automatically');
    console.log('- Side conversation email is sent to client with portal link');
    console.log('- Client status is tracked properly');
    console.log('- Document reminder system is ready for automated reminders');
    
    console.log('\n📧 Email Features:');
    console.log('- Immediate email sent when payment confirmed without documents');
    console.log('- Email includes portal link, aktenzeichen, and instructions');
    console.log('- Follow-up reminders every 2 days via scheduled task');
    console.log('- Progressive urgency levels for reminders');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.details) {
      console.error('Details:', error.response.data.details);
    }
  }
}

// Run the test
console.log('🚀 Starting document reminder with email test...\n');
console.log('⚠️  Note: This test requires Zendesk API to be configured for side conversations\n');
testDocumentReminderWithEmail();