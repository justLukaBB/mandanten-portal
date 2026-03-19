const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { generateClientToken, generateAdminToken, generateAgentToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;

// Simple in-memory rate limiter for refresh endpoint
const refreshAttempts = new Map(); // key: IP → { count, windowStart }
const REFRESH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const REFRESH_RATE_LIMIT_MAX = 10; // 10 refreshes per minute per IP

function checkRefreshRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const entry = refreshAttempts.get(key);

  if (!entry || now - entry.windowStart > REFRESH_RATE_LIMIT_WINDOW_MS) {
    refreshAttempts.set(key, { count: 1, windowStart: now });
    return next();
  }

  if (entry.count >= REFRESH_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.windowStart + REFRESH_RATE_LIMIT_WINDOW_MS - now) / 1000);
    return res.status(429).json({
      error: 'Too many refresh attempts',
      retry_after_seconds: retryAfter
    });
  }

  entry.count++;
  return next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of refreshAttempts) {
    if (now - entry.windowStart > REFRESH_RATE_LIMIT_WINDOW_MS * 2) {
      refreshAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/auth/refresh-token
 * Refresh an expired JWT token within a grace period
 *
 * - Valid tokens: re-issue immediately
 * - Expired tokens: allow refresh within 15 min grace period
 * - Impersonation tokens: never refresh (security)
 */
router.post('/refresh-token', checkRefreshRateLimit, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;

    try {
      // Try normal verification first (token still valid)
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Check grace period: allow refresh within 15 minutes of expiry
        const GRACE_PERIOD_MS = 15 * 60 * 1000;
        const expiredAgo = Date.now() - error.expiredAt.getTime();

        if (expiredAgo > GRACE_PERIOD_MS) {
          return res.status(401).json({
            error: 'Token expired beyond grace period',
            expired_ago_minutes: Math.round(expiredAgo / 60000)
          });
        }

        // Decode without verification to get payload
        decoded = jwt.decode(token);
        if (!decoded) {
          return res.status(401).json({ error: 'Invalid token payload' });
        }
      } else {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Security: never refresh impersonation tokens
    if (decoded.impersonation) {
      return res.status(403).json({ error: 'Cannot refresh impersonation tokens' });
    }

    // Generate new token based on type, with field validation
    let newToken;
    switch (decoded.type) {
      case 'admin':
        if (!decoded.adminId) {
          return res.status(401).json({ error: 'Incomplete token payload' });
        }
        newToken = generateAdminToken(decoded.adminId);
        break;
      case 'agent':
        if (!decoded.agentId || !decoded.username) {
          return res.status(401).json({ error: 'Incomplete token payload' });
        }
        newToken = generateAgentToken(decoded.agentId, decoded.username, decoded.role);
        break;
      case 'client':
        if (!decoded.clientId) {
          return res.status(401).json({ error: 'Incomplete token payload' });
        }
        newToken = generateClientToken(decoded.clientId, decoded.email);
        break;
      default:
        return res.status(401).json({ error: 'Unknown token type' });
    }

    console.log(`🔄 Token refreshed for ${decoded.type} (${decoded.adminId || decoded.agentId || decoded.clientId})`);

    res.json({
      success: true,
      token: newToken,
      type: decoded.type
    });

  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

module.exports = router;
