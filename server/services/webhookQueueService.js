/**
 * WebhookQueueService
 *
 * Enterprise-grade webhook queue service implementing patterns from
 * Stripe, GitHub, and other large-scale webhook systems.
 *
 * Features:
 * - Idempotency (prevents duplicate processing)
 * - Retry with exponential backoff
 * - Dead-letter queue for failed jobs
 * - Atomic job claiming (prevents race conditions)
 */

const WebhookJob = require('../models/WebhookJob');

class WebhookQueueService {
  constructor() {
    this.maxRetries = parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3;
    this.baseRetryDelayMs = parseInt(process.env.WEBHOOK_RETRY_DELAY_MS) || 1000;
    this.maxRetryDelayMs = parseInt(process.env.WEBHOOK_MAX_RETRY_DELAY_MS) || 30000;
  }

  /**
   * Enqueue a webhook job with idempotency check.
   *
   * @param {string} jobId - Unique job identifier (idempotency key)
   * @param {string} webhookType - Type of webhook ('ai-processing', etc.)
   * @param {object} payload - Full webhook payload
   * @returns {Promise<{success: boolean, job_id: string, skipped?: boolean, reason?: string}>}
   */
  async enqueue(jobId, webhookType, payload) {
    try {
      // Check idempotency - skip if already completed
      const existing = await WebhookJob.findOne({ job_id: jobId });

      if (existing) {
        if (existing.status === 'completed') {
          console.log(`[WebhookQueue] Job ${jobId} already completed - skipping (idempotency)`);
          return { success: true, skipped: true, reason: 'already_processed', job_id: jobId };
        }

        if (existing.status === 'processing') {
          console.log(`[WebhookQueue] Job ${jobId} already processing - skipping`);
          return { success: true, skipped: true, reason: 'already_processing', job_id: jobId };
        }

        // Job exists but is pending/retrying - update payload and reset
        console.log(`[WebhookQueue] Job ${jobId} exists with status ${existing.status} - resetting`);
        existing.payload = payload;
        existing.status = 'pending';
        existing.retry_count = 0;
        existing.error_details = null;
        existing.next_retry_at = null;
        await existing.save();
        return { success: true, job_id: jobId, reset: true };
      }

      // Create new job
      const job = await WebhookJob.create({
        job_id: jobId,
        webhook_type: webhookType,
        payload: payload,
        status: 'pending',
        retry_count: 0,
        max_retries: this.maxRetries,
        created_at: new Date()
      });

      console.log(`[WebhookQueue] 📥 Enqueued job ${jobId} (type: ${webhookType})`);
      return { success: true, job_id: job.job_id };

    } catch (error) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        console.log(`[WebhookQueue] Job ${jobId} already exists (race condition handled)`);
        return { success: true, skipped: true, reason: 'duplicate_key', job_id: jobId };
      }

      console.error(`[WebhookQueue] Failed to enqueue job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get and claim the next pending job for processing.
   * Uses atomic findOneAndUpdate to prevent race conditions.
   *
   * @returns {Promise<WebhookJob|null>}
   */
  async processNext() {
    const now = new Date();

    // Atomically find and claim the next job
    const job = await WebhookJob.findOneAndUpdate(
      {
        $or: [
          { status: 'pending' },
          { status: 'retrying', next_retry_at: { $lte: now } }
        ]
      },
      {
        $set: {
          status: 'processing',
          processing_started_at: now
        }
      },
      {
        sort: { created_at: 1 }, // FIFO ordering
        new: true
      }
    );

    if (job) {
      console.log(`[WebhookQueue] 🔄 Claimed job ${job.job_id} for processing`);
    }

    return job;
  }

  /**
   * Mark a job as successfully completed.
   *
   * @param {string} jobId - Job identifier
   */
  async markCompleted(jobId) {
    await WebhookJob.findOneAndUpdate(
      { job_id: jobId },
      {
        $set: {
          status: 'completed',
          completed_at: new Date()
        }
      }
    );
    console.log(`[WebhookQueue] ✅ Job ${jobId} completed`);
  }

  /**
   * Mark a job as failed with retry logic.
   *
   * @param {string} jobId - Job identifier
   * @param {Error} error - The error that occurred
   * @param {boolean} retry - Whether to retry (default: true)
   */
  async markFailed(jobId, error, retry = true) {
    const job = await WebhookJob.findOne({ job_id: jobId });
    if (!job) {
      console.error(`[WebhookQueue] Job ${jobId} not found for marking failed`);
      return;
    }

    job.retry_count += 1;
    job.error_details = {
      message: error.message || String(error),
      stack: error.stack || null,
      last_error_at: new Date()
    };

    if (retry && job.retry_count < job.max_retries) {
      // Exponential backoff: 1s, 2s, 4s, 8s... capped at maxRetryDelayMs
      const delayMs = Math.min(
        this.baseRetryDelayMs * Math.pow(2, job.retry_count - 1),
        this.maxRetryDelayMs
      );
      job.status = 'retrying';
      job.next_retry_at = new Date(Date.now() + delayMs);

      console.log(`[WebhookQueue] ⏳ Job ${jobId} scheduled for retry ${job.retry_count}/${job.max_retries} in ${delayMs}ms`);
    } else {
      // Max retries reached - move to dead-letter (failed status)
      job.status = 'failed';
      console.log(`[WebhookQueue] ❌ Job ${jobId} failed permanently after ${job.retry_count} retries`);
    }

    await job.save();
  }

  /**
   * Get queue statistics.
   *
   * @returns {Promise<object>}
   */
  async getStats() {
    return WebhookJob.getQueueStats();
  }

  /**
   * Get recent jobs with optional filtering.
   *
   * @param {object} options - Filter options
   * @param {string} options.status - Filter by status
   * @param {number} options.limit - Max results (default: 50)
   * @param {number} options.skip - Skip results (default: 0)
   * @returns {Promise<WebhookJob[]>}
   */
  async getJobs({ status, limit = 50, skip = 0 } = {}) {
    const query = status ? { status } : {};
    return WebhookJob.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Get a specific job by ID.
   *
   * @param {string} jobId - Job identifier
   * @returns {Promise<WebhookJob|null>}
   */
  async getJob(jobId) {
    return WebhookJob.findOne({ job_id: jobId }).lean();
  }

  /**
   * Manually retry a failed job.
   *
   * @param {string} jobId - Job identifier
   * @returns {Promise<boolean>}
   */
  async retryJob(jobId) {
    const result = await WebhookJob.findOneAndUpdate(
      { job_id: jobId, status: 'failed' },
      {
        $set: {
          status: 'pending',
          retry_count: 0,
          error_details: null,
          next_retry_at: null
        }
      }
    );

    if (result) {
      console.log(`[WebhookQueue] 🔁 Job ${jobId} manually reset for retry`);
      return true;
    }
    return false;
  }

  /**
   * Delete a job (cleanup).
   *
   * @param {string} jobId - Job identifier
   * @returns {Promise<boolean>}
   */
  async deleteJob(jobId) {
    const result = await WebhookJob.deleteOne({ job_id: jobId });
    return result.deletedCount > 0;
  }

  /**
   * Clean up old completed jobs.
   *
   * @param {number} olderThanDays - Delete jobs older than this many days
   * @returns {Promise<number>} - Number of deleted jobs
   */
  async cleanupOldJobs(olderThanDays = 7) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await WebhookJob.deleteMany({
      status: 'completed',
      completed_at: { $lt: cutoff }
    });
    console.log(`[WebhookQueue] 🧹 Cleaned up ${result.deletedCount} old completed jobs`);
    return result.deletedCount;
  }
}

// Singleton instance
const webhookQueueService = new WebhookQueueService();

module.exports = webhookQueueService;
