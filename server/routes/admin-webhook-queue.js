/**
 * Admin Webhook Queue Routes
 *
 * Admin interface for monitoring and managing the webhook queue.
 */
const express = require('express');
const router = express.Router();
const webhookQueueService = require('../services/webhookQueueService');
const { authenticateAdmin } = require('../middleware/auth');

/**
 * Get queue statistics
 * GET /api/admin/webhook-queue/stats
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await webhookQueueService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats', details: error.message });
  }
});

/**
 * Get list of jobs
 * GET /api/admin/webhook-queue/jobs
 *
 * Query params:
 * - status: Filter by status (pending, processing, completed, failed, retrying)
 * - limit: Max results (default: 50)
 * - skip: Skip results (default: 0)
 */
router.get('/jobs', authenticateAdmin, async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;

    const jobs = await webhookQueueService.getJobs({
      status: status || undefined,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    const stats = await webhookQueueService.getStats();

    res.json({
      success: true,
      jobs,
      total: stats.total,
      stats
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to get jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs', details: error.message });
  }
});

/**
 * Get a specific job
 * GET /api/admin/webhook-queue/jobs/:jobId
 */
router.get('/jobs/:jobId', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await webhookQueueService.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to get job:', error);
    res.status(500).json({ error: 'Failed to get job', details: error.message });
  }
});

/**
 * Retry a failed job
 * POST /api/admin/webhook-queue/jobs/:jobId/retry
 */
router.post('/jobs/:jobId/retry', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = await webhookQueueService.retryJob(jobId);

    if (!success) {
      return res.status(404).json({ error: 'Job not found or not in failed state' });
    }

    res.json({
      success: true,
      message: `Job ${jobId} queued for retry`
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to retry job:', error);
    res.status(500).json({ error: 'Failed to retry job', details: error.message });
  }
});

/**
 * Delete a job
 * DELETE /api/admin/webhook-queue/jobs/:jobId
 */
router.delete('/jobs/:jobId', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = await webhookQueueService.deleteJob(jobId);

    if (!success) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      message: `Job ${jobId} deleted`
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to delete job:', error);
    res.status(500).json({ error: 'Failed to delete job', details: error.message });
  }
});

/**
 * Clean up old completed jobs
 * POST /api/admin/webhook-queue/cleanup
 *
 * Body:
 * - olderThanDays: Delete jobs older than this many days (default: 7)
 */
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const { olderThanDays = 7 } = req.body;
    const deletedCount = await webhookQueueService.cleanupOldJobs(olderThanDays);

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old jobs`,
      deleted_count: deletedCount
    });
  } catch (error) {
    console.error('[admin-webhook-queue] Failed to cleanup jobs:', error);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: error.message });
  }
});

module.exports = router;
