const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminUserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  first_name: String,
  last_name: String,
  kanzleiId: { type: String, required: true, index: true },
  role: {
    type: String,
    enum: ['admin', 'superadmin'],
    default: 'admin'
  },
  is_active: { type: Boolean, default: true },
  last_login: Date,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

adminUserSchema.pre('save', async function (next) {
  this.updated_at = new Date();
  if (this.isModified('password_hash') && !this.password_hash.startsWith('$2')) {
    this.password_hash = await bcrypt.hash(this.password_hash, 12);
  }
  next();
});

adminUserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

// superadmin can see all kanzleien (no tenant filter)
adminUserSchema.methods.isSuperAdmin = function () {
  return this.role === 'superadmin';
};

module.exports = mongoose.model('AdminUser', adminUserSchema);
