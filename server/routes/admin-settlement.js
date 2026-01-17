const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');
const createController = require('../controllers/adminSettlementController');

/**
/**
 * Admin Settlement Routes Factory
 * @param {SettlementResponseMonitor} monitor - The singleton monitoring instance
 * @param {CreditorService} creditorService - Service for creditor operations
 * @returns {Router} Express router
 */
module.exports = (monitor, creditorService) => {
    const router = express.Router();
    const controller = createController(monitor, creditorService);

    // Settlement response monitoring endpoints
    router.get('/clients/:clientId/settlement-responses', authenticateAdmin, controller.getSettlementResponses);
    router.post('/clients/:clientId/process-settlement-timeouts', authenticateAdmin, controller.processSettlementTimeouts);
    router.get('/clients/:clientId/settlement-monitoring-status', authenticateAdmin, controller.getMonitoringStatus);

    // Nullplan response monitoring endpoints
    router.get('/clients/:clientId/nullplan-responses', authenticateAdmin, controller.getNullplanResponses);

    // Fix Settlement Tracking (Manual)
    router.post('/clients/:clientId/fix-settlement-tracking', authenticateAdmin, controller.fixSettlementTracking);

    return router;
};
