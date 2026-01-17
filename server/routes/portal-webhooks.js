const express = require('express');
const router = express.Router();
const { rateLimits } = require('../middleware/security');
const createPortalWebhookController = require('../controllers/portalWebhookController');

/**
 * Portal Webhook Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 */
module.exports = ({ Client, safeClientUpdate, triggerProcessingCompleteWebhook }) => {
  const controller = createPortalWebhookController({
    Client,
    safeClientUpdate,
    triggerProcessingCompleteWebhook
  });

  // Portal Webhook: Documents Uploaded
  // Triggered when client uploads documents in portal
  router.post('/documents-uploaded', rateLimits.general, controller.handleDocumentsUploaded);

  // Portal Webhook: Creditors Confirmed
  // Triggered when client confirms creditor list in portal
  router.post('/creditors-confirmed', rateLimits.general, controller.handleCreditorsConfirmed);

  // Portal Webhook: Document Processing Complete
  // Triggered when AI processing of documents is complete
  router.post('/document-processing-complete', rateLimits.general, controller.handleDocumentProcessingComplete);

  return router;
};