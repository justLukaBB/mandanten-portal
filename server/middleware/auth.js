const jwt = require('jsonwebtoken');

// JWT Secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Middleware for client portal authentication
const authenticateClient = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if token is for client portal
    if (decoded.type !== 'client') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    req.clientId = decoded.clientId;
    req.email = decoded.email;
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

module.exports = {
  authenticateClient,
  authenticateAdmin,
  authenticateAgent,
  generateClientToken,
  generateAdminToken,
  generateAgentToken
};