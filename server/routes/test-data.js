const express = require('express');
const router = express.Router();
const TestDataController = require('../controllers/testDataController');

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
    router.post('/test/phase2/init-demo-client', controller.initDemoClient);

    // Reset test data
    router.post('/test/phase2/reset', controller.resetTestData);

    // Create test agent
    router.post('/test/create-agent', controller.createTestAgent);

    // Document Debug Routes
    router.get('/documents-list', controller.getDocumentsList);
    router.get('/test-document', controller.testDocumentAccess);

    return router;
};
