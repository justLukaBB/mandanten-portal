const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Agent = require('../models/Agent');
const { generateAgentToken, authenticateAgent, authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Agent Login
// POST /api/agent-auth/login
router.post('/login', rateLimits.auth, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Agent login attempt for username: ${username}`);

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required'
      });
    }

    // Find agent by username or email
    const agent = await Agent.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() }
      ],
      is_active: true
    });

    if (!agent) {
      console.log(`❌ Agent not found or inactive: ${username}`);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await agent.comparePassword(password);
    if (!isValidPassword) {
      console.log(`❌ Invalid password for agent: ${username}`);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Update last login
    agent.last_login = new Date();
    agent.last_activity = new Date();
    await agent.save();

    // Generate JWT token with tenant context
    const token = generateAgentToken(agent.id, agent.username, agent.role, agent.kanzleiId);

    console.log(`✅ Agent login successful: ${agent.username} (${agent.role}, kanzlei: ${agent.kanzleiId || 'none'})`);

    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      agent: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        first_name: agent.first_name,
        last_name: agent.last_name,
        role: agent.role,
        permissions: agent.permissions,
        stats: agent.stats
      }
    });

  } catch (error) {
    console.error('❌ Agent login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: error.message
    });
  }
});

// Get Agent Profile
// GET /api/agent-auth/profile
router.get('/profile', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.agentId });
    
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      agent: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        first_name: agent.first_name,
        last_name: agent.last_name,
        role: agent.role,
        permissions: agent.permissions,
        stats: agent.stats,
        last_login: agent.last_login,
        created_at: agent.created_at
      }
    });

  } catch (error) {
    console.error('❌ Get agent profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      details: error.message
    });
  }
});

// Update Agent Activity (keep session alive)
// POST /api/agent-auth/activity
router.post('/activity', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    await Agent.updateOne(
      { id: req.agentId },
      { last_activity: new Date() }
    );

    res.json({
      success: true,
      message: 'Activity updated'
    });

  } catch (error) {
    console.error('❌ Update agent activity error:', error);
    res.status(500).json({
      error: 'Failed to update activity',
      details: error.message
    });
  }
});

// Create Agent (Admin only - for initial setup)
// POST /api/agent-auth/create
router.post('/create', async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password, 
      first_name, 
      last_name, 
      role = 'agent',
      admin_key 
    } = req.body;

    // Admin key check for agent creation
    if (!process.env.AGENT_CREATION_KEY || admin_key !== process.env.AGENT_CREATION_KEY) {
      return res.status(403).json({
        error: 'Invalid admin key'
      });
    }

    // Check if agent already exists
    const existingAgent = await Agent.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existingAgent) {
      return res.status(409).json({
        error: 'Agent with this username or email already exists'
      });
    }

    // Create new agent
    const agent = new Agent({
      id: uuidv4(),
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash: password, // Will be hashed by pre-save hook
      first_name,
      last_name,
      role
    });

    await agent.save();

    console.log(`✅ New agent created: ${agent.username} (${agent.role})`);

    res.json({
      success: true,
      message: 'Agent created successfully',
      agent: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        first_name: agent.first_name,
        last_name: agent.last_name,
        role: agent.role,
        created_at: agent.created_at
      }
    });

  } catch (error) {
    console.error('❌ Create agent error:', error);
    res.status(500).json({
      error: 'Failed to create agent',
      details: error.message
    });
  }
});

// Logout (Optional - mainly client-side token removal)
// POST /api/agent-auth/logout
router.post('/logout', authenticateAgent, rateLimits.general, async (req, res) => {
  try {
    // Update last activity for logging purposes
    await Agent.updateOne(
      { id: req.agentId },
      { last_activity: new Date() }
    );

    console.log(`👋 Agent logout: ${req.agentUsername}`);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('❌ Agent logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      details: error.message
    });
  }
});

// List all agents (Admin only)
// GET /api/agent-auth/list
router.get('/list', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    console.log(`👤 Admin ${req.adminId} requesting agent list`);

    const filter = req.tenantFilter || {};
    const agents = await Agent.find(filter, {
      password_hash: 0 // Exclude password hash from response
    }).sort({ created_at: -1 });

    res.json({
      success: true,
      agents: agents,
      total: agents.length
    });

  } catch (error) {
    console.error('❌ Error listing agents:', error);
    res.status(500).json({
      error: 'Failed to list agents',
      details: error.message
    });
  }
});

// Create Agent via Admin Token (Alternative method)
// POST /api/agent-auth/create-via-admin
router.post('/create-via-admin', authenticateAdmin, async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password, 
      first_name, 
      last_name, 
      role = 'agent'
    } = req.body;

    console.log(`👤 Admin ${req.adminId} creating agent: ${username}`);

    // Check if agent already exists
    const existingAgent = await Agent.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existingAgent) {
      return res.status(409).json({
        error: 'Agent with this username or email already exists'
      });
    }

    // Create new agent — assign to admin's kanzlei
    const agent = new Agent({
      id: uuidv4(),
      kanzleiId: req.kanzleiId || null,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash: password, // Will be hashed by pre-save hook
      first_name,
      last_name,
      role
    });

    await agent.save();

    console.log(`✅ New agent created by admin: ${agent.username} (${agent.role}, kanzlei: ${req.kanzleiId || 'none'})`);

    res.json({
      success: true,
      message: 'Agent created successfully via admin',
      agent: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        first_name: agent.first_name,
        last_name: agent.last_name,
        role: agent.role,
        created_at: agent.created_at
      }
    });

  } catch (error) {
    console.error('❌ Create agent via admin error:', error);
    res.status(500).json({
      error: 'Failed to create agent',
      details: error.message
    });
  }
});

module.exports = router;