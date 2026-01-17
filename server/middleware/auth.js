const jwt = require('jsonwebtoken');

// JWT Secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Middleware for client portal authentication
const authenticateClient = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log(`🔐 Auth header: ${authHeader ? 'Present' : 'Missing'}`);

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    console.log(`🔑 Token preview: ${token.substring(0, 20)}...`);
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`🎯 Decoded token:`, { clientId: decoded.clientId, email: decoded.email, type: decoded.type });

    // Accept client tokens, session tokens, or any token that has a client identifier
    const hasClientId = decoded.clientId || decoded.sessionId || decoded.id;

    // Temporary debugging: log full token structure
    console.log(`🔍 Full token structure:`, JSON.stringify(decoded, null, 2));

    // Allow admin tokens to access client data (admins can view any client)
    if (decoded.type === 'admin') {
      // Extract clientId from URL path if present (e.g., /api/clients/:clientId/...)
      // Match UUIDs (hex+hyphens) AND aktenzeichen (e.g., MAND_2026_2718)
      const pathMatch = req.path.match(/\/clients\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) {
        req.clientId = pathMatch[1];
      }
      req.adminId = decoded.adminId;
      req.isAdmin = true;
      req.type = 'admin'; // Ensure req.type is set for authorization checks
      console.log(`✅ Admin authenticated: ${decoded.adminId} accessing client: ${req.clientId || 'N/A'}`);
      return next();
    }

    if (decoded.type !== 'client' && !hasClientId) {
      console.log(`❌ Invalid token: missing client identifier. Token structure:`, Object.keys(decoded));
      return res.status(403).json({
        error: 'Invalid token type - client access required',
        debug: {
          tokenType: decoded.type,
          availableFields: Object.keys(decoded),
          hasClientId: !!decoded.clientId,
          hasSessionId: !!decoded.sessionId,
          hasId: !!decoded.id
        }
      });
    }

    // Set client ID from various possible fields
    req.clientId = decoded.clientId || decoded.sessionId || decoded.id;
    req.email = decoded.email;
    console.log(`✅ Client authenticated: ${req.clientId} (token type: ${decoded.type || 'session'}, fields: ${Object.keys(decoded).join(', ')})`);
    next();
  } catch (error) {
    console.log(`❌ Authentication error:`, error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware for admin authentication
const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token is for admin
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Generate JWT token for client
const generateClientToken = (clientId, email) => {
  return jwt.sign(
    {
      clientId,
      email,
      type: 'client'
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Generate JWT token for admin
const generateAdminToken = (adminId) => {
  return jwt.sign(
    {
      adminId,
      type: 'admin'
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// Middleware for admin or agent authentication
const authenticateAdminOrAgent = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token is for admin or agent
    if (decoded.type === 'admin') {
      req.adminId = decoded.adminId;
      return next();
    }

    if (decoded.type === 'agent') {
      req.agentId = decoded.agentId;
      req.agentUsername = decoded.username;
      req.agentRole = decoded.role;
      return next();
    }

    return res.status(403).json({ error: 'Admin or Agent access required' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware for agent authentication
const authenticateAgent = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token is for agent
    if (decoded.type !== 'agent') {
      return res.status(403).json({ error: 'Agent access required' });
    }

    req.agentId = decoded.agentId;
    req.agentUsername = decoded.username;
    req.agentRole = decoded.role;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Generate JWT token for agent
const generateAgentToken = (agentId, username, role) => {
  return jwt.sign(
    {
      agentId,
      username,
      role,
      type: 'agent'
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// Generate JWT token for admin impersonation
// This creates a client token with impersonation metadata
const generateImpersonationToken = (clientId, email, adminId, tokenId) => {
  return jwt.sign(
    {
      clientId,
      email,
      type: 'client',
      impersonation: true,
      impersonatedBy: adminId,
      impersonationTokenId: tokenId  // Reference to audit log entry
    },
    JWT_SECRET,
    { expiresIn: '1h' }  // Shorter expiration for security
  );
};

// Middleware to check if current session is an impersonation
const isImpersonationSession = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const token = authHeader.split(' ')[1];
    if (!token) return false;

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.impersonation === true;
  } catch (error) {
    return false;
  }
};

// Get impersonation metadata from token
const getImpersonationMetadata = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.split(' ')[1];
    if (!token) return null;

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.impersonation) return null;

    return {
      isImpersonating: true,
      adminId: decoded.impersonatedBy,
      clientId: decoded.clientId,
      tokenId: decoded.impersonationTokenId
    };
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateClient,
  authenticateAdmin,
  authenticateAdminOrAgent,
  authenticateAgent,
  generateClientToken,
  generateAdminToken,
  generateAgentToken,
  generateImpersonationToken,
  isImpersonationSession,
  getImpersonationMetadata
};