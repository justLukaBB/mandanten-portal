const axios = require('axios');

// Helper function to trigger processing-complete webhook
async function triggerProcessingCompleteWebhook(clientId, documentId = null) {
    try {
        const baseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
        const webhookUrl = `${baseUrl}/api/zendesk-webhooks/processing-complete`;

        console.log(`🔗 Triggering processing-complete webhook for client ${clientId}`);

        const response = await axios.post(webhookUrl, {
            client_id: clientId,
            document_id: documentId,
            timestamp: new Date().toISOString(),
            triggered_by: 'document_processing_completion'
        }, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MandarenPortal-Server/1.0'
            }
        });

        console.log(`✅ Processing-complete webhook triggered successfully for client ${clientId}`);
        return response.data;

    } catch (error) {
        console.error(`❌ Failed to trigger processing-complete webhook for client ${clientId}:`, error.message);
        // Don't throw - webhook failure shouldn't break document processing
        return null;
    }
}

module.exports = {
    triggerProcessingCompleteWebhook
};
