const express = require('express');
const { authenticateAgent } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const createAgentReviewController = require('../controllers/agentReviewController');

module.exports = ({ Client, getGCSFileStream, uploadsDir }) => {
  const router = express.Router();

  // Create controller with dependencies
  const agentReviewController = createAgentReviewController({
    Client,
    getGCSFileStream,
    uploadsDir
  });

  // Debug endpoint to test agent authentication
  router.get('/debug/auth', authenticateAgent, rateLimits.general, async (req, res) => {
    res.json({
      success: true,
      message: 'Agent authentication working',
      agent: {
        id: req.agentId,
        username: req.agentUsername,
        role: req.agentRole
      },
      timestamp: new Date().toISOString()
    });
  });

  // Get available clients for review
  // GET /api/agent-review/available-clients
  router.get('/available-clients', authenticateAgent, rateLimits.general, agentReviewController.getAvailableClients);

  // Get review data for a specific client
  // GET /api/agent-review/:clientId
  router.get('/:clientId', authenticateAgent, rateLimits.general, agentReviewController.getClientReviewData);

  // Serve document for a specific client
  // GET /api/agent-review/:clientId/document/:documentId
  router.get('/:clientId/document/:documentId', authenticateAgent, rateLimits.general, agentReviewController.serveDocument);

  // Save corrections for a specific document
  // POST /api/agent-review/:clientId/correct
  router.post('/:clientId/correct', authenticateAgent, rateLimits.general, agentReviewController.saveCorrections);

  // Complete the review session
  // POST /api/agent-review/:clientId/complete
  router.post('/:clientId/complete', authenticateAgent, rateLimits.general, agentReviewController.completeReviewSession);

  return router;
};