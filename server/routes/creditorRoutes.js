const express = require('express');
const router = express.Router();
const creditorController = require('../controllers/creditorController');
const { rateLimits } = require('../middleware/security');
const { authenticateClient, authenticateAdmin } = require('../middleware/auth');

/**
 * Client Routes
 * Authenticated client users can manage their own creditors
 */

// Add new creditor (client portal)
router.post(
    '/clients/:clientId/creditors',
    rateLimits.general,
    authenticateClient,
    (req, res) => creditorController.addCreditorClient(req, res)
);

// Get creditors list (client portal)
router.get(
    '/clients/:clientId/creditors',
    rateLimits.general,
    authenticateClient,
    (req, res) => creditorController.getCreditors(req, res)
);

/**
 * Admin Routes
 * Admin users can manage creditors for any client
 */

// Add new creditor (admin portal)
router.post(
    '/admin/clients/:clientId/add-creditor',
    rateLimits.admin,
    authenticateAdmin,
    (req, res) => creditorController.addCreditorAdmin(req, res)
);

module.exports = router;
