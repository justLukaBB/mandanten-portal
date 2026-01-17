const express = require('express');
const router = express.Router();
const webhookVerifier = require('../utils/webhookVerifier');
const createWebhookController = require('../controllers/webhookController');

/**
 * Webhook Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 */
module.exports = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook }) => {
  const controller = createWebhookController({
    Client,
    safeClientUpdate,
    getClient,
    triggerProcessingCompleteWebhook
  });

  /**
   * Webhook receiver for FastAPI AI processing results
   * POST /webhooks/ai-processing
   */
  router.post(
    '/ai-processing',
    express.raw({ type: 'application/json' }),
    webhookVerifier.optionalMiddleware, // Temporarily allow unsigned webhooks for testing
    controller.handleAiProcessing
  );

  /** Health check */
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      endpoints: ['POST /webhooks/ai-processing'],
    });
  });

  return router;
};
