const express = require('express');
const { authenticateAgent } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const agentReviewController = require('../controllers/agentReviewController');

const router = express.Router();

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

// Helper function to serve mock PDF for test scenarios
function serveMockPDF(res, documentName) {
  try {
    const mockPDFContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 110
>>
stream
BT
/F1 12 Tf
50 700 Td
(Mock Test Document: ${documentName}) Tj
0 -20 Td
(This is a test document for Agent Review Dashboard) Tj
0 -40 Td
(Document contains simulated creditor data for testing purposes) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000208 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
370
%%EOF`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${documentName}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(Buffer.from(mockPDFContent));

  } catch (error) {
    console.error('❌ Error serving mock PDF:', error);
    res.status(500).json({
      error: 'Failed to serve mock PDF',
      details: error.message
    });
  }
}

// Get available clients for review
// GET /api/agent-review/available-clients
router.get('/available-clients', authenticateAgent, rateLimits.general, agentReviewController.getAvailableClients);

// Get review data for a specific client
// GET /api/agent-review/:clientId
router.get('/:clientId', authenticateAgent, rateLimits.general, agentReviewController.getClientReviewData);

// Save corrections for a specific document
// POST /api/agent-review/:clientId/correct
router.post('/:clientId/correct', authenticateAgent, rateLimits.general, agentReviewController.saveCorrections);

// Complete the review session
// POST /api/agent-review/:clientId/complete
router.post('/:clientId/complete', authenticateAgent, rateLimits.general, agentReviewController.completeReviewSession);

module.exports = router;