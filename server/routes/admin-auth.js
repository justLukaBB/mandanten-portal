const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits, validateRequest, validationRules } = require('../middleware/security');

/**
 * Admin Auth Router Factory
 */
module.exports = () => {
    // Admin Login
    router.post('/login',
        rateLimits.auth,
        validateRequest([
            validationRules.email,
            validationRules.password
        ]),
        adminAuthController.login
    );

    // Get current admin user (token validation + fresh data)
    router.get('/me', authenticateAdmin, adminAuthController.me);

    return router;
};
