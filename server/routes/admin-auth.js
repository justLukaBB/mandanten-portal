const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
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

    return router;
};
