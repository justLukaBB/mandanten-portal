const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

// =============================================================================
// 1. CONFIGURATION & DATABASE
// =============================================================================
const config = require('./config');
const databaseService = require('./services/database');
const { uploadsDir } = require('./middleware/upload');

// =============================================================================
// 2. MODELS
// =============================================================================
const Client = require('./models/Client');
const Agent = require('./models/Agent');

// =============================================================================
// 3. MIDDLEWARE & UTILS
// =============================================================================
const { rateLimits, securityHeaders } = require('./middleware/security');
const { triggerProcessingCompleteWebhook } = require('./utils/webhookUtils');
const { sanitizeAktenzeichen } = require('./utils/sanitizeAktenzeichen');
const clientService = require('./services/clientService');
const Scheduler = require('./scheduler');

// =============================================================================
// 4. SERVICES
// =============================================================================
// Core Services
const DocumentProcessor = require('./services/documentProcessor');
const CreditorContactService = require('./services/creditorContactService');
const DebtAmountExtractor = require('./services/debtAmountExtractor');
const GermanGarnishmentCalculator = require('./services/germanGarnishmentCalculator');
const TestDataService = require('./services/testDataService');
const DelayedProcessingService = require('./services/delayedProcessingService');
const { getGCSFileStream, getGCSFileBuffer } = require('./services/gcs-service');

// Webhook & Monitor Services
const ZendeskService = require('./services/zendeskService');
const ConditionCheckService = require('./services/conditionCheckService');
const WelcomeEmailService = require('./services/welcomeEmailService');
const SideConversationMonitor = require('./services/sideConversationMonitor');
const SettlementResponseMonitor = require('./services/settlementResponseMonitor');
const DocumentReminderService = require('./services/documentReminderService');
const LoginReminderService = require('./services/loginReminderService');
const FinancialDataReminderService = require('./services/financialDataReminderService');

// =============================================================================
// 5. OBSERVER INSTANTIATION (Global State)
// =============================================================================
const globalSideConversationMonitor = new SideConversationMonitor();
const globalSettlementResponseMonitor = new SettlementResponseMonitor();

// =============================================================================
// 6. SERVICE INSTANTIATION
// =============================================================================
// Basic Services
const documentProcessor = new DocumentProcessor();
const creditorContactService = new CreditorContactService();
const debtAmountExtractor = new DebtAmountExtractor();
const garnishmentCalculator = new GermanGarnishmentCalculator();
const testDataService = new TestDataService();
const financialDataReminderService = new FinancialDataReminderService();

// Reminder Services (for Scheduler & Routes)
const documentReminderService = new DocumentReminderService();
const loginReminderService = new LoginReminderService();

// Zendesk Services
const zendeskService = new ZendeskService();
const conditionCheckService = new ConditionCheckService();
const welcomeEmailService = new WelcomeEmailService();

// =============================================================================
// 7. CONTROLLERS
// =============================================================================
const ZendeskWebhookController = require('./controllers/zendeskWebhookController');
const zendeskWebhookController = new ZendeskWebhookController({
  zendeskService,
  sideConversationMonitor: globalSideConversationMonitor,
  conditionCheckService,
  welcomeEmailService
});

// =============================================================================
// 8. ROUTE FACTORIES
// =============================================================================
// Core Routes
const healthRoutes = require('./routes/health');
const createWebhooksRouter = require('./routes/webhooks');
const createZendeskWebhooksRouter = require('./routes/zendesk-webhooks-factory');
const createPortalWebhooksRouter = require('./routes/portal-webhooks');

// Admin Routes
const createAdminDashboardRouter = require('./routes/admin-dashboard');
const createAdminDocumentsRouter = require('./routes/admin-documents');
const createAdminMaintenanceRouter = require('./routes/admin-maintenance');
const createAdminAuthRouter = require('./routes/admin-auth');
const createAdminSettlementRouter = require('./routes/admin-settlement');
const createAdminClientCreditorRouter = require('./routes/admin-client-creditor');
const createAdminFinancialRouter = require('./routes/admin-financial');

// Client Routes
const createClientPortalRouter = require('./routes/client-portal');
const createClientCreditorRouter = require('./routes/client-creditor');
const createTestDataRouter = require('./routes/test-data');

// Legacy/Direct Routes
const agentReviewRoutes = require('./routes/agent-review');
const agentAuthRoutes = require('./routes/agent-auth');
const testAgentReviewRoutes = require('./routes/test-agent-review');
const documentGenerationRoutes = require('./routes/document-generation');
const insolvenzantragRoutes = require('./routes/insolvenzantrag');
const secondRoundApiRoutes = require('./routes/second-round-api');
const adminImpersonationRoutes = require('./routes/admin-impersonation');
const authImpersonationRoutes = require('./routes/auth-impersonation');
const adminUserDeletionRoutes = require('./routes/admin-user-deletion');
const adminCreditorDatabaseRoutes = require('./routes/admin-creditor-database');
const creditorRoutes = require('./routes/creditorRoutes');
const adminDelayedProcessingRoutes = require('./routes/admin-delayed-processing');

// =============================================================================
// 9. APP INITIALIZATION & MIDDLEWARE
// =============================================================================
const app = express();
const PORT = config.PORT;

// Trust proxy for Render deployment
app.set('trust proxy', true);

// 9.1 Security & CORS
app.use(securityHeaders);
app.use(rateLimits.general);
app.use(cors({
  origin: true, // Allow all origins temporarily
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// 9.2 Body Parsing (with webhook exception)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  express.text({ type: 'application/json' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// 10. ROUTE MOUNTING
// =============================================================================

// 10.1 Health & Static
app.use('/api/health', healthRoutes);
app.use('/documents', express.static(path.join(__dirname, 'documents')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// 10.2 Webhooks
app.use('/api/webhooks', createWebhooksRouter({
  Client,
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  getClient: clientService.getClient.bind(clientService),
  triggerProcessingCompleteWebhook
}));

app.use('/api/zendesk-webhooks', createZendeskWebhooksRouter({
  Client,
  rateLimits,
  zendeskWebhookController
}));

app.use('/api/portal-webhook', createPortalWebhooksRouter({
  Client,
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  triggerProcessingCompleteWebhook
}));

// Legacy Inline Webhook (Refactored to Controller Call)
app.post('/api/zendesk-webhook/portal-link',
  (req, res, next) => zendeskWebhookController.parseZendeskPayload(req, res, next),
  (req, res) => zendeskWebhookController.handlePortalLinkSent(req, res)
);

// 10.3 Agent Routes
app.use('/api/agent-auth', agentAuthRoutes);
app.use('/api/agent-review', agentReviewRoutes);
app.use('/api/test/agent-review', testAgentReviewRoutes);

// 10.4 Document & Filing Routes
app.use('/api/documents', documentGenerationRoutes);
app.use('/api/insolvenzantrag', insolvenzantragRoutes);
app.use('/api/second-round', secondRoundApiRoutes);

// 10.5 Admin Core Routes
app.use('/api/admin', createAdminAuthRouter()); // Login
app.use('/api/admin', adminImpersonationRoutes);
app.use('/api/auth', authImpersonationRoutes);
app.use('/api/admin', adminUserDeletionRoutes);

// 10.6 Admin Dashboard & Management
app.use('/api/admin', createAdminDashboardRouter({
  Client,
  databaseService,
  clientsData: require('./server').clientsData, // Legacy support linked to exports
  uploadsDir: path.join(__dirname, 'uploads'),
  DelayedProcessingService
}));

app.use('/api', createAdminDocumentsRouter({
  Client,
  documentProcessor,
  getGCSFileStream,
  getGCSFileBuffer,
  saveClient: clientService.saveClient.bind(clientService),
  sanitizeAktenzeichen,
  uploadsDir: path.join(__dirname, 'uploads')
}));

app.use('/api', createAdminFinancialRouter({
  Client,
  garnishmentCalculator,
  saveClient: clientService.saveClient.bind(clientService),
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  getClient: clientService.getClient.bind(clientService)
}));

app.use('/api', createAdminMaintenanceRouter({
  creditorContactService,
  documentReminderService,
  Client,
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService)
}));

app.use('/api/admin', createAdminSettlementRouter(
  globalSettlementResponseMonitor,
  creditorContactService
));

app.use('/api/admin', createAdminClientCreditorRouter({
  Client,
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  DelayedProcessingService
}));

app.use('/api/admin/creditor-database', adminCreditorDatabaseRoutes);
app.use('/api', adminDelayedProcessingRoutes);

// 10.7 Client Portal Global Routes
app.use('/api', creditorRoutes); // Legacy creditor routes

app.use('/api', createClientPortalRouter({
  Client,
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  getClient: clientService.getClient.bind(clientService)
}));

app.use('/api', createClientCreditorRouter({
  Client,
  // clientsData passed as legacy, but should be handled by DB now
  clientsData: require('./server').clientsData,
  creditorContactService,
  sideConversationMonitor: globalSideConversationMonitor
}));

// 10.8 Test Routes
app.use('/api', createTestDataRouter({
  testDataService,
  creditorContactService,
  clientsData: require('./server').clientsData,
  Client,
  Agent
}));

// =============================================================================
// 11. ERROR HANDLING
// =============================================================================
app.use((error, req, res, next) => {
  console.error('❌ Express Error Handler:', error);
  console.error('Error Type:', error.constructor.name);
  console.error('Error Stack:', error.stack);

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('JSON Parse Error - Request Body:', req.body);
    console.error('JSON Parse Error - Raw Body:', error.body);
    return res.status(400).json({
      error: 'Invalid JSON',
      details: error.message,
      type: 'JSON_PARSE_ERROR'
    });
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Datei zu groß. Maximale Größe: 10MB'
      });
    }
  }

  res.status(500).json({
    error: 'Server error',
    details: error.message
  });
});

// =============================================================================
// 12. LEGACY COMPATIBILITY (In-Memory Fallback Stub)
// =============================================================================
// Block all old dashboard access - force error for old routes
const clientsData = new Proxy({}, {
  get(target, prop) {
    throw new Error('OLD_DASHBOARD_DISABLED: In-memory storage removed. Use MongoDB and Analytics Dashboard only.');
  },
  set(target, prop, value) {
    throw new Error('OLD_DASHBOARD_DISABLED: In-memory storage removed. Use MongoDB and Analytics Dashboard only.');
  }
});

// =============================================================================
// 13. SERVER STARTUP
// =============================================================================
async function startServer() {
  try {
    // Initialize database first
    await databaseService.connect();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`💾 Database: ${databaseService.isHealthy() ? 'MongoDB Connected' : 'In-Memory Fallback'}`);

      // Start scheduled tasks (using Scheduler module)
      const scheduler = new Scheduler({
        documentReminderService,
        loginReminderService
      });
      scheduler.startScheduledTasks();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await databaseService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await databaseService.disconnect();
  process.exit(0);
});

// Start the server
startServer();

// =============================================================================
// 14. EXPORTS
// =============================================================================
module.exports = {
  app,
  clientsData,
  getClient: clientService.getClient.bind(clientService),
  saveClient: clientService.saveClient.bind(clientService),
  getClientAktenzeichen: clientService.getClientAktenzeichen.bind(clientService),
  safeClientUpdate: clientService.safeClientUpdate.bind(clientService),
  triggerProcessingCompleteWebhook
};