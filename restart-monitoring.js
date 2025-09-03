const axios = require('axios');

async function restartMonitoring() {
    try {
        console.log('🔄 Attempting to restart monitoring...');
        
        const response = await axios.post('https://mandanten-portal-backend.onrender.com/api/zendesk-webhooks/monitor/restart', {}, {
            timeout: 10000
        });
        
        console.log('✅ Restart response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        if (error.response) {
            console.error('❌ Error response:', error.response.status, error.response.data);
        } else {
            console.error('❌ Request error:', error.message);
        }
    }
}

restartMonitoring();