const express = require('express');
const router = express.Router();
const createAdminDashboardController = require('../controllers/adminDashboardController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

// Factory function to inject dependencies
module.exports = (dependencies) => {
    const adminDashboardController = createAdminDashboardController(dependencies);

    // Stats
    router.get('/dashboard-stats', rateLimits.admin, authenticateAdmin, adminDashboardController.getDashboardStats);

    // Status
    router.get('/dashboard-status', rateLimits.admin, authenticateAdmin, adminDashboardController.getDashboardStatus);

    // Get Clients List
    router.get('/clients', rateLimits.admin, authenticateAdmin, adminDashboardController.getClients);

    // Get Client Workflow Status
    router.get('/clients/:clientId/workflow-status', rateLimits.admin, authenticateAdmin, adminDashboardController.getWorkflowStatus);

    // Create Client
    router.post('/clients', rateLimits.admin, authenticateAdmin, adminDashboardController.createClient);

    // Clear Database (Danger Zone)
    router.delete('/clear-database', rateLimits.admin, authenticateAdmin, adminDashboardController.clearDatabase);

    // Payment & Status Management
    router.post('/clients/:clientId/mark-payment-received', rateLimits.admin, authenticateAdmin, adminDashboardController.markPaymentReceived);
    router.post('/clients/:clientId/reset-payment', rateLimits.admin, authenticateAdmin, adminDashboardController.resetPaymentStatus);
    router.post('/clients/:clientId/trigger-seven-day-review', rateLimits.admin, authenticateAdmin, adminDashboardController.triggerSevenDayReview);
    router.post('/clients/:clientId/generate-creditor-list', rateLimits.admin, authenticateAdmin, adminDashboardController.generateCreditorList);
    router.post('/clients/:clientId/simulate-30-day-period', rateLimits.admin, authenticateAdmin, adminDashboardController.simulate30DayPeriod);

    return router;
};
