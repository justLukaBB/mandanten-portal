/**
 * DocumentQueueService
 *
 * MongoDB-based queue for document processing with:
 * - Max concurrent processing (default: 2)
 * - Automatic retries with exponential backoff
 * - Priority support
 * - Dead-letter queue (failed status)
 *
 * This prevents overwhelming the FastAPI server and Gemini API.
 */

const { v4: uuidv4 } = require('uuid');
const DocumentProcessingJob = require('../models/DocumentProcessingJob');
const { createProcessingJob } = require('../utils/fastApiClient');

// Configuration
const MAX_CONCURRENT = parseInt(process.env.DOC_QUEUE_MAX_CONCURRENT) || 2;
const POLL_INTERVAL_MS = parseInt(process.env.DOC_QUEUE_POLL_INTERVAL_MS) || 2000;
const MAX_RETRIES = parseInt(process.env.DOC_QUEUE_MAX_RETRIES) || 3;
const BASE_RETRY_DELAY_MS = parseInt(process.env.DOC_QUEUE_BASE_RETRY_DELAY_MS) || 30000; // 30 seconds
const MAX_RETRY_DELAY_MS = parseInt(process.env.DOC_QUEUE_MAX_RETRY_DELAY_MS) || 300000; // 5 minutes
const JOB_TIMEOUT_MS = parseInt(process.env.DOC_QUEUE_JOB_TIMEOUT_MS) || 600000; // 10 minutes

class DocumentQueueService {
  constructor() {
    this.isRunning = false;
    this.currentProcessing = 0;
    this.pollInterval = null;
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalRetried: 0,
      startedAt: null
    };
  }

  /**
   * Start the queue worker
   */
  start() {
    if (this.isRunning) {
      console.log('[DocumentQueue] Worker already running');
      return;
    }

    this.isRunning = true;
    this.stats.startedAt = new Date();

    console.log(`\n📋 ================================`);
    console.log(`📋 DOCUMENT QUEUE WORKER STARTED`);
    console.log(`📋 ================================`);
    console.log(`⚙️  Max Concurrent: ${MAX_CONCURRENT}`);
    console.log(`⏱️  Poll Interval: ${POLL_INTERVAL_MS}ms`);
    console.log(`🔄 Max Retries: ${MAX_RETRIES}`);
    console.log(`⏰ Job Timeout: ${JOB_TIMEOUT_MS / 1000}s`);
    console.log(`📋 ================================\n`);

    this._poll();
  }

  /**
   * Stop the queue worker
   */
  stop() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[DocumentQueue] Worker stopped');
  }

  /**
   * Add a document to the processing queue
   *
   * @param {Object} params - Job parameters
   * @param {string} params.clientId - Client ID
   * @param {string} params.documentId - Document ID
   * @param {Object} params.fileData - File information
   * @param {string} params.webhookUrl - Webhook URL for results
   * @param {string} [params.clientName] - Client name
   * @param {string} [params.apiKey] - Gemini API key
   * @param {number} [params.priority] - Job priority (1-10, lower = higher priority)
   * @returns {Promise<{success: boolean, job_id: string}>}
   */
  async enqueue({
    clientId,
    documentId,
    fileData,
    webhookUrl,
    clientName = null,
    apiKey = null,
    priority = 5
  }) {
    try {
      const jobId = `docjob_${uuidv4()}`;

      // Check if document already has a pending/processing job
      const existing = await DocumentProcessingJob.findOne({
        document_id: documentId,
        status: { $in: ['pending', 'processing', 'retrying'] }
      });

      if (existing) {
        console.log(`[DocumentQueue] Document ${documentId} already in queue (${existing.status}) - skipping`);
        return { success: true, skipped: true, reason: 'already_queued', job_id: existing.job_id };
      }

      // Create job
      const job = await DocumentProcessingJob.create({
        job_id: jobId,
        client_id: clientId,
        document_id: documentId,
        file_data: fileData,
        client_name: clientName,
        webhook_url: webhookUrl,
        api_key: apiKey,
        priority: priority,
        status: 'pending',
        retry_count: 0,
        max_retries: MAX_RETRIES,
        created_at: new Date()
      });

      this.stats.totalEnqueued++;

      console.log(`[DocumentQueue] 📥 Enqueued job ${jobId}`);
      console.log(`   📄 Document: ${fileData.filename}`);
      console.log(`   👤 Client: ${clientId}`);
      console.log(`   🎯 Priority: ${priority}`);

      return { success: true, job_id: job.job_id };

    } catch (error) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        console.log(`[DocumentQueue] Document ${documentId} already queued (race condition handled)`);
        return { success: true, skipped: true, reason: 'duplicate_key' };
      }

      console.error(`[DocumentQueue] Failed to enqueue document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Poll for and process jobs
   * @private
   */
  async _poll() {
    if (!this.isRunning) return;

    try {
      // Check if we can process more jobs
      while (this.currentProcessing < MAX_CONCURRENT) {
        const job = await this._claimNextJob();
        if (!job) break;

        // Process in background (don't await)
        this._processJob(job).catch(err => {
          console.error(`[DocumentQueue] Unhandled error processing job ${job.job_id}:`, err);
        });
      }
    } catch (error) {
      console.error('[DocumentQueue] Poll error:', error);
    }

    // Schedule next poll
    this.pollInterval = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
  }

  /**
   * Claim the next available job atomically
   * @private
   * @returns {Promise<DocumentProcessingJob|null>}
   */
  async _claimNextJob() {
    const now = new Date();

    // First, check for stuck jobs (processing for too long)
    await this._handleStuckJobs();

    // Atomically find and claim the next job
    const job = await DocumentProcessingJob.findOneAndUpdate(
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
        sort: { priority: 1, created_at: 1 }, // Priority first, then FIFO
        new: true
      }
    );

    if (job) {
      this.currentProcessing++;
      console.log(`[DocumentQueue] 🔄 Claimed job ${job.job_id} (${this.currentProcessing}/${MAX_CONCURRENT} processing)`);
    }

    return job;
  }

  /**
   * Process a single job
   * @private
   * @param {DocumentProcessingJob} job
   */
  async _processJob(job) {
    const startTime = Date.now();

    try {
      console.log(`\n[DocumentQueue] 🚀 Processing job ${job.job_id}`);
      console.log(`   📄 File: ${job.file_data.filename}`);
      console.log(`   👤 Client: ${job.client_id}`);
      console.log(`   🔄 Attempt: ${job.retry_count + 1}/${job.max_retries + 1}`);

      // Call FastAPI
      const result = await createProcessingJob({
        clientId: job.client_id,
        clientName: job.client_name,
        files: [{
          filename: job.file_data.filename,
          gcs_path: job.file_data.gcs_path,
          local_path: job.file_data.local_path,
          mime_type: job.file_data.mime_type,
          size: job.file_data.size,
          document_id: job.document_id
        }],
        webhookUrl: job.webhook_url,
        apiKey: job.api_key || process.env.GEMINI_API_KEY
      });

      if (result.success) {
        // Success - mark completed
        await this._markCompleted(job.job_id, result.jobId);
        this.stats.totalProcessed++;

        const duration = Date.now() - startTime;
        console.log(`[DocumentQueue] ✅ Job ${job.job_id} completed in ${duration}ms`);
        console.log(`   🔑 FastAPI Job ID: ${result.jobId}`);
      } else {
        // FastAPI returned error
        throw new Error(result.error || 'FastAPI job creation failed');
      }

    } catch (error) {
      console.error(`[DocumentQueue] ❌ Job ${job.job_id} failed:`, error.message);
      await this._handleJobFailure(job, error);

    } finally {
      this.currentProcessing--;
    }
  }

  /**
   * Mark a job as completed
   * @private
   */
  async _markCompleted(jobId, fastapiJobId) {
    await DocumentProcessingJob.findOneAndUpdate(
      { job_id: jobId },
      {
        $set: {
          status: 'completed',
          fastapi_job_id: fastapiJobId,
          completed_at: new Date()
        }
      }
    );
  }

  /**
   * Handle job failure with retry logic
   * @private
   */
  async _handleJobFailure(job, error) {
    const retryCount = job.retry_count + 1;

    // Check if we should retry
    const shouldRetry = retryCount < job.max_retries && this._isRetryableError(error);

    if (shouldRetry) {
      // Exponential backoff: 30s, 60s, 120s...
      const delayMs = Math.min(
        BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1),
        MAX_RETRY_DELAY_MS
      );

      const nextRetryAt = new Date(Date.now() + delayMs);

      await DocumentProcessingJob.findOneAndUpdate(
        { job_id: job.job_id },
        {
          $set: {
            status: 'retrying',
            retry_count: retryCount,
            next_retry_at: nextRetryAt,
            error_details: {
              message: error.message,
              error_type: error.errorType || 'UNKNOWN',
              last_error_at: new Date()
            }
          }
        }
      );

      this.stats.totalRetried++;
      console.log(`[DocumentQueue] ⏳ Job ${job.job_id} scheduled for retry ${retryCount}/${job.max_retries} in ${delayMs / 1000}s`);

    } else {
      // Max retries reached or non-retryable error - move to failed
      await DocumentProcessingJob.findOneAndUpdate(
        { job_id: job.job_id },
        {
          $set: {
            status: 'failed',
            retry_count: retryCount,
            error_details: {
              message: error.message,
              error_type: error.errorType || 'UNKNOWN',
              stack: error.stack,
              last_error_at: new Date()
            },
            completed_at: new Date()
          }
        }
      );

      this.stats.totalFailed++;
      console.log(`[DocumentQueue] ❌ Job ${job.job_id} failed permanently after ${retryCount} attempts`);

      // Update document status in client
      await this._updateDocumentStatus(job.client_id, job.document_id, 'failed', error.message);
    }
  }

  /**
   * Check if an error is retryable
   * @private
   */
  _isRetryableError(error) {
    const message = error.message || '';
    const retryablePatterns = [
      'fetch failed',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'timeout',
      '429',
      'rate limit',
      '502',
      '503',
      '504',
      'circuit breaker'
    ];

    return retryablePatterns.some(pattern =>
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Handle stuck jobs (processing for too long)
   * @private
   */
  async _handleStuckJobs() {
    const stuckThreshold = new Date(Date.now() - JOB_TIMEOUT_MS);

    const stuckJobs = await DocumentProcessingJob.find({
      status: 'processing',
      processing_started_at: { $lt: stuckThreshold }
    });

    for (const job of stuckJobs) {
      console.log(`[DocumentQueue] ⚠️ Found stuck job ${job.job_id} - resetting to retry`);

      await DocumentProcessingJob.findOneAndUpdate(
        { job_id: job.job_id },
        {
          $set: {
            status: 'retrying',
            next_retry_at: new Date(),
            error_details: {
              message: 'Job timed out (stuck in processing)',
              error_type: 'TIMEOUT',
              last_error_at: new Date()
            }
          },
          $inc: { retry_count: 1 }
        }
      );
    }
  }

  /**
   * Update document status in client record
   * @private
   */
  async _updateDocumentStatus(clientId, documentId, status, errorMessage) {
    try {
      const Client = require('../models/Client');
      await Client.findOneAndUpdate(
        { id: clientId, 'documents.id': documentId },
        {
          $set: {
            'documents.$.processing_status': status,
            'documents.$.document_status': 'processing_failed',
            'documents.$.processing_error': errorMessage,
            'documents.$.processed_at': new Date().toISOString()
          }
        }
      );
    } catch (err) {
      console.error(`[DocumentQueue] Failed to update document status:`, err);
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const queueStats = await DocumentProcessingJob.getQueueStats();

    return {
      ...queueStats,
      worker: {
        isRunning: this.isRunning,
        currentProcessing: this.currentProcessing,
        maxConcurrent: MAX_CONCURRENT,
        ...this.stats
      },
      config: {
        maxConcurrent: MAX_CONCURRENT,
        pollIntervalMs: POLL_INTERVAL_MS,
        maxRetries: MAX_RETRIES,
        baseRetryDelayMs: BASE_RETRY_DELAY_MS,
        jobTimeoutMs: JOB_TIMEOUT_MS
      }
    };
  }

  /**
   * Get jobs for a specific client
   * @param {string} clientId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getJobsByClient(clientId, limit = 50) {
    return DocumentProcessingJob.getJobsByClient(clientId, limit);
  }

  /**
   * Manually retry a failed job
   * @param {string} jobId
   * @returns {Promise<boolean>}
   */
  async retryJob(jobId) {
    const result = await DocumentProcessingJob.findOneAndUpdate(
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
      console.log(`[DocumentQueue] 🔁 Job ${jobId} manually reset for retry`);
      return true;
    }
    return false;
  }

  /**
   * Cancel a pending job
   * @param {string} jobId
   * @returns {Promise<boolean>}
   */
  async cancelJob(jobId) {
    const result = await DocumentProcessingJob.findOneAndUpdate(
      { job_id: jobId, status: { $in: ['pending', 'retrying'] } },
      {
        $set: {
          status: 'failed',
          error_details: {
            message: 'Job cancelled by user',
            error_type: 'CANCELLED',
            last_error_at: new Date()
          },
          completed_at: new Date()
        }
      }
    );

    if (result) {
      console.log(`[DocumentQueue] 🛑 Job ${jobId} cancelled`);
      return true;
    }
    return false;
  }
}

// Singleton instance
const documentQueueService = new DocumentQueueService();

module.exports = documentQueueService;
