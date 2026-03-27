const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  aktenzeichen: { type: String, required: true, uppercase: true, index: true },
  code: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false
});

// TTL index: MongoDB automatically deletes documents 5 minutes after createdAt
verificationCodeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });

// Only one active code per aktenzeichen
verificationCodeSchema.index({ aktenzeichen: 1 }, { unique: true });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
