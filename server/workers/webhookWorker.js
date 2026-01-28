/**
 * WebhookWorker
 *
 * Background worker for processing webhook jobs from the queue.
 * Runs continuously and processes jobs asynchronously.
 *
 * Features:
 * - Continuous polling with configurable interval
 * - Graceful shutdown
 * - Error isolation (one job failure doesn't affect others)
 * - Concurrent processing support
 */

const webhookQueueService = require('../services/webhookQueueService');

class WebhookWorker {
  /**
   * Create a new WebhookWorker.
   *
   * @param {object} options - Worker options
   * @param {function} options.processAiProcessingWebhook - Function to process AI webhooks
   * @param {number} options.pollInterval - Polling interval in ms (default: 5000)
   * @param {number} options.maxConcurrent - Max concurrent jobs (default: 3)
   */
  constructor(options = {}) {
    this.processAiProcessingWebhook = options.processAiProcessingWebhook;
    this.pollInterval = options.pollInterval || parseInt(process.env.WEBHOOK_WORKER_POLL_INTERVAL) || 5000;
    this.maxConcurrent = options.maxConcurrent || parseInt(process.env.WEBHOOK_WORKER_MAX_CONCURRENT) || 3;

    this.isRunning = false;
    this.activeJobs = 0;
    this.processedCount = 0;
    this.errorCount = 0;
    this.startTime = null;
  }

  /**
   * Start the worker.
   */
  start() {
    if (this.isRunning) {
      console.log('[WebhookWorker] Already running');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();
    console.log('[WebhookWorker] 🚀 Starting webhook worker');
    console.log(`[WebhookWorker] Poll interval: ${this.pollInterval}ms, Max concurrent: ${this.maxConcurrent}`);

    this.processLoop();
  }

  /**
   * Stop the worker gracefully.
   */
  async stop() {
    console.log('[WebhookWorker] 🛑 Stopping webhook worker...');
    this.isRunning = false;

    // Wait for active jobs to complete (max 30 seconds)
    const maxWait = 30000;
    const startWait = Date.now();

    while (this.activeJobs > 0 && Date.now() - startWait < maxWait) {
      console.log(`[WebhookWorker] Waiting for ${this.activeJobs} active jobs to complete...`);
      await this._sleep(1000);
    }

    if (this.activeJobs > 0) {
      console.log(`[WebhookWorker] ⚠️ Forced stop with ${this.activeJobs} jobs still active`);
    } else {
      console.log('[WebhookWorker] ✅ Stopped gracefully');
    }
  }

  /**
   * Main processing loop.
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        // Check if we can take more jobs
        if (this.activeJobs < this.maxConcurrent) {
          const job = await webhookQueueService.processNext();

          if (job) {
            // Process job asynchronously (don't await)
            this.activeJobs++;
            this.processJob(job)
              .catch(err => {
                console.error(`[WebhookWorker] Unhandled error processing job ${job.job_id}:`, err);
              })
              .finally(() => {
                this.activeJobs--;
              });
          }
        }
      } catch (error) {
        console.error('[WebhookWorker] Error in process loop:', error);
        this.errorCount++;
      }

      // Wait before next poll
      await this._sleep(this.pollInterval);
    }
  }

  /**
   * Process a single job.
   *
   * @param {object} job - WebhookJob document
   */
  async processJob(job) {
    const startTime = Date.now();
    console.log(`[WebhookWorker] 🔄 Processing job ${job.job_id} (type: ${job.webhook_type})`);

    try {
      // Route to appropriate processor based on webhook type
      switch (job.webhook_type) {
        case 'ai-processing':
          await this.processAiProcessingWebhook(job.payload);
          break;

        case 'deduplication':
          // Future: add deduplication webhook processor
          console.log(`[WebhookWorker] Deduplication webhook processing not yet implemented`);
          break;

        case 'portal-webhook':
          // Future: add portal webhook processor
          console.log(`[WebhookWorker] Portal webhook processing not yet implemented`);
          break;

        default:
          throw new Error(`Unknown webhook type: ${job.webhook_type}`);
      }

      // Mark as completed
      await webhookQueueService.markCompleted(job.job_id);
      this.processedCount++;

      const processingTime = Date.now() - startTime;
      console.log(`[WebhookWorker] ✅ Job ${job.job_id} completed in ${processingTime}ms`);

    } catch (error) {
      console.error(`[WebhookWorker] ❌ Job ${job.job_id} failed:`, error.message);
      await webhookQueueService.markFailed(job.job_id, error, true);
      this.errorCount++;
    }
  }

  /**
   * Get worker statistics.
   *
   * @returns {object}
   */
  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      uptimeMs: uptime,
      startTime: this.startTime
    };
  }

  /**
   * Sleep helper.
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebhookWorker;
