const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Basic health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check with dependencies
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {}
  };

  // Database check
  try {
    const dbState = mongoose.connection.readyState;
    health.checks.database = {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      connected: dbState === 1,
      readyState: dbState
    };
  } catch (error) {
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'unhealthy';
  }

  // Memory check
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    status: memUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'warning', // 500MB threshold
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
  };

  // Environment variables check
  const requiredEnvs = ['MONGODB_URI', 'JWT_SECRET'];
  const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
  health.checks.environment = {
    status: missingEnvs.length === 0 ? 'healthy' : 'unhealthy',
    missing: missingEnvs
  };

  if (missingEnvs.length > 0) {
    health.status = 'unhealthy';
  }

  // External services check
  health.checks.services = {
    anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured',
    google_cloud: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'configured' : 'not_configured',
    zendesk: process.env.ZENDESK_TOKEN ? 'configured' : 'not_configured'
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness check (for Kubernetes/Docker)
router.get('/ready', async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness check (for Kubernetes/Docker)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Storage health check
router.get('/health/storage', async (req, res) => {
  const uploadsDir = path.join(__dirname, '../uploads');
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    storage: {}
  };

  try {
    // Check if directory exists
    const exists = fs.existsSync(uploadsDir);
    health.storage.uploadsDirectory = uploadsDir;
    health.storage.exists = exists;

    if (!exists) {
      health.status = 'unhealthy';
      health.storage.error = 'Uploads directory does not exist';
      return res.status(503).json(health);
    }

    // Check if writable
    try {
      const testFile = path.join(uploadsDir, '.health-check-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      health.storage.writable = true;
    } catch (writeError) {
      health.status = 'unhealthy';
      health.storage.writable = false;
      health.storage.writeError = writeError.message;
    }

    // Count client directories and files
    let totalDirs = 0;
    let totalFiles = 0;
    let totalSize = 0;

    try {
      const entries = fs.readdirSync(uploadsDir);
      for (const entry of entries) {
        const fullPath = path.join(uploadsDir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          totalDirs++;
          // Count files in this directory
          const clientFiles = fs.readdirSync(fullPath);
          totalFiles += clientFiles.length;

          // Calculate size
          for (const file of clientFiles) {
            const filePath = path.join(fullPath, file);
            const fileStat = fs.statSync(filePath);
            if (fileStat.isFile()) {
              totalSize += fileStat.size;
            }
          }
        }
      }
    } catch (countError) {
      health.storage.countError = countError.message;
    }

    health.storage.clientDirectories = totalDirs;
    health.storage.totalFiles = totalFiles;
    health.storage.totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    health.storage.totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);

    // Warning if no files
    if (totalFiles === 0) {
      health.status = 'warning';
      health.storage.warning = 'No files found in uploads directory';
    }

    const statusCode = health.status === 'healthy' ? 200 : (health.status === 'warning' ? 200 : 503);
    res.status(statusCode).json(health);

  } catch (error) {
    health.status = 'unhealthy';
    health.storage.error = error.message;
    res.status(503).json(health);
  }
});

module.exports = router;