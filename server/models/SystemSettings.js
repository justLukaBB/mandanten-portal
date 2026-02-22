const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updated_at: { type: Date, default: Date.now }
});

systemSettingsSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

/**
 * Get a setting value by key, with optional default
 */
systemSettingsSchema.statics.getValue = async function (key, defaultValue = null) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

/**
 * Set a setting value by key (upsert)
 */
systemSettingsSchema.statics.setValue = async function (key, value) {
  return this.findOneAndUpdate(
    { key },
    { key, value, updated_at: new Date() },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
