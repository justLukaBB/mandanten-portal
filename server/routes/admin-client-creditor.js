const express = require('express');
const router = express.Router();
const createAdminClientCreditorController = require('../controllers/adminClientCreditorController');
const { authenticateAdmin, rateLimits } = require('../middleware/auth');
// Note: rateLimits might not be directly exported from '../middleware/auth' in the original server.js structure
// It was require('./middleware/security').rateLimits in server.js.
// I will check imports in server.js to be sure, but for now I will assume I need to pass it or import it correctly.
// Actually, looking at server.js: const { rateLimits, ... } = require('./middleware/security');
// So I should import rateLimits from ../middleware/security

const { rateLimits: securityRateLimits } = require('../middleware/security');


module.exports = ({ Client, safeClientUpdate, DelayedProcessingService, aiDedupScheduler }) => {
    const controller = createAdminClientCreditorController({ Client, safeClientUpdate, DelayedProcessingService, aiDedupScheduler });

    // Admin: Add manual creditor to any client
    router.post('/clients/:clientId/add-creditor',
        securityRateLimits.admin,
        authenticateAdmin,
        controller.addCreditor
    );

    // Admin: Get all creditors for a specific client
    router.get('/clients/:clientId/creditors',
        securityRateLimits.admin,
        authenticateAdmin,
        controller.getCreditors
    );

    // Admin: Update/Edit existing creditor
    router.put('/clients/:clientId/creditors/:creditorId',
        securityRateLimits.admin,
        authenticateAdmin,
        controller.updateCreditor
    );

    // Admin: Delete creditor
    router.delete('/clients/:clientId/creditors/:creditorId',
        securityRateLimits.admin,
        authenticateAdmin,
        controller.deleteCreditor
    );

    // Admin: Skip 7-day delay
    router.post('/clients/:clientId/skip-seven-day-delay',
        securityRateLimits.admin,
        authenticateAdmin,
        controller.skipSevenDayDelay
    );

    return router;
};
