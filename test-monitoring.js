const axios = require('axios');

// Test the monitoring system by simulating client confirmation
async function testMonitoring() {
    const baseUrl = 'https://mandanten-portal-backend.onrender.com';
    
    try {
        console.log('🧪 Testing creditor monitoring system...');
        
        // First check current status
        console.log('\n1. Checking current monitoring status...');
        const statusResponse = await axios.get(`${baseUrl}/api/zendesk-webhooks/monitor/status`);
        console.log('Current status:', JSON.stringify(statusResponse.data, null, 2));
        
        // Simulate client confirmation webhook that should trigger monitoring
        console.log('\n2. Simulating client confirmation to trigger creditor contact...');
        
        const testPayload = {
            ticket: {
                id: 7777,  // Test ticket ID
                requester: {
                    id: 1234567,
                    name: 'Test Mustermann',
                    email: 'test@example.com',
                    aktenzeichen: 'TEST-MONITORING-001'
                }
            },
            current_user: {
                id: 9876543,
                name: 'Test Agent'
            }
        };
        
        try {
            const confirmResponse = await axios.post(`${baseUrl}/api/zendesk-webhooks/client-creditor-confirmation`, testPayload, {
                timeout: 30000  // 30 second timeout
            });
            console.log('✅ Client confirmation webhook response:', confirmResponse.data.message);
        } catch (error) {
            if (error.response) {
                console.log('⚠️ Expected error (no client found):', error.response.data.message);
            } else {
                console.error('❌ Webhook error:', error.message);
            }
        }
        
        // Check status again
        console.log('\n3. Checking monitoring status after test...');
        const finalStatus = await axios.get(`${baseUrl}/api/zendesk-webhooks/monitor/status`);
        console.log('Final status:', JSON.stringify(finalStatus.data, null, 2));
        
        console.log('\n🔍 Monitoring System Analysis:');
        console.log('- Global monitoring active:', finalStatus.data.status.global_monitoring_active);
        console.log('- Active sessions:', finalStatus.data.status.active_sessions_count);
        console.log('- Zendesk configured:', finalStatus.data.status.zendesk_configured);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testMonitoring();