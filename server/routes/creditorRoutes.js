const express = require('express');
const router = express.Router();
const creditorController = require('../controllers/creditorController');
const { rateLimits } = require('../middleware/security');
const { authenticateClient, authenticateAdmin } = require('../middleware/auth');

router.post(
    '/clients/:clientId/creditors',
    rateLimits.general,
    authenticateClient,
    (req, res) => creditorController.addCreditorClient(req, res)
);


router.get(
    '/clients/:clientId/creditors',
    rateLimits.general,
    authenticateClient,
    (req, res) => creditorController.getCreditors(req, res)
);

router.post(
    '/admin/clients/:clientId/add-creditor',
    rateLimits.admin,
    authenticateAdmin,
    (req, res) => creditorController.addCreditorAdmin(req, res)
);

module.exports = router;
