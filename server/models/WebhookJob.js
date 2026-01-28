/**
 * WebhookJob Model
 *
 * MongoDB model for persistent webhook job queue.
 * Implements Enterprise-Grade patterns from Stripe, GitHub, etc.
 */
const mongoose = require('mongoose');

const webhookJobSchema = new mongoose.Schema({
  // Unique job identifier (idempotency key)
  job_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Type of webhook (e.g., 'ai-processing', 'deduplication')
  webhook_type: {
    type: String,
    required: true,
    enum: ['ai-processing', 'deduplication', 'portal-webhook'],
    index: true
  },

  // Full webhook payload
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Job status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'retrying'],
    default: 'pending',
    index: true
  },

  // Retry handling
  retry_count: {
    type: Number,
    default: 0
  },
  max_retries: {
    type: Number,
    default: 3
  },
  next_retry_at: {
    type: Date,
    index: true
  },

  // Error tracking
  error_details: {
    message: String,
    stack: String,
    last_error_at: Date
  },

  // Timestamps
  processing_started_at: Date,
  completed_at: Date,
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We manage our own timestamps
});

// Compound index for efficient job polling
webhookJobSchema.index({ status: 1, created_at: 1 });
webhookJobSchema.index({ status: 1, next_retry_at: 1 });

// TTL index to auto-delete completed jobs after 7 days
webhookJobSchema.index(
  { completed_at: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: 'completed' } }
);

// Static method to get queue stats
webhookJobSchema.statics.getQueueStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    total: 0
  };

  stats.forEach(s => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  return result;
};

const WebhookJob = mongoose.model('WebhookJob', webhookJobSchema);

module.exports = WebhookJob;
