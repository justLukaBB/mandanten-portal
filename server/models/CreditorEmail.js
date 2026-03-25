const mongoose = require('mongoose');

const creditorEmailSchema = new mongoose.Schema({
  // Tenant isolation
  kanzleiId: { type: String, index: true },

  // Matcher identification
  email_id: { type: String, index: true },

  // Letter type
  letter_type: {
    type: String,
    enum: ['first', 'second'],
    required: true,
    index: true,
  },

  // Creditor info
  creditor_name: { type: String, required: true },
  creditor_email: { type: String },

  // Client matching
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  client_aktenzeichen: { type: String, index: true },
  client_name: { type: String },

  // Match result
  match_status: {
    type: String,
    enum: ['auto_matched', 'needs_review', 'no_match'],
    default: 'no_match',
    index: true,
  },
  match_confidence: { type: Number, min: 0, max: 100 },

  // 1. Schreiben fields
  new_debt_amount: { type: Number },
  amount_source: { type: String },
  extraction_confidence: { type: Number, min: 0, max: 100 },
  confidence_route: { type: String },
  reference_numbers: [{ type: String }],

  // 2. Schreiben fields
  settlement_status: {
    type: String,
    enum: ['accepted', 'declined', 'counter_offer', 'inquiry', 'no_clear_response'],
  },
  settlement_response_text: { type: String },
  settlement_counter_offer_amount: { type: Number },
  settlement_conditions: { type: String },

  // Email content (from matcher)
  email_subject: { type: String },
  email_body_preview: { type: String },
  email_body_full: { type: String },

  // Resend email ID for on-demand attachment download
  resend_email_id: { type: String },

  // Attachments from creditor email (URL, base64 content, or Resend attachment ID)
  attachments: [{
    id: { type: String },        // Resend attachment ID (for on-demand download)
    filename: { type: String },
    content_type: { type: String },
    size: { type: Number },
    url: { type: String },
    content: { type: String },
  }],

  // Review state
  review_status: {
    type: String,
    enum: ['pending', 'reviewed', 'dismissed'],
    default: 'pending',
    index: true,
  },
  review_notes: { type: String },
  reviewed_by: { type: String },
  reviewed_at: { type: Date },

  // Intent classification from matcher
  intent: { type: String, index: true },

  // Metadata
  needs_review: { type: Boolean, default: false },
  matcher_metadata: { type: mongoose.Schema.Types.Mixed },
  processed_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound indexes for common queries
creditorEmailSchema.index({ review_status: 1, created_at: -1 });
creditorEmailSchema.index({ letter_type: 1, match_status: 1 });
creditorEmailSchema.index({ creditor_name: 'text', creditor_email: 'text', client_name: 'text', client_aktenzeichen: 'text' });

module.exports = mongoose.model('CreditorEmail', creditorEmailSchema);
