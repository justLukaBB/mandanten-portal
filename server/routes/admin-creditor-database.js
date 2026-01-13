const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateAdmin } = require('../middleware/auth');
const CreditorDatabase = require('../models/CreditorDatabase');
const { normalizeName, extractKeywords } = require('../utils/creditorLookup');

const upload = multer({ storage: multer.memoryStorage() });

// GET / - list with search & pagination
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25 } = req.query;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

    const q = {};
    if (search) {
      const n = normalizeName(search);
      q.$or = [
        { creditor_name: new RegExp(search, 'i') },
        { name_normalized: new RegExp(n, 'i') },
        { name_keywords: { $in: extractKeywords(search) } },
      ];
    }

    const [items, total] = await Promise.all([
      CreditorDatabase.find(q).sort({ creditor_name: 1 }).skip((p - 1) * l).limit(l),
      CreditorDatabase.countDocuments(q),
    ]);

    res.json({
      success: true,
      items,
      pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
    });
  } catch (err) {
    console.error('List creditors error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch creditors' });
  }
});

// POST / - create
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      creditor_name,
      address,
      email,
      phone,
      alternative_names = [],
      category,
      notes,
      is_active = true,
    } = req.body || {};

    if (!creditor_name || !address || !email) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const name_normalized = normalizeName(creditor_name);
    const name_keywords = extractKeywords(creditor_name);

    const doc = await CreditorDatabase.create({
      creditor_name,
      address,
      email,
      phone,
      alternative_names,
      category,
      notes,
      is_active,
      name_normalized,
      name_keywords,
      imported_by: req.adminId || undefined,
    });

    res.json({ success: true, item: doc });
  } catch (err) {
    console.error('Create creditor error', err);
    res.status(500).json({ success: false, error: 'Failed to create creditor' });
  }
});

// PUT /:id - update
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.creditor_name) {
      updates.name_normalized = normalizeName(updates.creditor_name);
      updates.name_keywords = extractKeywords(updates.creditor_name);
    }
    const doc = await CreditorDatabase.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, item: doc });
  } catch (err) {
    console.error('Update creditor error', err);
    res.status(500).json({ success: false, error: 'Failed to update creditor' });
  }
});

// DELETE /:id
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const doc = await CreditorDatabase.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete creditor error', err);
    res.status(500).json({ success: false, error: 'Failed to delete creditor' });
  }
});

// POST /import - FAST IMPORT
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const XLSX = require("xlsx");
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const batchId = "import_" + Date.now();

    const importedDocs = [];
    const errors = [];

    for (let i = 0; i < json.length; i++) {
      const row = json[i];
      const rowNumber = i + 2; // Excel data starts at row 2

      // Extract name from multiple fields
      const creditor_name =
        row.NameFirmaGl?.trim() ||
        row.BriefanredeGl?.trim() ||
        row.VornameGl?.trim() ||
        "";

      // Build address
      const addressParts = [
        row.AdresseGl,
        row.PlzGl,
        row.OrtGl
      ].filter(Boolean);
      const address = addressParts.join(", ").trim();

      const email = String(row.EmailGl || "").trim();

      // Validate required fields
      if (!creditor_name || !address || !email) {
        errors.push({
          row: rowNumber,
          error: "Missing required fields (creditor_name, address, email)"
        });
        continue;
      }

      // Prepare document
      const doc = {
        creditor_name,
        address,
        email,
        phone: row.TelGl || null,
        notes: row.gesVertreterGl || row.AnspechpartnerGl || "",
        alternative_names: [],
        category: null,
        imported_by: req.adminId || null,
        import_batch_id: batchId,
        name_normalized: creditor_name.toLowerCase().trim(),
        name_keywords: creditor_name.toLowerCase().split(" ")
      };

      importedDocs.push(doc);
    }

    // Bulk insert (super fast)
    if (importedDocs.length > 0) {
      await CreditorDatabase.insertMany(importedDocs, { ordered: false });
    }

    res.json({
      success: true,
      imported_count: importedDocs.length,
      error_count: errors.length,
      errors,
      batch_id: batchId
    });

  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// GET /export - CSV export
router.get('/export', authenticateAdmin, async (req, res) => {
  try {
    const items = await CreditorDatabase.find({}).sort({ creditor_name: 1 });
    const headers = [
      'Creditor Name','Address','Email','Phone','Alternative Names','Category','Notes'
    ];
    const lines = [headers.join(',')];
    for (const c of items) {
      const alt = (c.alternative_names || []).join('; ');
      const esc = (s) => (s ? '"' + String(s).replace(/"/g, '""') + '"' : '');
      lines.push([
        esc(c.creditor_name), esc(c.address), esc(c.email), esc(c.phone || ''), esc(alt), esc(c.category || ''), esc(c.notes || '')
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="creditor_database.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('Export creditors error', err);
    res.status(500).json({ success: false, error: 'Failed to export' });
  }
});

module.exports = router;
