const express = require('express');
const router = express.Router();
const TestDataController = require('../controllers/testDataController');
const { authenticateAdmin } = require('../middleware/auth');

/**
 * Test Data Router Factory
 */
module.exports = ({ testDataService, creditorContactService, clientsData, Client, Agent }) => {
    const controller = new TestDataController({
        testDataService,
        creditorContactService,
        clientsData,
        Client,
        Agent
    });

    // Initialize demo data
    router.post('/test/phase2/init-demo-client', authenticateAdmin, controller.initDemoClient);

    // Reset test data
    router.post('/test/phase2/reset', authenticateAdmin, controller.resetTestData);

    // Create test agent
    router.post('/test/create-agent', authenticateAdmin, controller.createTestAgent);

    // Document Debug Routes
    router.get('/documents-list', authenticateAdmin, controller.getDocumentsList);
    router.get('/test-document', authenticateAdmin, controller.testDocumentAccess);

    return router;
};
