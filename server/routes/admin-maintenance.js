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
        // Auth is not strictly enforced in server.js but should be? 
        // server.js line 965: no auth middleware!
        // We should add it for safety, or keep it open if it's called by cron/webhook?
        // It says "manual trigger". Let's assume it's safe to add auth if it's under /api/admin.
        // However, looking at server.js, 1222 has auth. 965 does not.
        // I will add auth to be safe, unless it breaks external triggers.
        // Given it's a "process" endpoint, it might be triggered by a cron job service.
        // I will Leave it optional or check logic.
        // Let's stick to server.js behavior: NO AUTH on process-timeout-creditors (maybe used by cron?)
        // BUT trigger-document-reminders explicitly has auth.
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
        // No auth in server.js line 1083.
        controller.fixCreditorContacts
    );

    return router;
};
