const express = require('express');
const router = express.Router();
const AdminMaintenanceController = require('../controllers/adminMaintenanceController');
const { rateLimits, authenticateAdmin } = require('../middleware/security');
// Import actual middleware for authentication if not exported from security (Wait, security.js usually exports rateLimits but auth middleware is in auth.js)
// Checking server.js: const { authenticateAdmin } = require('./middleware/auth');
const { authenticateAdmin: authAdminMiddleware } = require('../middleware/auth');


/**
 * Admin Maintenance Router Factory
 */
module.exports = ({ creditorContactService, documentReminderService, Client, safeClientUpdate }) => {
    const controller = new AdminMaintenanceController({
        creditorContactService,
        documentReminderService,
        Client,
        safeClientUpdate
    });

    // Process timeouts
    router.post('/admin/process-timeout-creditors',
        authAdminMiddleware,
        controller.processTimeoutCreditors
    );

    // Trigger document reminders
    router.post('/admin/trigger-document-reminders',
        rateLimits.admin,
        authAdminMiddleware,
        controller.triggerDocumentReminders
    );

    // Check document status
    router.post('/admin/check-document-status/:clientId',
        rateLimits.admin,
        authAdminMiddleware,
        controller.checkDocumentStatus
    );

    // Fix creditor contacts (Maintenance tool)
    // Server.js mounted this at /api/clients/:clientId/fix-creditor-contacts
    // So we should mount it at / (or handle the prefix in server.js)
    // If we mount this router at /api, then:
    router.post('/clients/:clientId/fix-creditor-contacts',
        authAdminMiddleware,
        controller.fixCreditorContacts
    );

    return router;
};
