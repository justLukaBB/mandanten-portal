const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  filename: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  processing_status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'error'],
    default: 'pending'
  },
  document_status: {
    type: String,
    enum: ['pending', 'creditor_confirmed', 'non_creditor', 'duplicate', 'unclear'],
    default: 'pending'
  },
  status_reason: String,
  is_duplicate: { type: Boolean, default: false },
  confidence: { type: Number, min: 0, max: 1 },
  extracted_data: {
    creditor_data: {
      sender_name: String,
      sender_email: String,
      sender_address: String,
      reference_number: String,
      claim_amount: Number,
      is_representative: { type: Boolean, default: false },
      actual_creditor: String
    },
    confidence: Number,
    reasoning: String,
    workflow_status: String
  }
}, { _id: false });

const creditorSchema = new mongoose.Schema({
  id: { type: String, required: true },
  sender_name: String,
  sender_address: String,
  sender_email: String,
  reference_number: String,
  claim_amount: Number,
  is_representative: { type: Boolean, default: false },
  actual_creditor: String,
  source_document: String,
  source_document_id: String,
  ai_confidence: Number,
  status: {
    type: String,
    enum: ['confirmed', 'rejected', 'pending'],
    default: 'confirmed'
  },
  created_at: { type: Date, default: Date.now },
  confirmed_at: Date
}, { _id: false });

const clientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  aktenzeichen: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  address: String,
  
  // Portal access
  portal_link_sent: { type: Boolean, default: false },
  portal_link_sent_at: Date,
  portal_token: String,
  portal_link: String,
  session_token: String,
  last_login: Date,
  
  // Zendesk integration
  zendesk_user_id: String,
  zendesk_ticket_id: String,
  
  // Workflow
  phase: { type: Number, default: 1 },
  workflow_status: {
    type: String,
    enum: [
      'portal_access_sent',
      'documents_processing', 
      'admin_review', 
      'client_confirmation', 
      'completed',
      'creditor_contact_active'
    ],
    default: 'portal_access_sent'
  },
  
  // Document processing
  documents: [documentSchema],
  final_creditor_list: [creditorSchema],
  
  // Admin workflow
  first_payment_received: { type: Boolean, default: false },
  admin_approved: { type: Boolean, default: false },
  admin_approved_at: Date,
  admin_approved_by: String,
  client_confirmed_creditors: { type: Boolean, default: false },
  client_confirmed_at: Date,
  processing_notes: String,
  
  // Creditor contact
  creditor_contact_started: { type: Boolean, default: false },
  creditor_contact_started_at: Date,
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Update the updated_at field before saving
clientSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Index for faster queries
clientSchema.index({ email: 1 });
clientSchema.index({ aktenzeichen: 1 });
clientSchema.index({ workflow_status: 1 });
clientSchema.index({ session_token: 1 });

module.exports = mongoose.model('Client', clientSchema);