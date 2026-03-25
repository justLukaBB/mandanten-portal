const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

const reviewSettingsSchema = new mongoose.Schema({
  kanzleiId: { type: String, index: true }, // null = global defaults
  confidence_threshold: { type: Number, default: 80 },
  auto_assignment_enabled: { type: Boolean, default: false },
  demo_mode_enabled: { type: Boolean, default: false },
  test_mode_enabled: { type: Boolean, default: false },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String },
}, { collection: 'review_settings' });

reviewSettingsSchema.plugin(tenantPlugin);

module.exports = mongoose.model('ReviewSettings', reviewSettingsSchema);
