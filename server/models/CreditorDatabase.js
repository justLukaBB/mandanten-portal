const mongoose = require('mongoose');

const CreditorDatabaseSchema = new mongoose.Schema(
  {
    creditor_name: { type: String, required: true, maxlength: 500 },
    address: { type: String, required: true },
    email: { type: String, required: true, maxlength: 255 },

    phone: { type: String, maxlength: 50 },
    alternative_names: { type: [String], default: [] },
    category: { type: String, maxlength: 100 },
    notes: { type: String },

    imported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: false },
    import_batch_id: { type: String },

    name_normalized: { type: String, index: true },
    name_keywords: { type: [String], index: true },

    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

CreditorDatabaseSchema.index({ creditor_name: 1 });
CreditorDatabaseSchema.index({ name_normalized: 1 });
CreditorDatabaseSchema.index({ name_keywords: 1 });

module.exports = mongoose.model('CreditorDatabase', CreditorDatabaseSchema);
