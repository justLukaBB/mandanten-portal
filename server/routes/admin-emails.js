const express = require('express');
const router = express.Router();
const createAdminEmailController = require('../controllers/adminEmailController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits: securityRateLimits } = require('../middleware/security');

module.exports = ({ CreditorEmail, Client }) => {
  const controller = createAdminEmailController({ CreditorEmail, Client });

  router.get('/emails',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.list
  );

  router.get('/emails/stats',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.stats
  );

  router.get('/emails/:id',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.detail
  );

  router.patch('/emails/:id/review',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.review
  );

  router.patch('/emails/:id/assign',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.assign
  );

  return router;
};
