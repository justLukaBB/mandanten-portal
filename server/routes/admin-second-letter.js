const express = require('express');
const router = express.Router();
const createAdminSecondLetterController = require('../controllers/adminSecondLetterController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

/**
 * Factory function — receives secondLetterTriggerService from server.js dependency injection.
 *
 * @param {{ secondLetterTriggerService: import('../services/secondLetterTriggerService') }} param0
 * @returns {express.Router}
 */
module.exports = ({ secondLetterTriggerService }) => {
  const controller = createAdminSecondLetterController({ secondLetterTriggerService });

  // POST /api/admin/clients/:clientId/trigger-second-letter
  router.post(
    '/clients/:clientId/trigger-second-letter',
    rateLimits.admin,
    authenticateAdmin,
    controller.triggerSecondLetter
  );

  return router;
};
