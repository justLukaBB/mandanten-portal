const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

const activityLogSchema = new mongoose.Schema({
  kanzleiId: { type: String, required: true, index: true },
  clientReference: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'creditor_contact_initiated',
      'first_letter_sent',
      'creditor_response_received',
      'second_letter_sent',
      'document_reminder_sent',
      'login_reminder_sent',
      'status_changed',
      'manual_note'
    ]
  },
  details: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now, index: true },
  created_by: { type: String }
});

activityLogSchema.index({ kanzleiId: 1, clientReference: 1, created_at: -1 });
activityLogSchema.plugin(tenantPlugin);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
