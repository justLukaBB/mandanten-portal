const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,

  // Database
  MONGODB_URI: process.env.MONGODB_URI,
  
  // External APIs
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
  
  // Google Cloud
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
  GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION || 'eu',
  GOOGLE_DOCUMENT_AI_PROCESSOR_ID: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  
  // Zendesk
  ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN,
  ZENDESK_EMAIL: process.env.ZENDESK_EMAIL,
  ZENDESK_TOKEN: process.env.ZENDESK_TOKEN,

  // Email (Resend)
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_CREDITOR_FROM_EMAIL: process.env.RESEND_CREDITOR_FROM_EMAIL || 'office@scuric.de',
  RESEND_CREDITOR_FROM_NAME: process.env.RESEND_CREDITOR_FROM_NAME || 'Thomas Scuric Rechtsanwälte',
  
  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  
  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:5173',
    'https://mandanten-portal.onrender.com',
    'https://mandanten-portal-frontend.onrender.com'
  ],
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Features
  ENABLE_DEBUG_LOGS: process.env.NODE_ENV === 'development',
  ENABLE_MOCK_DATA: process.env.ENABLE_MOCK_DATA === 'true',
  
  // Agent Review Configuration
  MANUAL_REVIEW_CONFIDENCE_THRESHOLD: parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8,
  AGENT_SESSION_TIMEOUT_HOURS: parseInt(process.env.AGENT_SESSION_TIMEOUT_HOURS) || 4,
  AGENT_CREATION_KEY: process.env.AGENT_CREATION_KEY,
  
  // Validation
  validate() {
    const required = ['MONGODB_URI', 'JWT_SECRET'];
    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}. Set them in .env or environment.`);
    }

    if (this.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }

    if (this.NODE_ENV === 'production') {
      const prodRequired = ['ANTHROPIC_API_KEY', 'GOOGLE_CLOUD_PROJECT_ID', 'AGENT_CREATION_KEY'];
      const prodMissing = prodRequired.filter(key => !this[key]);

      if (prodMissing.length > 0) {
        console.warn(`Missing production environment variables: ${prodMissing.join(', ')}`);
      }
    }
  }
};

// Validate configuration on load
config.validate();

module.exports = config;