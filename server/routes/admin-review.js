const express = require('express');
const router = express.Router();
const createAdminReviewController = require('../controllers/adminReviewController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

module.exports = (dependencies) => {
  const adminReviewController = createAdminReviewController(dependencies);

  // Settings
  router.get('/settings', rateLimits.admin, authenticateAdmin, adminReviewController.getSettings);
  router.put('/settings', rateLimits.admin, authenticateAdmin, adminReviewController.updateSettings);

  // Analytics
  router.get('/analytics', rateLimits.admin, authenticateAdmin, adminReviewController.getAnalytics);

  // Queue with priority scores
  router.get('/queue', rateLimits.admin, authenticateAdmin, adminReviewController.getQueueWithPriority);

  // Single assignment
  router.post('/:clientId/assign', rateLimits.admin, authenticateAdmin, adminReviewController.assignReview);
  router.delete('/:clientId/assign', rateLimits.admin, authenticateAdmin, adminReviewController.unassignReview);

  // Batch operations
  router.post('/batch/assign', rateLimits.admin, authenticateAdmin, adminReviewController.batchAssign);
  router.post('/batch/priority', rateLimits.admin, authenticateAdmin, adminReviewController.batchUpdatePriority);
  router.post('/batch/confirm', rateLimits.admin, authenticateAdmin, adminReviewController.batchConfirm);

  return router;
};
