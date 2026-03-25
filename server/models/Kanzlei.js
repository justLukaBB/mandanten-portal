const mongoose = require('mongoose');

const kanzleiSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true }, // URL-safe identifier
  email: String,
  phone: String,
  address: String,
  is_active: { type: Boolean, default: true },
  branding: {
    firmName: String,
    lawyerName: String,
    logoUrl: String,
    email: String,
    phone: String,
    fax: String,
    address: {
      street: String,
      zip: String,
      city: String
    },
    website: String,
    impressumUrl: String,
    datenschutzUrl: String,
    copyright: String,
    brandColor: String
  },
  integrations: {
    zendesk: {
      enabled: { type: Boolean, default: false },
      subdomain: String,
      email: String,
      token: String
    }
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

kanzleiSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Kanzlei', kanzleiSchema);
