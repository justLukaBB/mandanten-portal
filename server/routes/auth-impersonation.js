const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ImpersonationToken = require('../models/ImpersonationToken');
const Client = require('../models/Client');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * GET /api/auth/impersonate
 * Validate impersonation token and return session data
 *
 * This endpoint is called when admin opens the portal with impersonation token
 * Query params: ?token=<jwt_token>
 *
 * Returns:
 * - Valid JWT token for client session
 * - Client data for portal
 * - Impersonation metadata
 */
router.get('/impersonate', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: 'Missing impersonation token',
        message: 'Token is required in query parameter'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error('Invalid impersonation token:', error.message);
      return res.status(401).json({
        error: 'Invalid or expired token',
        message: 'The impersonation token is invalid or has expired'
      });
    }

    // Verify it's an impersonation token
    if (!decoded.impersonation) {
      return res.status(403).json({
        error: 'Invalid token type',
        message: 'This is not an impersonation token'
      });
    }

    // Get impersonation record from database
    const impersonationRecord = await ImpersonationToken.findById(decoded.impersonationTokenId);
    if (!impersonationRecord) {
      return res.status(404).json({
        error: 'Impersonation record not found',
        message: 'This impersonation token was not found in the system'
      });
    }

    // Validate token is still valid
    if (!impersonationRecord.isValid()) {
      const reason = impersonationRecord.is_used ? 'already used' :
                     impersonationRecord.is_revoked ? 'revoked' :
                     impersonationRecord.expires_at < new Date() ? 'expired' : 'invalid';

      return res.status(403).json({
        error: 'Invalid impersonation token',
        message: `This impersonation token is ${reason}`
      });
    }

    // Get client data
    const client = await Client.findOne({ id: decoded.clientId });
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: 'The client associated with this token was not found'
      });
    }

    // Mark token as used
    await impersonationRecord.markAsUsed();

    // Log successful impersonation
    console.log(`✅ Impersonation session started:`, {
      admin: impersonationRecord.admin_id,
      client: client.id,
      email: client.email,
      tokenId: impersonationRecord._id
    });

    // Return authentication data
    res.json({
      success: true,
      auth_token: token, // The JWT token itself is valid for authentication
      client_id: client.id,
      client_data: {
        id: client.id,
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        aktenzeichen: client.aktenzeichen,
        current_status: client.current_status,
        workflow_status: client.workflow_status,
        phase: client.phase
      },
      impersonation: {
        is_impersonating: true,
        admin_id: impersonationRecord.admin_id,
        started_at: impersonationRecord.session_started_at,
        expires_at: impersonationRecord.expires_at,
        token_id: impersonationRecord._id
      }
    });

  } catch (error) {
    console.error('Error processing impersonation:', error);
    res.status(500).json({
      error: 'Failed to process impersonation',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/end-impersonation
 * End an active impersonation session
 *
 * This is called when admin exits the impersonation session
 */
router.post('/end-impersonation', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.impersonation || !decoded.impersonationTokenId) {
      return res.status(400).json({
        error: 'Not an impersonation session',
        message: 'This is not an active impersonation session'
      });
    }

    // Find impersonation record
    const impersonationRecord = await ImpersonationToken.findById(decoded.impersonationTokenId);
    if (impersonationRecord) {
      await impersonationRecord.endSession();

      console.log(`🔚 Impersonation session ended:`, {
        admin: impersonationRecord.admin_id,
        client: impersonationRecord.client_id,
        duration: impersonationRecord.session_duration_seconds
      });
    }

    res.json({
      success: true,
      message: 'Impersonation session ended successfully'
    });

  } catch (error) {
    console.error('Error ending impersonation:', error);
    res.status(500).json({
      error: 'Failed to end impersonation',
      message: error.message
    });
  }
});

/**
 * GET /api/auth/impersonation-status
 * Check if current session is an impersonation
 */
router.get('/impersonation-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json({
        is_impersonating: false
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.json({
        is_impersonating: false
      });
    }

    // Decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.impersonation) {
      return res.json({
        is_impersonating: false
      });
    }

    // Get impersonation details
    const impersonationRecord = await ImpersonationToken.findById(decoded.impersonationTokenId);
    if (!impersonationRecord) {
      return res.json({
        is_impersonating: false
      });
    }

    res.json({
      is_impersonating: true,
      admin_id: impersonationRecord.admin_id,
      client_id: impersonationRecord.client_id,
      started_at: impersonationRecord.session_started_at,
      expires_at: impersonationRecord.expires_at
    });

  } catch (error) {
    console.error('Error checking impersonation status:', error);
    res.json({
      is_impersonating: false
    });
  }
});

module.exports = router;
