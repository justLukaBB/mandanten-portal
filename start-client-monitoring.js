const axios = require('axios');

async function startClientMonitoring() {
    const clientReference = '47698264928';
    
    try {
        console.log(`🔄 Starting monitoring for client ${clientReference}...`);
        
        const response = await axios.post(`https://mandanten-portal-backend.onrender.com/api/zendesk-webhooks/monitor/start-client/${clientReference}`, {
            interval_minutes: 1
        }, {
            timeout: 10000
        });
        
        console.log('✅ Start monitoring response:', JSON.stringify(response.data, null, 2));
        
        // Check status afterwards
        console.log('\n🔍 Checking monitoring status...');
        const statusResponse = await axios.get('https://mandanten-portal-backend.onrender.com/api/zendesk-webhooks/monitor/status');
        console.log('Status:', JSON.stringify(statusResponse.data, null, 2));
        
    } catch (error) {
        if (error.response) {
            console.error('❌ Error response:', error.response.status, error.response.data);
        } else {
            console.error('❌ Request error:', error.message);
        }
    }
}

startClientMonitoring();