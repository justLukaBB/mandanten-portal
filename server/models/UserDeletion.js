const mongoose = require('mongoose');

/**
 * UserDeletion Model
 *
 * Permanent audit log of all user deletions.
 * This data is NEVER deleted - provides complete audit trail.
 */
const userDeletionSchema = new mongoose.Schema({
  // Deleted user information
  deleted_user_id: {
    type: String,
    required: true,
    index: true
  },

  deleted_user_email: {
    type: String,
    required: true
  },

  deleted_user_name: {
    type: String,
    required: true
  },

  deleted_user_aktenzeichen: {
    type: String,
    default: null
  },

  // Admin who performed deletion
  admin_id: {
    type: String,
    required: true,
    index: true
  },

  admin_email: {
    type: String,
    required: true
  },

  // Deletion metadata
  deletion_timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  ip_address: {
    type: String,
    default: null
  },

  user_agent: {
    type: String,
    default: null
  },

  // What was deleted
  deleted_data_summary: {
    documents_count: {
      type: Number,
      default: 0
    },
    creditors_count: {
      type: Number,
      default: 0
    },
    had_financial_data: {
      type: Boolean,
      default: false
    },
    workflow_status: {
      type: String,
      default: null
    },
    account_created_at: {
      type: Date,
      default: null
    }
  },

  // Reason for deletion (optional)
  deletion_reason: {
    type: String,
    default: 'Admin-initiated deletion'
  },

  // Deletion success/failure
  deletion_status: {
    type: String,
    enum: ['initiated', 'in_progress', 'completed', 'failed'],
    default: 'initiated'
  },

  deletion_errors: [{
    step: String,
    error_message: String,
    timestamp: Date
  }],

  // Time taken to delete
  deletion_duration_ms: {
    type: Number,
    default: null
  }
});

// Indexes for querying
userDeletionSchema.index({ deletion_timestamp: -1 });
userDeletionSchema.index({ admin_id: 1, deletion_timestamp: -1 });
userDeletionSchema.index({ deleted_user_email: 1 });

// Static method to log deletion
userDeletionSchema.statics.logDeletion = async function(deletionData) {
  const log = new this(deletionData);
  await log.save();
  return log;
};

// Static method to get deletion history for an admin
userDeletionSchema.statics.getAdminDeletionHistory = async function(adminId, limit = 20) {
  return this.find({ admin_id: adminId })
    .sort({ deletion_timestamp: -1 })
    .limit(limit);
};

// Static method to get all deletions
userDeletionSchema.statics.getAllDeletions = async function(page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [deletions, total] = await Promise.all([
    this.find()
      .sort({ deletion_timestamp: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments()
  ]);

  return {
    deletions,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
};

// Method to mark deletion as completed
userDeletionSchema.methods.markCompleted = async function(duration_ms) {
  this.deletion_status = 'completed';
  this.deletion_duration_ms = duration_ms;
  await this.save();
};

// Method to mark deletion as failed
userDeletionSchema.methods.markFailed = async function(error) {
  this.deletion_status = 'failed';
  this.deletion_errors.push({
    step: 'final',
    error_message: error.message || error.toString(),
    timestamp: new Date()
  });
  await this.save();
};

// Method to add error
userDeletionSchema.methods.addError = async function(step, error) {
  this.deletion_errors.push({
    step,
    error_message: error.message || error.toString(),
    timestamp: new Date()
  });
  await this.save();
};

const UserDeletion = mongoose.model('UserDeletion', userDeletionSchema);

module.exports = UserDeletion;
