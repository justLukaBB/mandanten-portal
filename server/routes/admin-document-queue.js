/**
 * Admin Document Queue Routes
 *
 * Admin interface for monitoring and managing the document processing queue.
 */
const express = require('express');
const router = express.Router();
const documentQueueService = require('../services/documentQueueService');
const DocumentProcessingJob = require('../models/DocumentProcessingJob');
const { authenticateAdmin } = require('../middleware/auth');

/**
 * Get queue statistics
 * GET /api/admin/document-queue/stats
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await documentQueueService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats', details: error.message });
  }
});

/**
 * Get list of jobs
 * GET /api/admin/document-queue/jobs
 *
 * Query params:
 * - status: Filter by status (pending, processing, completed, failed, retrying)
 * - client_id: Filter by client
 * - limit: Max results (default: 50)
 * - skip: Skip results (default: 0)
 */
router.get('/jobs', authenticateAdmin, async (req, res) => {
  try {
    const { status, client_id, limit = 50, skip = 0 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (client_id) query.client_id = client_id;

    const jobs = await DocumentProcessingJob.find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const stats = await documentQueueService.getStats();

    res.json({
      success: true,
      jobs,
      total: stats.total,
      stats
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to get jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs', details: error.message });
  }
});

/**
 * Get jobs for a specific client
 * GET /api/admin/document-queue/client/:clientId
 */
router.get('/client/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limit = 50 } = req.query;

    const jobs = await documentQueueService.getJobsByClient(clientId, parseInt(limit));

    res.json({
      success: true,
      client_id: clientId,
      jobs,
      total: jobs.length
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to get client jobs:', error);
    res.status(500).json({ error: 'Failed to get client jobs', details: error.message });
  }
});

/**
 * Get a specific job
 * GET /api/admin/document-queue/jobs/:jobId
 */
router.get('/jobs/:jobId', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await DocumentProcessingJob.findOne({ job_id: jobId }).lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to get job:', error);
    res.status(500).json({ error: 'Failed to get job', details: error.message });
  }
});

/**
 * Retry a failed job
 * POST /api/admin/document-queue/jobs/:jobId/retry
 */
router.post('/jobs/:jobId/retry', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = await documentQueueService.retryJob(jobId);

    if (!success) {
      return res.status(404).json({ error: 'Job not found or not in failed state' });
    }

    res.json({
      success: true,
      message: `Job ${jobId} queued for retry`
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to retry job:', error);
    res.status(500).json({ error: 'Failed to retry job', details: error.message });
  }
});

/**
 * Cancel a pending/retrying job
 * POST /api/admin/document-queue/jobs/:jobId/cancel
 */
router.post('/jobs/:jobId/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = await documentQueueService.cancelJob(jobId);

    if (!success) {
      return res.status(404).json({ error: 'Job not found or not in pending/retrying state' });
    }

    res.json({
      success: true,
      message: `Job ${jobId} cancelled`
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to cancel job:', error);
    res.status(500).json({ error: 'Failed to cancel job', details: error.message });
  }
});

/**
 * Retry all failed jobs
 * POST /api/admin/document-queue/retry-all-failed
 */
router.post('/retry-all-failed', authenticateAdmin, async (req, res) => {
  try {
    const result = await DocumentProcessingJob.updateMany(
      { status: 'failed' },
      {
        $set: {
          status: 'pending',
          retry_count: 0,
          error_details: null,
          next_retry_at: null
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} failed jobs queued for retry`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to retry all failed jobs:', error);
    res.status(500).json({ error: 'Failed to retry failed jobs', details: error.message });
  }
});

/**
 * Clear completed jobs older than X days
 * POST /api/admin/document-queue/cleanup
 */
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const { olderThanDays = 1 } = req.body;
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await DocumentProcessingJob.deleteMany({
      status: 'completed',
      completed_at: { $lt: cutoff }
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} completed jobs older than ${olderThanDays} day(s)`,
      deleted_count: result.deletedCount
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to cleanup jobs:', error);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: error.message });
  }
});

/**
 * Get worker status and control
 * GET /api/admin/document-queue/worker
 */
router.get('/worker', authenticateAdmin, async (req, res) => {
  try {
    const stats = await documentQueueService.getStats();
    res.json({
      success: true,
      worker: stats.worker,
      config: stats.config
    });
  } catch (error) {
    console.error('[admin-document-queue] Failed to get worker status:', error);
    res.status(500).json({ error: 'Failed to get worker status', details: error.message });
  }
});

module.exports = router;
