const mongoose = require('mongoose');

const reviewSettingsSchema = new mongoose.Schema({
  confidence_threshold: { type: Number, default: 80 },
  auto_assignment_enabled: { type: Boolean, default: false },
  demo_mode_enabled: { type: Boolean, default: false },
  test_mode_enabled: { type: Boolean, default: false },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String },
}, { collection: 'review_settings' });

module.exports = mongoose.model('ReviewSettings', reviewSettingsSchema);
