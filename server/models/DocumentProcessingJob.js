/**
 * DocumentProcessingJob Model
 *
 * MongoDB model for persistent document processing queue.
 * Ensures documents are processed sequentially with rate limiting.
 */
const mongoose = require('mongoose');

const documentProcessingJobSchema = new mongoose.Schema({
  // Unique job identifier
  job_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Client reference
  client_id: {
    type: String,
    required: true,
    index: true
  },

  // Document reference
  document_id: {
    type: String,
    required: true,
    index: true
  },

  // File details for FastAPI
  file_data: {
    filename: { type: String, required: true },
    gcs_path: { type: String },
    local_path: { type: String },
    mime_type: { type: String, default: 'image/png' },
    size: { type: Number, default: 0 }
  },

  // Additional data
  client_name: { type: String },
  webhook_url: { type: String, required: true },
  api_key: { type: String },

  // Job status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'retrying'],
    default: 'pending',
    index: true
  },

  // Priority (1 = highest, 10 = lowest)
  priority: {
    type: Number,
    default: 5,
    index: true
  },

  // FastAPI job tracking
  fastapi_job_id: { type: String },

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
    error_type: String,
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
  timestamps: false
});

// Compound indexes for efficient job polling
documentProcessingJobSchema.index({ status: 1, priority: 1, created_at: 1 });
documentProcessingJobSchema.index({ status: 1, next_retry_at: 1 });
documentProcessingJobSchema.index({ client_id: 1, status: 1 });

// TTL index to auto-delete completed jobs after 24 hours
documentProcessingJobSchema.index(
  { completed_at: 1 },
  { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { status: 'completed' } }
);

// Static method to get queue stats
documentProcessingJobSchema.statics.getQueueStats = async function() {
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

  // Get additional metrics
  const processingJobs = await this.find({ status: 'processing' }).select('created_at processing_started_at').lean();

  result.current_processing = processingJobs.length;
  result.oldest_pending = null;

  const oldestPending = await this.findOne({ status: 'pending' }).sort({ created_at: 1 }).select('created_at').lean();
  if (oldestPending) {
    result.oldest_pending = oldestPending.created_at;
    result.oldest_pending_age_ms = Date.now() - new Date(oldestPending.created_at).getTime();
  }

  return result;
};

// Static method to get jobs by client
documentProcessingJobSchema.statics.getJobsByClient = async function(clientId, limit = 50) {
  return this.find({ client_id: clientId })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
};

const DocumentProcessingJob = mongoose.model('DocumentProcessingJob', documentProcessingJobSchema);

module.exports = DocumentProcessingJob;
