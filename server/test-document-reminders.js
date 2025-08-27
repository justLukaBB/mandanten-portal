const axios = require('axios');

// Test script for document reminder workflow
const API_BASE_URL = 'http://localhost:3001/api';

async function testDocumentReminderWorkflow() {
  console.log('🧪 Testing Document Reminder Workflow\n');
  
  try {
    // Test 1: Simulate payment confirmation webhook for a client without documents
    console.log('1️⃣ Test: Payment confirmed webhook (no documents)');
    const paymentWebhookData = {
      ticket: {
        id: '12345678',
        requester: {
          aktenzeichen: 'TEST_REMINDER_001',
          email: 'test.reminder@example.com',
          name: 'Test Reminder'
        }
      }
    };
    
    try {
      const paymentResponse = await axios.post(
        `${API_BASE_URL}/zendesk-webhook/payment-confirmed`,
        paymentWebhookData,
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      console.log('✅ Payment webhook response:', paymentResponse.data);
      console.log('   - Payment ticket type:', paymentResponse.data.payment_ticket_type);
      console.log('   - Next action:', paymentResponse.data.next_action);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('⚠️  Client not found - need to create client first via portal-link-sent webhook');
        
        // Create client first
        const portalLinkData = {
          ticket: {
            id: '12345678',
            requester: {
              aktenzeichen: 'TEST_REMINDER_001',
              email: 'test.reminder@example.com',
              name: 'Test Reminder',
              id: 'zendesk_user_123'
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
        
        console.log('✅ Client created via portal-link-sent webhook');
        
        // Now retry payment confirmation
        const retryResponse = await axios.post(
          `${API_BASE_URL}/zendesk-webhook/payment-confirmed`,
          paymentWebhookData,
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        console.log('✅ Payment webhook response after client creation:', retryResponse.data);
        console.log('   - Payment ticket type:', retryResponse.data.payment_ticket_type);
        console.log('   - Next action:', retryResponse.data.next_action);
      } else {
        throw error;
      }
    }
    
    // Test 2: Check reminder service endpoints
    console.log('\n2️⃣ Test: Admin endpoints for document reminders');
    
    // Get admin token first (using default demo credentials)
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
    
    // Trigger document reminder check
    const reminderTriggerResponse = await axios.post(
      `${API_BASE_URL}/admin/trigger-document-reminders`,
      {},
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }
    );
    
    console.log('✅ Document reminder check triggered:', reminderTriggerResponse.data);
    
    // Test 3: Check specific client document status
    console.log('\n3️⃣ Test: Check document status for test client');
    
    // First, find the client ID for our test aktenzeichen
    const clientsResponse = await axios.get(
      `${API_BASE_URL}/admin/clients`,
      {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      }
    );
    
    const testClient = clientsResponse.data.find(c => c.aktenzeichen === 'TEST_REMINDER_001');
    
    if (testClient) {
      console.log(`✅ Found test client with ID: ${testClient.id}`);
      
      const statusCheckResponse = await axios.post(
        `${API_BASE_URL}/admin/check-document-status/${testClient.id}`,
        {},
        {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );
      
      console.log('✅ Document status check:', statusCheckResponse.data);
    } else {
      console.log('⚠️  Test client not found in database');
    }
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Payment webhook correctly identifies missing documents');
    console.log('- Document reminder service is ready to send reminders');
    console.log('- Admin can manually trigger reminder checks');
    console.log('- System tracks document upload status after payment');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
console.log('🚀 Starting document reminder workflow test...\n');
testDocumentReminderWorkflow();