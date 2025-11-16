const mongoose = require('mongoose');

const impersonationTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // User being impersonated
  client_id: {
    type: String,
    required: true,
    index: true
  },

  client_email: {
    type: String,
    required: true
  },

  // Admin performing impersonation
  admin_id: {
    type: String,
    required: true,
    index: true
  },

  admin_email: {
    type: String,
    required: true
  },

  // Token lifecycle
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },

  expires_at: {
    type: Date,
    required: true,
    index: true
  },

  // Token status
  is_used: {
    type: Boolean,
    default: false
  },

  used_at: {
    type: Date,
    default: null
  },

  is_revoked: {
    type: Boolean,
    default: false
  },

  revoked_at: {
    type: Date,
    default: null
  },

  // Audit trail
  reason: {
    type: String,
    default: 'Admin support'
  },

  ip_address: {
    type: String,
    default: null
  },

  user_agent: {
    type: String,
    default: null
  },

  // Session tracking
  session_started_at: {
    type: Date,
    default: null
  },

  session_ended_at: {
    type: Date,
    default: null
  },

  session_duration_seconds: {
    type: Number,
    default: null
  }
});

// Index for cleanup queries (find expired tokens)
impersonationTokenSchema.index({ expires_at: 1, is_used: 1 });
impersonationTokenSchema.index({ created_at: -1 });

// Method to check if token is valid
impersonationTokenSchema.methods.isValid = function() {
  const now = new Date();

  // Check if token is expired
  if (this.expires_at < now) {
    return false;
  }

  // Check if token has been used (single-use)
  if (this.is_used) {
    return false;
  }

  // Check if token has been revoked
  if (this.is_revoked) {
    return false;
  }

  return true;
};

// Method to mark token as used
impersonationTokenSchema.methods.markAsUsed = async function() {
  this.is_used = true;
  this.used_at = new Date();
  this.session_started_at = new Date();
  await this.save();
};

// Method to end session
impersonationTokenSchema.methods.endSession = async function() {
  this.session_ended_at = new Date();
  if (this.session_started_at) {
    this.session_duration_seconds = Math.floor(
      (this.session_ended_at - this.session_started_at) / 1000
    );
  }
  await this.save();
};

// Static method to clean up expired tokens
impersonationTokenSchema.statics.cleanupExpiredTokens = async function() {
  const now = new Date();
  const result = await this.deleteMany({
    expires_at: { $lt: now },
    is_used: true
  });
  return result.deletedCount;
};

// Static method to get impersonation history for a client
impersonationTokenSchema.statics.getClientHistory = async function(clientId, limit = 10) {
  return this.find({ client_id: clientId })
    .sort({ created_at: -1 })
    .limit(limit)
    .select('-token'); // Don't return the actual token
};

// Static method to get impersonation history for an admin
impersonationTokenSchema.statics.getAdminHistory = async function(adminId, limit = 10) {
  return this.find({ admin_id: adminId })
    .sort({ created_at: -1 })
    .limit(limit)
    .select('-token'); // Don't return the actual token
};

const ImpersonationToken = mongoose.model('ImpersonationToken', impersonationTokenSchema);

module.exports = ImpersonationToken;
