const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  filename: { type: String, required: false }, // Made optional for legacy data
  type: { type: String, required: false }, // Made optional for legacy data
  size: { type: Number, required: false }, // Made optional for legacy data
  uploadedAt: { type: Date, default: Date.now },
  processing_status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'error'],
    default: 'pending'
  },
  document_status: {
    type: String,
    enum: ['pending', 'creditor_confirmed', 'non_creditor', 'non_creditor_confirmed', 'not_a_creditor', 'duplicate', 'unclear', 'needs_review'],
    default: 'pending'
  },
  status_reason: String,
  is_duplicate: { type: Boolean, default: false },
  is_creditor_document: { type: Boolean },
  confidence: { type: Number, min: 0, max: 1 },
  classification_success: { type: Boolean },
  manual_review_required: { type: Boolean, default: false },
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
    workflow_status: String,
    is_creditor_document: Boolean,
    manual_review_required: Boolean,
    document_id: String,
    original_name: String,
    processing_status: String,
    timestamp: String,
    processing_method: String,
    token_usage: {
      input_tokens: Number,
      output_tokens: Number,
      total_tokens: Number
    }
  },
  validation: {
    is_valid: Boolean,
    warnings: [String],
    confidence: Number,
    claude_confidence: Number,
    data_completeness: Number,
    requires_manual_review: Boolean
  },
  summary: String,
  processing_error: String,
  processing_time_ms: Number,
  duplicate_reason: String,
  // Agent review fields
  manually_reviewed: { type: Boolean, default: false },
  reviewed_at: Date,
  reviewed_by: String
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
  document_id: String, // Link to document
  ai_confidence: Number,
  confidence: Number, // General confidence field
  status: {
    type: String,
    enum: ['confirmed', 'rejected', 'pending', 'responded'],
    default: 'confirmed'
  },
  created_at: { type: Date, default: Date.now },
  confirmed_at: Date,
  // Agent review fields
  manually_reviewed: { type: Boolean, default: false },
  reviewed_at: Date,
  reviewed_by: String,
  review_action: String, // 'confirmed', 'corrected', 'skipped'
  original_ai_data: mongoose.Schema.Types.Mixed,
  correction_notes: String,
  created_via: String, // 'ai_extraction', 'manual_review', etc.
  
  // Creditor response fields
  current_debt_amount: Number, // Amount from creditor response
  creditor_response_amount: Number, // Alternative field name
  creditor_response_text: String,
  contact_status: {
    type: String,
    enum: ['responded', 'no_response', 'email_failed'],
    default: 'no_response'
  },
  amount_source: {
    type: String,
    enum: ['creditor_response', 'original_document', 'default_fallback'],
    default: 'original_document'
  },
  response_received_at: Date,
  
  // Settlement plan response fields
  settlement_response_status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'counter_offer', 'no_response'],
    default: 'pending'
  },
  settlement_response_received_at: Date,
  settlement_response_text: String,
  settlement_side_conversation_id: String,
  settlement_plan_sent_at: Date,
  settlement_acceptance_confidence: Number, // AI confidence in acceptance/rejection detection
  settlement_response_metadata: mongoose.Schema.Types.Mixed,
  
  // Nullplan response fields
  nullplan_response_status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'no_response'],
    default: 'pending'
  },
  nullplan_response_received_at: Date,
  nullplan_response_text: String,
  nullplan_side_conversation_id: String,
  nullplan_sent_at: Date,
  nullplan_acceptance_confidence: Number, // AI confidence in acceptance/rejection detection
  nullplan_response_metadata: mongoose.Schema.Types.Mixed
}, { _id: false });

// Status History Schema for tracking all status changes
const statusHistorySchema = new mongoose.Schema({
  id: { type: String, required: true },
  status: { type: String, required: true },
  changed_by: {
    type: String,
    enum: ['system', 'agent', 'client', 'admin'],
    required: true
  },
  zendesk_ticket_id: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  created_at: { type: Date, default: Date.now }
}, { _id: false });

const clientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  aktenzeichen: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  address: String,
  geburtstag: String,
  
  // Portal access
  portal_link_sent: { type: Boolean, default: false },
  portal_link_sent_at: Date,
  portal_token: String,
  portal_link: String,
  session_token: String,
  last_login: Date,
  
  // Welcome email
  welcome_email_sent: { type: Boolean, default: false },
  welcome_email_sent_at: Date,
  welcome_side_conversation_id: String,
  
  // Zendesk integration
  zendesk_user_id: String,
  zendesk_ticket_id: String,
  zendesk_tickets: [{
    ticket_id: String,
    ticket_type: {
      type: String,
      enum: ['portal_access', 'glaeubieger_process', 'creditor_contact', 'payment_review', 'main_ticket', 'creditor_review']
    },
    ticket_scenario: String, // For tracking specific scenarios like document_request, manual_review, etc.
    status: String,
    created_at: { type: Date, default: Date.now },
    last_comment_at: Date,
    processing_complete_scenario: String
  }],
  
  // Workflow - updated for Zendesk-centric approach
  phase: { type: Number, default: 1 },
  current_status: {
    type: String,
    enum: [
      'created',
      'portal_access_sent',
      'documents_uploaded',
      'documents_processing',
      'waiting_for_payment',
      'payment_confirmed',
      'creditor_review',
      'manual_review_complete',
      'creditor_contact_initiated',
      'creditor_contact_failed',
      'awaiting_client_confirmation',
      'additional_documents_review',
      'creditor_contact_active',
      'settlement_documents_generated',
      'settlement_plan_sent_to_creditors',
      'completed'
    ],
    default: 'created'
  },
  // Legacy field for backward compatibility
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
  
  // Status tracking
  status_history: [statusHistorySchema],
  
  // Document processing
  documents: [documentSchema],
  final_creditor_list: [creditorSchema],
  
  // Payment and Review Tracking
  payment_ticket_type: {
    type: String,
    enum: ['document_request', 'processing_wait', 'manual_review', 'auto_approved', 'no_creditors_found', 'creditor_contact_initiated', 'document_reminder_side_conversation']
  },
  payment_processed_at: Date,
  document_request_sent_at: Date,
  document_request_email_sent_at: Date,
  all_documents_processed_at: Date,
  
  // Document reminder tracking
  document_reminder_count: { type: Number, default: 0 },
  last_document_reminder_at: Date,
  documents_uploaded_after_payment_at: Date,
  
  // Login reminder tracking (7-day cycle)
  login_reminder_sent: { type: Boolean, default: false },
  login_reminder_sent_at: Date,
  login_document_reminder_sent: { type: Boolean, default: false },
  login_document_reminder_sent_at: Date,
  
  // Delayed processing webhook tracking
  processing_complete_webhook_scheduled: { type: Boolean, default: false },
  processing_complete_webhook_scheduled_at: Date,
  processing_complete_webhook_triggered: { type: Boolean, default: false },
  processing_complete_webhook_triggered_at: Date,
  
  // 7-day delay tracking for payment + document upload
  both_conditions_met_at: Date, // When both payment and documents are uploaded
  seven_day_review_scheduled: { type: Boolean, default: false },
  seven_day_review_scheduled_at: Date,
  seven_day_review_triggered: { type: Boolean, default: false },
  seven_day_review_triggered_at: Date,
  
  // Document reminder via side conversation
  document_reminder_sent_via_side_conversation: { type: Boolean, default: false },
  document_reminder_side_conversation_at: Date,
  document_reminder_side_conversation_id: String,
  
  // Admin workflow
  first_payment_received: { type: Boolean, default: false },
  admin_approved: { type: Boolean, default: false },
  admin_approved_at: Date,
  admin_approved_by: String,
  client_confirmed_creditors: { type: Boolean, default: false },
  client_confirmed_at: Date,
  processing_notes: String,

  // Iterative document upload tracking (additional documents after initial review)
  additional_documents_uploaded_after_review: { type: Boolean, default: false },
  additional_documents_uploaded_at: Date,
  review_iteration_count: { type: Number, default: 0 }, // Track how many review cycles have been completed
  
  // Creditor contact
  creditor_contact_started: { type: Boolean, default: false },
  creditor_contact_started_at: Date,
  
  // Settlement plan tracking
  settlement_plan_sent_at: Date,

  // Financial data reminder email tracking (sent after 30-day simulation)
  financial_data_reminder_sent_at: Date,
  financial_data_reminder_side_conversation_id: String,

  // Financial data for Schuldenbereinigungsplan (client input after 30-day creditor response period)
  financial_data: {
    monthly_net_income: Number, // Monthly net income in euros
    number_of_children: { type: Number, default: 0 }, // Number of dependent children
    marital_status: {
      type: String,
      enum: ['ledig', 'verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend']
    },
    garnishable_amount: Number, // Auto-calculated from Pfändungstabelle 2024
    recommended_plan_type: {
      type: String,
      enum: ['quotenplan', 'nullplan']
    }, // System recommendation based on garnishable amount
    client_form_filled: { type: Boolean, default: false },
    form_filled_at: Date,
    calculation_completed_at: Date
  },
  
  // Debt settlement plan (Schuldenbereinigungsplan)
  debt_settlement_plan: {
    created_at: Date,
    total_debt: Number,
    pfaendbar_amount: Number,
    creditors: [{
      id: String,
      name: String,
      email: String,
      amount: Number,
      percentage: Number,
      monthly_quota: Number,
      amount_source: {
        type: String,
        enum: ['creditor_response', 'original_document', 'default_fallback']
      },
      contact_status: {
        type: String,
        enum: ['responded', 'no_response', 'email_failed']
      }
    }],
    zendesk_ticket_id: String, // New ticket created for the plan
    plan_status: {
      type: String,
      enum: ['generated', 'sent_to_client', 'approved', 'rejected'],
      default: 'generated'
    },
    generated_by: String, // Agent or 'system' for automated
    plan_notes: String
  },
  
  // Creditor calculation table for Schuldenbereinigungsplan (new approach)
  creditor_calculation_table: [{
    id: String,
    name: String,
    email: String,
    address: String,
    reference_number: String,
    original_amount: Number, // AI-extracted amount
    final_amount: Number, // Final calculated amount using 3-tier logic
    amount_source: {
      type: String,
      enum: ['creditor_response', 'original_document', 'default_fallback']
    },
    contact_status: {
      type: String,
      enum: ['responded', 'no_response', 'email_failed']
    },
    is_representative: { type: Boolean, default: false },
    actual_creditor: String,
    ai_confidence: Number,
    created_at: Date
  }],
  creditor_calculation_created_at: Date,
  creditor_calculation_total_debt: Number,
  
  // New calculated settlement plan (from German garnishment calculator)
  calculated_settlement_plan: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Update the updated_at field before saving
clientSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Indexes for faster queries
clientSchema.index({ email: 1 });
clientSchema.index({ aktenzeichen: 1 });
clientSchema.index({ workflow_status: 1 });
clientSchema.index({ session_token: 1 });
clientSchema.index({ created_at: -1 }); // For recent clients
clientSchema.index({ updated_at: -1 }); // For recently updated
clientSchema.index({ 'documents.processing_status': 1 }); // For document filtering
clientSchema.index({ zendesk_ticket_id: 1 }); // For Zendesk integration

// Compound indexes for common queries
clientSchema.index({ workflow_status: 1, created_at: -1 }); // Admin dashboard
clientSchema.index({ email: 1, aktenzeichen: 1 }); // Login verification

module.exports = mongoose.model('Client', clientSchema);