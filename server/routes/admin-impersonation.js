const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticateAdmin, generateImpersonationToken } = require('../middleware/auth');
const Client = require('../models/Client');
const ImpersonationToken = require('../models/ImpersonationToken');

/**
 * POST /api/admin/impersonate
 * Generate impersonation token for admin to access user portal
 *
 * Security:
 * - Requires admin authentication
 * - Creates audit log entry
 * - Generates short-lived token (1 hour)
 * - Single-use token
 */
router.post('/impersonate', authenticateAdmin, async (req, res) => {
  try {
    const { client_id, reason } = req.body;
    const adminId = req.adminId;

    // Validate request
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    // Find the client
    const client = await Client.findOne({ id: client_id });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check if client has email
    if (!client.email) {
      return res.status(400).json({
        error: 'Client has no email address',
        message: 'Cannot impersonate client without email'
      });
    }

    // Generate secure random token
    const tokenString = crypto.randomBytes(32).toString('hex');

    // Calculate expiration (1 hour from now)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Get request metadata for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Create impersonation token audit record
    const impersonationRecord = new ImpersonationToken({
      token: tokenString,
      client_id: client.id,
      client_email: client.email,
      admin_id: adminId,
      admin_email: req.adminEmail || 'admin@mandanten-portal.de', // Will be set by middleware
      expires_at: expiresAt,
      reason: reason || 'Admin support',
      ip_address: ipAddress,
      user_agent: userAgent
    });

    await impersonationRecord.save();

    // Generate JWT token with impersonation metadata
    const jwtToken = generateImpersonationToken(
      client.id,
      client.email,
      adminId,
      impersonationRecord._id.toString()
    );

    // Construct portal URL
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/impersonate?token=${jwtToken}`;

    // Log the impersonation event
    console.log(`🔐 Admin impersonation initiated:`, {
      admin: adminId,
      client: client.id,
      email: client.email,
      reason: reason || 'Admin support',
      expires: expiresAt
    });

    // Return impersonation data
    res.json({
      success: true,
      impersonation_token: jwtToken,
      portal_url: portalUrl,
      expires_at: expiresAt,
      client: {
        id: client.id,
        email: client.email,
        name: `${client.firstName} ${client.lastName}`,
        aktenzeichen: client.aktenzeichen
      }
    });

  } catch (error) {
    console.error('Error generating impersonation token:', error);
    res.status(500).json({
      error: 'Failed to generate impersonation token',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/impersonation-history/:clientId
 * Get impersonation history for a specific client
 */
router.get('/impersonation-history/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const history = await ImpersonationToken.getClientHistory(clientId, limit);

    res.json({
      success: true,
      client_id: clientId,
      history: history,
      total: history.length
    });

  } catch (error) {
    console.error('Error fetching impersonation history:', error);
    res.status(500).json({
      error: 'Failed to fetch impersonation history',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/impersonation-audit
 * Get all impersonation events (admin audit log)
 */
router.get('/impersonation-audit', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      ImpersonationToken.find()
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .select('-token'), // Don't return actual tokens
      ImpersonationToken.countDocuments()
    ]);

    res.json({
      success: true,
      events: events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching impersonation audit log:', error);
    res.status(500).json({
      error: 'Failed to fetch audit log',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/revoke-impersonation/:tokenId
 * Revoke an active impersonation token
 */
router.post('/revoke-impersonation/:tokenId', authenticateAdmin, async (req, res) => {
  try {
    const { tokenId } = req.params;

    const impersonationRecord = await ImpersonationToken.findById(tokenId);
    if (!impersonationRecord) {
      return res.status(404).json({ error: 'Impersonation token not found' });
    }

    // Mark as revoked
    impersonationRecord.is_revoked = true;
    impersonationRecord.revoked_at = new Date();
    await impersonationRecord.save();

    console.log(`🚫 Impersonation token revoked:`, {
      tokenId,
      client: impersonationRecord.client_id,
      admin: impersonationRecord.admin_id
    });

    res.json({
      success: true,
      message: 'Impersonation token revoked successfully'
    });

  } catch (error) {
    console.error('Error revoking impersonation token:', error);
    res.status(500).json({
      error: 'Failed to revoke impersonation token',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/cleanup-expired-tokens
 * Clean up expired impersonation tokens (maintenance endpoint)
 */
router.post('/cleanup-expired-tokens', authenticateAdmin, async (req, res) => {
  try {
    const deletedCount = await ImpersonationToken.cleanupExpiredTokens();

    console.log(`🧹 Cleaned up ${deletedCount} expired impersonation tokens`);

    res.json({
      success: true,
      deleted_count: deletedCount,
      message: `Cleaned up ${deletedCount} expired tokens`
    });

  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
    res.status(500).json({
      error: 'Failed to cleanup expired tokens',
      message: error.message
    });
  }
});

module.exports = router;
