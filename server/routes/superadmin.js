const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateAdmin } = require('../middleware/auth');
const Kanzlei = require('../models/Kanzlei');
const AdminUser = require('../models/AdminUser');
const Client = require('../models/Client');

// Middleware: require superadmin role
const requireSuperAdmin = (req, res, next) => {
  if (req.adminRole !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};

// All routes require admin auth + superadmin role
router.use(authenticateAdmin, requireSuperAdmin);

// ============================================================
// KANZLEIEN
// ============================================================

// GET /api/superadmin/kanzleien — List all
router.get('/kanzleien', async (req, res) => {
  try {
    const kanzleien = await Kanzlei.find().sort({ created_at: -1 }).lean();

    // Enrich with stats
    const enriched = await Promise.all(kanzleien.map(async (k) => {
      const [clientCount, adminCount] = await Promise.all([
        Client.countDocuments({ kanzleiId: k.id }),
        AdminUser.countDocuments({ kanzleiId: k.id })
      ]);
      return { ...k, clientCount, adminCount };
    }));

    res.json({ success: true, kanzleien: enriched });
  } catch (error) {
    console.error('Error fetching kanzleien:', error);
    res.status(500).json({ error: 'Failed to fetch kanzleien' });
  }
});

// GET /api/superadmin/kanzleien/:id — Get single with details
router.get('/kanzleien/:id', async (req, res) => {
  try {
    const kanzlei = await Kanzlei.findOne({ id: req.params.id }).lean();
    if (!kanzlei) return res.status(404).json({ error: 'Kanzlei not found' });

    const [clients, admins] = await Promise.all([
      Client.countDocuments({ kanzleiId: kanzlei.id }),
      AdminUser.find({ kanzleiId: kanzlei.id }).select('-password_hash').lean()
    ]);

    res.json({ success: true, kanzlei, clientCount: clients, admins });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch kanzlei' });
  }
});

// POST /api/superadmin/kanzleien — Create
router.post('/kanzleien', async (req, res) => {
  try {
    const { name, slug, email, phone, address } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Check unique slug
    const existing = await Kanzlei.findOne({ slug: slug.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Slug already exists' });
    }

    const kanzlei = await Kanzlei.create({
      id: uuidv4(),
      name,
      slug: slug.toLowerCase(),
      email: email || '',
      phone: phone || '',
      address: address || ''
    });

    res.status(201).json({ success: true, kanzlei });
  } catch (error) {
    console.error('Error creating kanzlei:', error);
    res.status(500).json({ error: 'Failed to create kanzlei' });
  }
});

// PATCH /api/superadmin/kanzleien/:id — Update
router.patch('/kanzleien/:id', async (req, res) => {
  try {
    const { name, email, phone, address, is_active } = req.body;
    const kanzlei = await Kanzlei.findOne({ id: req.params.id });
    if (!kanzlei) return res.status(404).json({ error: 'Kanzlei not found' });

    if (name !== undefined) kanzlei.name = name;
    if (email !== undefined) kanzlei.email = email;
    if (phone !== undefined) kanzlei.phone = phone;
    if (address !== undefined) kanzlei.address = address;
    if (is_active !== undefined) kanzlei.is_active = is_active;
    await kanzlei.save();

    res.json({ success: true, kanzlei });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update kanzlei' });
  }
});

// ============================================================
// ADMIN USERS
// ============================================================

// GET /api/superadmin/admin-users — List all (or filter by kanzleiId)
router.get('/admin-users', async (req, res) => {
  try {
    const filter = req.query.kanzleiId ? { kanzleiId: req.query.kanzleiId } : {};
    const admins = await AdminUser.find(filter).select('-password_hash').sort({ created_at: -1 }).lean();

    // Enrich with kanzlei name
    const kanzleiIds = [...new Set(admins.map(a => a.kanzleiId))];
    const kanzleien = await Kanzlei.find({ id: { $in: kanzleiIds } }).lean();
    const kanzleiMap = Object.fromEntries(kanzleien.map(k => [k.id, k.name]));

    const enriched = admins.map(a => ({
      ...a,
      kanzleiName: kanzleiMap[a.kanzleiId] || 'Unknown'
    }));

    res.json({ success: true, admins: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

// POST /api/superadmin/admin-users — Create
router.post('/admin-users', async (req, res) => {
  try {
    const { email, password, first_name, last_name, kanzleiId, role } = req.body;

    if (!email || !password || !kanzleiId) {
      return res.status(400).json({ error: 'Email, password, and kanzleiId are required' });
    }

    // Verify kanzlei exists
    const kanzlei = await Kanzlei.findOne({ id: kanzleiId });
    if (!kanzlei) return res.status(404).json({ error: 'Kanzlei not found' });

    // Check unique email
    const existing = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const admin = await AdminUser.create({
      id: uuidv4(),
      email: email.toLowerCase(),
      password_hash: password, // pre-save hook bcrypts it
      first_name: first_name || '',
      last_name: last_name || '',
      kanzleiId,
      role: role || 'admin'
    });

    res.status(201).json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        kanzleiId: admin.kanzleiId,
        role: admin.role,
        is_active: admin.is_active
      }
    });
  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// PATCH /api/superadmin/admin-users/:id — Update
router.patch('/admin-users/:id', async (req, res) => {
  try {
    const admin = await AdminUser.findOne({ id: req.params.id });
    if (!admin) return res.status(404).json({ error: 'Admin user not found' });

    const { first_name, last_name, role, is_active, password } = req.body;
    if (first_name !== undefined) admin.first_name = first_name;
    if (last_name !== undefined) admin.last_name = last_name;
    if (role !== undefined) admin.role = role;
    if (is_active !== undefined) admin.is_active = is_active;
    if (password) admin.password_hash = password; // pre-save hook bcrypts
    await admin.save();

    res.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role,
        is_active: admin.is_active,
        kanzleiId: admin.kanzleiId
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin user' });
  }
});

// ============================================================
// STATS
// ============================================================

// GET /api/superadmin/stats — Global overview
router.get('/stats', async (req, res) => {
  try {
    const [totalKanzleien, totalAdmins, totalClients, kanzleiStats] = await Promise.all([
      Kanzlei.countDocuments({ is_active: true }),
      AdminUser.countDocuments({ is_active: true }),
      Client.countDocuments(),
      Client.aggregate([
        { $group: { _id: '$kanzleiId', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // Enrich kanzlei stats with names
    const kanzleiIds = kanzleiStats.map(s => s._id);
    const kanzleien = await Kanzlei.find({ id: { $in: kanzleiIds } }).lean();
    const kanzleiMap = Object.fromEntries(kanzleien.map(k => [k.id, k.name]));

    res.json({
      success: true,
      stats: {
        totalKanzleien,
        totalAdmins,
        totalClients,
        clientsPerKanzlei: kanzleiStats.map(s => ({
          kanzleiId: s._id,
          kanzleiName: kanzleiMap[s._id] || 'Unknown',
          clients: s.count
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
