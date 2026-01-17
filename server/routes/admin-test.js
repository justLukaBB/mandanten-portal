const express = require('express');
const router = express.Router();
const createAdminTestController = require('../controllers/adminTestController');
const { authenticateAdmin } = require('../middleware/auth');

// Factory function to inject dependencies
module.exports = (dependencies) => {
    const adminTestController = createAdminTestController(dependencies);

    // --- Debt Extraction Tests ---
    router.post('/admin/test-debt-extraction', authenticateAdmin, adminTestController.testDebtExtraction);
    router.get('/admin/test-debt-extraction-suite', authenticateAdmin, adminTestController.testDebtExtractionSuite);

    // --- System Simulation & Integration Tests ---
    router.get('/admin/test-zendesk', authenticateAdmin, adminTestController.testZendeskConnection);
    router.post('/admin/clients/:clientId/simulate-30-day-period', authenticateAdmin, adminTestController.simulateThirtyDayPeriod);
    router.post('/admin/clients/:clientId/add-demo-documents', authenticateAdmin, adminTestController.addDemoDocuments);


    // --- Creditor Response Simulations ---
    // Simulate responses for a client
    router.post('/clients/:clientId/simulate-creditor-responses', authenticateAdmin, adminTestController.simulateCreditorResponses);

    // Manual process creditor response (Test/Admin tool)
    router.post('/admin/process-creditor-response', authenticateAdmin, adminTestController.processCreditorResponse);

    // Webhook Test
    router.post('/admin/test-webhook-response', authenticateAdmin, adminTestController.testWebhookResponse);

    // Mock Data Creation (Phase 2 Test)
    router.post('/test/create-demo-creditor-contacts/:clientId', authenticateAdmin, adminTestController.createDemoCreditorContacts);

    // Garnishment Calculator Test
    router.get('/test/garnishment-calculator', authenticateAdmin, adminTestController.testGarnishmentCalculator);

    // Response Stats (Client specific)
    router.get('/clients/:clientId/response-stats', authenticateAdmin, adminTestController.getResponseStats);

    // --- Phase 2 Simulation & Test Data Routes ---
    router.get('/test/phase2/stats', authenticateAdmin, adminTestController.getPhase2Stats); // Stats
    router.get('/test/phase2/financial-profiles', authenticateAdmin, adminTestController.getAllFinancialProfiles); // All Profiles
    router.get('/test/phase2/financial-profiles/:profileId', authenticateAdmin, adminTestController.getFinancialProfile); // Single Profile
    router.post('/test/phase2/test-financial-profile/:profileId', authenticateAdmin, adminTestController.testFinancialProfile); // Test Profile
    router.get('/test/phase2/run-financial-tests', authenticateAdmin, adminTestController.runFinancialTests); // Run All Tests
    router.post('/test/phase2/create-test-client/:testCaseId', authenticateAdmin, adminTestController.createTestClient); // Create Mock Client
    router.post('/test/phase2/run-integration-test/:testCaseId', authenticateAdmin, adminTestController.runIntegrationTest); // Run Integration Test
    router.get('/test/phase2/creditor-scenarios', authenticateAdmin, adminTestController.getCreditorScenarios); // Get Scenarios
    router.get('/test/phase2/workflow-tests', authenticateAdmin, adminTestController.getWorkflowTestCases); // Get Workflow Tests
    router.get('/test/phase2/garnishment-edge-cases', authenticateAdmin, adminTestController.testGarnishmentEdgeCases); // Test Edge Cases

    return router;
};
