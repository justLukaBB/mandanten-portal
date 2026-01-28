const express = require('express');
const router = express.Router();
const webhookVerifier = require('../utils/webhookVerifier');
const creditorDeduplication = require('../utils/creditorDeduplication');
const Client = require('../models/Client');
const { findCreditorByName } = require('../utils/creditorLookup');
const aiDedupScheduler = require('../services/aiDedupScheduler');

// Lazy load server functions to avoid circular dependency
let serverFunctions = null;
function getServerFunctions() {
  if (!serverFunctions) {
    serverFunctions = require('../server');
  }
  return serverFunctions;
}

const MANUAL_REVIEW_CONFIDENCE_THRESHOLD =
  parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8;
const createWebhookController = require('../controllers/webhookController');

/**
 * Webhook Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 * @param {Object} dependencies.webhookController - Optional pre-created controller (for worker integration)
 */
module.exports = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook, getIO, webhookController }) => {
  // Use provided controller or create a new one
  const controller = webhookController || createWebhookController({
    Client,
    safeClientUpdate,
    getClient,
    triggerProcessingCompleteWebhook,
    getIO,
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
