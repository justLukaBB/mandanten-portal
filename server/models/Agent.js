const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  
  // Agent permissions and role
  role: {
    type: String,
    enum: ['agent', 'senior_agent', 'supervisor'],
    default: 'agent'
  },
  permissions: {
    can_review_documents: { type: Boolean, default: true },
    can_modify_creditors: { type: Boolean, default: true },
    can_complete_sessions: { type: Boolean, default: true },
    can_skip_documents: { type: Boolean, default: true }
  },
  
  // Agent activity tracking
  is_active: { type: Boolean, default: true },
  last_login: Date,
  last_activity: Date,
  
  // Review statistics
  stats: {
    total_sessions: { type: Number, default: 0 },
    completed_sessions: { type: Number, default: 0 },
    documents_reviewed: { type: Number, default: 0 },
    creditors_corrected: { type: Number, default: 0 },
    average_session_time: { type: Number, default: 0 } // in minutes
  },
  
  // Zendesk integration
  zendesk_user_id: String,
  zendesk_agent_id: String,
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Update the updated_at field before saving
agentSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Method to compare password
agentSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password_hash);
};

// Method to hash password before saving
agentSchema.pre('save', async function(next) {
  if (!this.isModified('password_hash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
agentSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password_hash);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Indexes for performance
agentSchema.index({ username: 1 });
agentSchema.index({ email: 1 });
agentSchema.index({ is_active: 1 });
agentSchema.index({ last_activity: -1 });

module.exports = mongoose.model('Agent', agentSchema);