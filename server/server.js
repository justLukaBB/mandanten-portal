const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// Import configuration and middleware
const config = require('./config');
const { rateLimits, securityHeaders, validateRequest, validationRules, validateFileUpload } = require('./middleware/security');
const { authenticateClient, authenticateAdmin, generateClientToken, generateAdminToken } = require('./middleware/auth');
const healthRoutes = require('./routes/health');
const zendeskWebhooks = require('./routes/zendesk-webhooks');
const portalWebhooks = require('./routes/portal-webhooks');
const agentReviewRoutes = require('./routes/agent-review');
const agentAuthRoutes = require('./routes/agent-auth');
const testAgentReviewRoutes = require('./routes/test-agent-review');

// MongoDB
const databaseService = require('./services/database');
const Client = require('./models/Client');

const DocumentProcessor = require('./services/documentProcessor');
const CreditorContactService = require('./services/creditorContactService');
const DebtAmountExtractor = require('./services/debtAmountExtractor');
const GermanGarnishmentCalculator = require('./services/germanGarnishmentCalculator');
const TestDataService = require('./services/testDataService');

const app = express();
const PORT = config.PORT;

// Promise-based mutex for database operations to prevent race conditions
const processingMutex = new Map();

// Helper function to trigger processing-complete webhook
async function triggerProcessingCompleteWebhook(clientId, documentId = null) {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/zendesk-webhook/processing-complete`;
    
    console.log(`🔗 Triggering processing-complete webhook for client ${clientId}`);
    
    const response = await axios.post(webhookUrl, {
      client_id: clientId,
      document_id: documentId,
      timestamp: new Date().toISOString(),
      triggered_by: 'document_processing_completion'
    }, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MandarenPortal-Server/1.0'
      }
    });
    
    console.log(`✅ Processing-complete webhook triggered successfully for client ${clientId}`);
    return response.data;
    
  } catch (error) {
    console.error(`❌ Failed to trigger processing-complete webhook for client ${clientId}:`, error.message);
    // Don't throw - webhook failure shouldn't break document processing
    return null;
  }
}

// Safe client update function to prevent race conditions
async function safeClientUpdate(clientId, updateFunction) {
  // If no lock exists, create one resolved to start immediately
  if (!processingMutex.has(clientId)) {
    processingMutex.set(clientId, Promise.resolve());
  }
  
  // Chain this operation after the previous one
  const currentLock = processingMutex.get(clientId);
  
  const newLock = currentLock.then(async () => {
    try {
      console.log(`🔒 Acquiring lock for client ${clientId}`);
      
      // Get fresh client data
      const client = await getClient(clientId);
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }
      
      // Apply the update function
      const updatedClient = await updateFunction(client);
      
      // Save to database
      await saveClient(updatedClient);
      
      console.log(`✅ Lock released for client ${clientId}`);
      return updatedClient;
    } catch (error) {
      console.error(`❌ Error in safeClientUpdate for ${clientId}:`, error);
      throw error;
    }
  });
  
  // Update the lock to point to the new promise
  processingMutex.set(clientId, newLock);
  
  return newLock;
}

// Trust proxy for Render deployment
app.set('trust proxy', true);

// Initialize services
const documentProcessor = new DocumentProcessor();
const creditorContactService = new CreditorContactService();
const debtAmountExtractor = new DebtAmountExtractor();
const garnishmentCalculator = new GermanGarnishmentCalculator();
const testDataService = new TestDataService();

// Security middleware
app.use(securityHeaders);
app.use(rateLimits.general);

// CORS middleware - temporarily allow all origins for debugging
app.use(cors({
  origin: true, // Allow all origins temporarily
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check routes (no auth required)
app.use('/', healthRoutes);

// Zendesk webhook routes (no auth required - Zendesk handles auth)
app.use('/api/zendesk-webhook', zendeskWebhooks);

// Portal webhook routes (no auth required - internal system calls)
app.use('/api/portal-webhook', portalWebhooks);

// Agent authentication routes (no auth required for login)
app.use('/api/agent-auth', agentAuthRoutes);

// Agent review routes (agent auth required)
app.use('/api/agent-review', agentReviewRoutes);

// Test agent review routes (admin auth required)
app.use('/api/test/agent-review', testAgentReviewRoutes);

// Dashboard status routes (admin auth required) - moved inline for consistent auth

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const clientId = req.params.clientId || 'default';
    const clientDir = path.join(uploadsDir, clientId);
    fs.ensureDirSync(clientDir);
    cb(null, clientDir);
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `${uniqueId}${extension}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only specific file types
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Dateityp nicht unterstützt. Erlaubte Formate: PDF, JPG, PNG, DOC, DOCX'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE
  },
  fileFilter: fileFilter
});

// Initialize database connection
async function initializeDatabase() {
  try {
    await databaseService.connect();
    
    // Migrate existing in-memory data if needed
    if (Object.keys(clientsData).length > 0) {
      console.log('🔄 Migrating in-memory data to MongoDB...');
      await databaseService.migrateInMemoryData(clientsData);
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    // For development, continue without database
    console.log('⚠️ Continuing with in-memory storage for development');
  }
}

// ====================================================================
// ALL OLD IN-MEMORY STORAGE REMOVED - USING PURE MONGODB NOW
// Old dashboard system disconnected - Analytics Dashboard only
// ====================================================================

// Block all old dashboard access - force error for old routes
const clientsData = new Proxy({}, {
  get(target, prop) {
    throw new Error('OLD_DASHBOARD_DISABLED: In-memory storage removed. Use MongoDB and Analytics Dashboard only.');
  },
  set(target, prop, value) {
    throw new Error('OLD_DASHBOARD_DISABLED: In-memory storage removed. Use MongoDB and Analytics Dashboard only.');
  }
});

// Pure MongoDB function - no fallback to in-memory
async function getClient(clientId) {
  try {
    if (!databaseService.isHealthy()) {
      throw new Error('Database connection not available');
    }
    
    // Try to find by id first, then by aktenzeichen
    let client = await Client.findOne({ id: clientId });
    if (!client) {
      client = await Client.findOne({ aktenzeichen: clientId });
    }
    return client;
  } catch (error) {
    console.error('Error getting client from MongoDB:', error);
    throw error;
  }
}

// Pure MongoDB function - no fallback to in-memory
async function saveClient(clientData) {
  try {
    if (!databaseService.isHealthy()) {
      throw new Error('Database connection not available');
    }
    
    const client = await Client.findOneAndUpdate(
      { id: clientData.id },
      clientData,
      { upsert: true, new: true }
    );
    return client;
  } catch (error) {
    console.error('Error saving client to MongoDB:', error);
    throw error;
  }
}

// Routes

// Get client data
app.get('/api/clients/:clientId', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(client);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ 
      error: 'Error fetching client data',
      details: error.message 
    });
  }
});

// Upload creditor documents with AI processing
app.post('/api/clients/:clientId/documents', 
  rateLimits.upload,
  upload.array('documents', 10), 
  validateFileUpload,
  async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const uploadedDocuments = [];
    
    // Process each uploaded file
    for (const file of req.files) {
      const documentId = uuidv4();
      const filePath = file.path;
      
      // Create basic document record
      const documentRecord = {
        id: documentId,
        name: file.originalname,
        filename: file.filename,
        type: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        category: 'creditor',
        url: `/api/clients/${clientId}/documents/${file.filename}`,
        processing_status: 'processing',
        extracted_data: null
      };
      
      uploadedDocuments.push(documentRecord);
      
      // Start AI processing in background with detailed logging and timeout
      setImmediate(async () => {
        const startTime = Date.now();
        const PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout
        
        console.log(`\n🚀 =========================`);
        console.log(`🚀 STARTING AI PROCESSING`);
        console.log(`🚀 =========================`);
        console.log(`📁 Document: ${file.originalname}`);
        console.log(`📊 Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`🔤 Type: ${file.mimetype}`);
        console.log(`🆔 Document ID: ${documentId}`);
        console.log(`⏰ Started at: ${new Date().toISOString()}`);
        console.log(`⏱️  Timeout: ${PROCESSING_TIMEOUT / 1000}s`);
        console.log(`🚀 =========================\n`);
        
        // Set up timeout handler
        const timeoutId = setTimeout(async () => {
          console.log(`\n⏱️ =========================`);
          console.log(`⏱️ PROCESSING TIMEOUT`);
          console.log(`⏱️ =========================`);
          console.log(`📁 Document: ${file.originalname}`);
          console.log(`🆔 Document ID: ${documentId}`);
          console.log(`⏱️ Timeout after: ${PROCESSING_TIMEOUT / 1000}s`);
          console.log(`⏱️ =========================\n`);
          
          try {
            // Update document with timeout status using safe update
            await safeClientUpdate(clientId, (client) => {
              const docIndex = client.documents.findIndex(doc => doc.id === documentId);
              if (docIndex !== -1 && client.documents[docIndex].processing_status === 'processing') {
                client.documents[docIndex] = {
                  ...client.documents[docIndex],
                  processing_status: 'failed',
                  document_status: 'processing_timeout',
                  status_reason: `Verarbeitung nach ${PROCESSING_TIMEOUT / 1000} Sekunden abgebrochen`,
                  processing_error: 'Processing timeout exceeded',
                  processed_at: new Date().toISOString(),
                  processing_time_ms: PROCESSING_TIMEOUT
                };
              }
              return client;
            });
          } catch (timeoutError) {
            console.error('Error handling timeout:', timeoutError);
          }
        }, PROCESSING_TIMEOUT);
        
        try {
          // Update status to processing using safe client update
          await safeClientUpdate(clientId, (client) => {
            const docIndex = client.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              client.documents[docIndex].processing_status = 'processing';
              client.documents[docIndex].processing_started_at = new Date().toISOString();
            }
            return client;
          });
          
          console.log(`🤖 Calling Google Document AI processor...`);
          const extractedData = await documentProcessor.processDocument(filePath, file.originalname);
          
          console.log(`✅ Google Document AI processing completed!`);
          console.log(`📝 Extracted data keys:`, Object.keys(extractedData));
          
          // Check if simplified creditor classification was successful
          const classificationSuccess = !extractedData.error && 
                                       extractedData.processing_status === 'completed';
          
          console.log(`🔍 Classification Status: ${classificationSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
          
          if (classificationSuccess) {
            console.log(`📄 Document processed with simplified Claude AI`);
            console.log(`📋 Is creditor document: ${extractedData.is_creditor_document ? '✅ YES' : '❌ NO'}`);
            console.log(`🤖 Confidence: ${Math.round((extractedData.confidence || 0) * 100)}%`);
            console.log(`👁️  Manual review: ${extractedData.manual_review_required ? '❗ YES' : '✅ NO'}`);
            console.log(`💭 Reasoning: ${extractedData.reasoning || 'No reasoning provided'}`);
            
            if (extractedData.is_creditor_document && extractedData.creditor_data) {
              console.log(`🏢 Sender: ${extractedData.creditor_data.sender_name || 'Not found'}`);
              console.log(`📧 Email: ${extractedData.creditor_data.sender_email || 'Not found'}`);
              console.log(`🔢 Reference: ${extractedData.creditor_data.reference_number || 'Not found'}`);
              console.log(`💰 Amount: ${extractedData.creditor_data.claim_amount || 'Not found'}`);
              console.log(`🔄 Is representative: ${extractedData.creditor_data.is_representative ? '✅ YES' : '❌ NO'}`);
            }
          } else {
            console.log(`❌ Classification failed:`, extractedData.error || extractedData.message || 'Unknown error');
          }
          
          const validation = documentProcessor.validateExtraction(extractedData);
          const summary = documentProcessor.generateSummary(extractedData);
          
          const processingTime = Date.now() - startTime;
          
          // Use AI-provided workflow status or fallback to legacy logic
          let documentStatus = 'unknown';
          let statusReason = '';
          
          if (classificationSuccess && extractedData.workflow_status) {
            // New AI-driven status system
            switch (extractedData.workflow_status) {
              case 'GLÄUBIGERDOKUMENT':
                documentStatus = 'creditor_confirmed';
                statusReason = extractedData.status_reason || 'KI: Gläubigerdokument bestätigt';
                break;
              case 'KEIN_GLÄUBIGERDOKUMENT':
                documentStatus = 'non_creditor_confirmed';
                statusReason = extractedData.status_reason || 'KI: Kein Gläubigerdokument';
                break;
              case 'MITARBEITER_PRÜFUNG':
                documentStatus = 'needs_review';
                statusReason = extractedData.status_reason || 'KI: Manuelle Prüfung erforderlich';
                break;
              default:
                documentStatus = 'needs_review';
                statusReason = 'Unbekannter KI-Status';
                break;
            }
          } else if (classificationSuccess) {
            // Fallback to legacy logic for older versions
            const confidence = extractedData.confidence || 0.0;
            const isCreditor = extractedData.is_creditor_document;
            
            if (isCreditor) {
              if (confidence >= 0.8) {
                documentStatus = 'creditor_confirmed';
                statusReason = 'Legacy: Hohe KI-Sicherheit bei Gläubigerdokument';
              } else {
                documentStatus = 'needs_review';
                statusReason = 'Legacy: Gläubigerdokument erkannt, aber niedrige KI-Sicherheit';
              }
            } else {
              if (confidence >= 0.8) {
                documentStatus = 'non_creditor_confirmed';
                statusReason = 'Legacy: Hohe KI-Sicherheit - kein Gläubigerdokument';
              } else {
                documentStatus = 'needs_review';
                statusReason = 'Legacy: Unsichere Klassifikation - manuelle Prüfung erforderlich';
              }
            }
          } else {
            documentStatus = 'needs_review';
            statusReason = 'Verarbeitungsfehler - manuelle Prüfung erforderlich';
          }

          // Check for duplicate based on reference number for creditor documents
          let isDuplicate = false;
          let duplicateReason = '';
          
          if (documentStatus === 'creditor_confirmed' && extractedData.creditor_data?.reference_number) {
            const refNumber = extractedData.creditor_data.reference_number;
            const existingDoc = client.documents.find(doc => 
              doc.id !== documentId && 
              doc.extracted_data?.creditor_data?.reference_number === refNumber &&
              (doc.document_status === 'creditor_confirmed' || doc.document_status === 'needs_review')
            );
            
            if (existingDoc) {
              isDuplicate = true;
              duplicateReason = `Duplikat gefunden - Referenznummer "${refNumber}" bereits vorhanden in "${existingDoc.name}"`;
              documentStatus = 'duplicate_detected';
            }
          }
          
          console.log(`\n✅ =========================`);
          console.log(`✅ CLASSIFICATION COMPLETED`);
          console.log(`✅ =========================`);
          console.log(`📁 Document: ${file.originalname}`);
          console.log(`🔍 Classification Success: ${classificationSuccess ? '✅ YES' : '❌ NO'}`);
          console.log(`📋 Is Creditor Document: ${extractedData.is_creditor_document ? '✅ YES' : '❌ NO'}`);
          console.log(`📊 Document Status: ${documentStatus}`);
          console.log(`📝 Status Reason: ${statusReason}`);
          console.log(`🔄 Is Duplicate: ${isDuplicate ? '⚠️ YES' : '✅ NO'}`);
          if (isDuplicate) console.log(`📄 Duplicate Reason: ${duplicateReason}`);
          console.log(`⏱️  Processing Time: ${processingTime}ms`);
          console.log(`🤖 Confidence: ${Math.round((extractedData.confidence || 0) * 100)}%`);
          console.log(`👁️  Manual Review: ${extractedData.manual_review_required ? '❗ YES' : '✅ NO'}`);
          console.log(`📊 Summary: ${summary}`);
          console.log(`✅ =========================\n`);
          
          // Clear timeout on successful completion
          clearTimeout(timeoutId);
          
          // Update document record with enhanced data using safe update
          await safeClientUpdate(clientId, (client) => {
            const docIndex = client.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              client.documents[docIndex] = {
                ...client.documents[docIndex],
                processing_status: classificationSuccess ? 'completed' : 'failed',
                classification_success: classificationSuccess,
                is_creditor_document: extractedData.is_creditor_document || false,
                confidence: extractedData.confidence || 0.0,
                manual_review_required: extractedData.manual_review_required || false,
                document_status: documentStatus,
                status_reason: statusReason,
                is_duplicate: isDuplicate,
                duplicate_reason: duplicateReason,
                extracted_data: extractedData,
                validation: validation,
                summary: summary,
                processed_at: new Date().toISOString(),
                processing_time_ms: processingTime,
                processing_method: 'simplified_creditor_classification'
              };
            }
            
            // Update client status when documents are processed
            const completedDocs = client.documents.filter(doc => doc.processing_status === 'completed');
            const creditorDocs = completedDocs.filter(doc => doc.is_creditor_document === true);
            const totalDocs = client.documents.length;
            const allDocsCompleted = completedDocs.length === totalDocs && totalDocs > 0;
            
            // Update status based on processing results
            if (client.current_status === 'documents_uploaded' && completedDocs.length > 0) {
              if (creditorDocs.length > 0) {
                client.current_status = 'documents_processing';
                console.log(`📊 Status updated to 'documents_processing' for client ${clientId} - found ${creditorDocs.length} creditor documents`);
                
                // Add status history entry
                client.status_history = client.status_history || [];
                client.status_history.push({
                  id: uuidv4(),
                  status: 'documents_processing',
                  changed_by: 'system',
                  metadata: {
                    total_documents: client.documents.length,
                    completed_documents: completedDocs.length,
                    creditor_documents: creditorDocs.length,
                    processing_completed_timestamp: new Date().toISOString()
                  },
                  created_at: new Date()
                });
              }
            }
            
            // Check if all documents are processed and trigger webhook for processing_wait clients
            if (allDocsCompleted && client.first_payment_received && client.payment_ticket_type === 'processing_wait') {
              console.log(`🎯 All documents completed for client ${clientId} in processing_wait state - triggering webhook`);
              
              // Update final creditor list if needed
              const creditorDocuments = completedDocs.filter(doc => doc.is_creditor_document === true);
              const extractedCreditors = [];
              
              creditorDocuments.forEach(doc => {
                if (doc.extracted_data?.creditor_data) {
                  const creditorData = doc.extracted_data.creditor_data;
                  extractedCreditors.push({
                    id: uuidv4(),
                    sender_name: creditorData.sender_name,
                    sender_address: creditorData.sender_address,
                    sender_email: creditorData.sender_email,
                    reference_number: creditorData.reference_number,
                    claim_amount: creditorData.claim_amount || 0,
                    is_representative: creditorData.is_representative || false,
                    actual_creditor: creditorData.actual_creditor,
                    source_document: doc.name,
                    source_document_id: doc.id,
                    ai_confidence: doc.confidence || 0,
                    status: 'confirmed',
                    created_at: new Date(),
                    confirmed_at: new Date()
                  });
                }
              });
              
              if (extractedCreditors.length > 0) {
                client.final_creditor_list = extractedCreditors;
                console.log(`📋 Updated final_creditor_list with ${extractedCreditors.length} creditors`);
              }
              
              // Trigger the processing-complete webhook asynchronously
              setTimeout(async () => {
                await triggerProcessingCompleteWebhook(clientId, documentId);
              }, 1000); // Small delay to ensure database save completes first
            }
            
            return client;
          });
          
        } catch (processingError) {
          // Clear timeout on error
          clearTimeout(timeoutId);
          const processingTime = Date.now() - startTime;
          
          console.log(`\n❌ =========================`);
          console.log(`❌ AI PROCESSING FAILED`);
          console.log(`❌ =========================`);
          console.log(`📁 Document: ${file.originalname}`);
          console.log(`💥 Error: ${processingError.message}`);
          console.log(`⏱️  Failed after: ${processingTime}ms`);
          console.log(`🔍 AI Pipeline Success: ❌ NO`);
          console.log(`❌ =========================\n`);
          
          // Update document with error status using safe update
          await safeClientUpdate(clientId, (client) => {
            const docIndex = client.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              client.documents[docIndex] = {
                ...client.documents[docIndex],
                processing_status: 'failed',
                document_status: 'processing_failed',
                status_reason: `Verarbeitungsfehler: ${processingError.message}`,
                is_duplicate: false,
                ai_pipeline_success: false,
                claude_ai_success: false,
                processing_error: processingError.message,
                processing_error_details: processingError.stack,
                processed_at: new Date().toISOString(),
                processing_time_ms: processingTime,
                processing_method: 'google_document_ai + claude_ai'
              };
            }
            return client;
          });
        }
      });
    }
    
    // Add to client's documents using safe update to prevent race conditions
    await safeClientUpdate(clientId, (client) => {
      client.documents = client.documents || [];
      client.documents.push(...uploadedDocuments);
      
      // Update status based on document upload
      if (client.current_status === 'portal_access_sent') {
        client.current_status = 'documents_uploaded';
        console.log(`📊 Status updated to 'documents_uploaded' for client ${clientId}`);
        
        // Add status history entry
        client.status_history = client.status_history || [];
        client.status_history.push({
          id: uuidv4(),
          status: 'documents_uploaded',
          changed_by: 'client',
          metadata: {
            documents_uploaded: uploadedDocuments.length,
            document_names: uploadedDocuments.map(doc => doc.name),
            upload_timestamp: new Date().toISOString()
          },
          created_at: new Date()
        });
      }
      
      return client;
    });
    
    res.json({
      success: true,
      message: `${uploadedDocuments.length} Dokument(e) erfolgreich hochgeladen. AI-Verarbeitung läuft im Hintergrund.`,
      documents: uploadedDocuments
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Fehler beim Hochladen der Dateien',
      details: error.message 
    });
  }
});

// Serve uploaded documents
app.get('/api/clients/:clientId/documents/:filename', (req, res) => {
  const { clientId, filename } = req.params;
  const filePath = path.join(uploadsDir, clientId, filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Get client documents list with extraction data
app.get('/api/clients/:clientId/documents', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(client.documents || []);
  } catch (error) {
    console.error('Error fetching client documents:', error);
    res.status(500).json({ 
      error: 'Error fetching documents',
      details: error.message 
    });
  }
});

// OLD DASHBOARD ROUTE REMOVED - Document extraction via MongoDB now

// OLD DASHBOARD ROUTE REMOVED - Using Analytics Dashboard only

// OLD DASHBOARD ROUTE REMOVED - Using Analytics Dashboard only

// OLD DASHBOARD ROUTE REMOVED - Zendesk handles workflow now

// Admin: Generate final creditor list (deduplicated and approved)
app.post('/api/admin/clients/:clientId/generate-creditor-list', (req, res) => {
  const clientId = req.params.clientId;
  const { adminName } = req.body;
  const client = clientsData[clientId];
  
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  
  if (!client.first_payment_received) {
    return res.status(400).json({ error: 'Erste Rate muss erst als erhalten markiert werden' });
  }
  
  // Get all confirmed creditor documents (not duplicates, not failed)
  const creditorDocs = client.documents.filter(doc => 
    doc.document_status === 'creditor_confirmed' && !doc.is_duplicate
  );
  
  // Create deduplicated creditor list
  const creditorMap = new Map();
  
  creditorDocs.forEach(doc => {
    const creditorData = doc.extracted_data?.creditor_data;
    if (!creditorData) return;
    
    const referenceKey = creditorData.reference_number || `${creditorData.sender_name}_${creditorData.claim_amount}`;
    
    if (!creditorMap.has(referenceKey)) {
      creditorMap.set(referenceKey, {
        id: `creditor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender_name: creditorData.sender_name,
        sender_address: creditorData.sender_address,
        sender_email: creditorData.sender_email,
        reference_number: creditorData.reference_number,
        claim_amount: creditorData.claim_amount,
        is_representative: creditorData.is_representative,
        actual_creditor: creditorData.actual_creditor,
        source_document: doc.name,
        source_document_id: doc.id,
        ai_confidence: doc.confidence,
        status: 'pending_client_confirmation',
        created_at: new Date().toISOString()
      });
    } else {
      // Log duplicate found
      console.log(`Duplikat übersprungen: ${referenceKey} aus Dokument ${doc.name}`);
    }
  });
  
  const finalCreditorList = Array.from(creditorMap.values());
  
  // Update client status
  client.final_creditor_list = finalCreditorList;
  client.admin_approved = true;
  client.admin_approved_at = new Date().toISOString();
  client.admin_approved_by = adminName || 'System';
  client.workflow_status = 'client_confirmation';
  
  res.json({
    success: true,
    message: `${finalCreditorList.length} Gläubiger für Kundenbestätigung vorbereitet`,
    creditor_count: finalCreditorList.length,
    creditors: finalCreditorList,
    workflow_status: client.workflow_status
  });
});

// Admin: Get workflow status overview
app.get('/api/admin/clients/:clientId/workflow-status', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const creditorDocuments = (client.documents || []).filter(doc => 
      doc.document_status === 'creditor_confirmed'
    );
    
    const needsReview = (client.documents || []).filter(doc => 
      doc.document_status === 'needs_review'
    );
    
    res.json({
      client_name: `${client.firstName} ${client.lastName}`,
      workflow_status: client.workflow_status,
      first_payment_received: client.first_payment_received || false,
      admin_approved: client.admin_approved || false,
      client_confirmed_creditors: client.client_confirmed_creditors || false,
      stats: {
        total_documents: (client.documents || []).length,
        creditor_documents: creditorDocuments.length,
        needs_manual_review: needsReview.length,
        final_creditor_count: (client.final_creditor_list || []).length
      },
      admin_approved_at: client.admin_approved_at,
      admin_approved_by: client.admin_approved_by,
      client_confirmed_at: client.client_confirmed_at
    });
  } catch (error) {
    console.error('Error fetching workflow status:', error);
    res.status(500).json({ 
      error: 'Error fetching workflow status',
      details: error.message 
    });
  }
});

// Client: Get creditor list for confirmation
app.get('/api/clients/:clientId/creditor-confirmation', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // For new clients, return empty state
    if (client.workflow_status === 'portal_access_sent') {
      return res.json({
        workflow_status: client.workflow_status,
        creditors: [],
        client_confirmed: false,
        confirmation_deadline: null,
        message: 'Bitte laden Sie zuerst Ihre Gläubigerdokumente hoch.'
      });
    }
    
    if (client.workflow_status !== 'client_confirmation' && client.workflow_status !== 'completed') {
      return res.json({
        workflow_status: client.workflow_status,
        creditors: client.final_creditor_list || [],
        client_confirmed: client.client_confirmed_creditors || false,
        confirmation_deadline: null,
        message: 'Gläubigerliste wird noch verarbeitet.'
      });
    }
    
    res.json({
      workflow_status: client.workflow_status,
      creditors: client.final_creditor_list || [],
      client_confirmed: client.client_confirmed_creditors || false,
      confirmation_deadline: null
    });
  } catch (error) {
    console.error('Error fetching creditor confirmation:', error);
    res.status(500).json({ 
      error: 'Error fetching creditor confirmation data',
      details: error.message 
    });
  }
});

// OLD DASHBOARD ROUTE REMOVED - Zendesk handles creditor confirmation now

// OLD DASHBOARD ROUTE REMOVED - Zendesk handles creditor contact now

// Admin: Mark payment received
app.post('/api/admin/clients/:clientId/mark-payment-received', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Update client in MongoDB
    await Client.findByIdAndUpdate(client._id, {
      first_payment_received: true,
      payment_received_at: new Date(),
      workflow_status: 'admin_review'
    });
    
    res.json({
      success: true,
      message: 'Payment marked as received',
      workflow_status: 'admin_review'
    });
  } catch (error) {
    console.error('Error marking payment received:', error);
    res.status(500).json({ 
      error: 'Error marking payment received',
      details: error.message 
    });
  }
});

// Admin: Generate and approve creditor list
app.post('/api/admin/clients/:clientId/generate-creditor-list', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { adminName } = req.body;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    if (!client.first_payment_received) {
      return res.status(400).json({ 
        error: 'Payment not received yet',
        current_status: client.workflow_status
      });
    }
    
    // Generate creditor list from confirmed creditor documents
    const creditorDocuments = (client.documents || []).filter(doc => 
      doc.document_status === 'creditor_confirmed' && 
      doc.extracted_data?.creditor_data
    );
    
    const finalCreditorList = creditorDocuments.map(doc => ({
      id: doc.id,
      sender_name: doc.extracted_data.creditor_data.sender_name,
      sender_address: doc.extracted_data.creditor_data.sender_address,
      sender_email: doc.extracted_data.creditor_data.sender_email,
      reference_number: doc.extracted_data.creditor_data.reference_number,
      claim_amount: doc.extracted_data.creditor_data.claim_amount,
      is_representative: doc.extracted_data.creditor_data.is_representative,
      actual_creditor: doc.extracted_data.creditor_data.actual_creditor,
      source_document: doc.name,
      ai_confidence: doc.extracted_data.confidence || 0,
      status: 'pending_confirmation',
      created_at: new Date().toISOString()
    }));
    
    // Update client in MongoDB
    await Client.findByIdAndUpdate(client._id, {
      final_creditor_list: finalCreditorList,
      admin_approved: true,
      admin_approved_at: new Date(),
      admin_approved_by: adminName || 'Admin',
      workflow_status: 'client_confirmation'
    });
    
    res.json({
      success: true,
      message: 'Creditor list generated and approved',
      creditors: finalCreditorList,
      workflow_status: 'client_confirmation'
    });
  } catch (error) {
    console.error('Error generating creditor list:', error);
    res.status(500).json({ 
      error: 'Error generating creditor list',
      details: error.message 
    });
  }
});

// Admin: Get all clients for dashboard
app.get('/api/admin/clients', 
  rateLimits.admin,
  authenticateAdmin,
  async (req, res) => {
  try {
    let clients = [];
    
    // Try MongoDB first
    try {
      if (databaseService.isHealthy()) {
        clients = await Client.find({}, {
          firstName: 1,
          lastName: 1,
          email: 1,
          aktenzeichen: 1,
          workflow_status: 1,
          current_status: 1,
          documents: 1,
          final_creditor_list: 1,
          created_at: 1,
          updated_at: 1,
          last_login: 1,
          zendesk_ticket_id: 1,
          first_payment_received: 1,
          admin_approved: 1,
          client_confirmed_creditors: 1
        }).sort({ created_at: -1 });
        console.log(`📊 Found ${clients.length} clients in MongoDB`);
      }
    } catch (mongoError) {
      console.error('MongoDB query failed:', mongoError);
    }
    
    // Fallback to in-memory data if MongoDB is empty or failed
    if (clients.length === 0) {
      console.log('📊 Falling back to in-memory clients data');
      clients = Object.values(clientsData).map(client => ({
        _id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        aktenzeichen: client.aktenzeichen,
        workflow_status: client.workflow_status,
        current_status: client.current_status,
        documents: client.documents || [],
        final_creditor_list: client.final_creditor_list || [],
        created_at: client.created_at,
        updated_at: client.updated_at,
        last_login: client.last_login,
        zendesk_ticket_id: client.zendesk_ticket_id,
        first_payment_received: client.first_payment_received,
        admin_approved: client.admin_approved,
        client_confirmed_creditors: client.client_confirmed_creditors
      }));
      console.log(`📊 Found ${clients.length} clients in memory`);
    }
    
    res.json({ clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ 
      error: 'Error fetching clients',
      details: error.message 
    });
  }
});

// Admin: Create new client
app.post('/api/admin/clients', 
  rateLimits.admin,
  authenticateAdmin,
  async (req, res) => {
  try {
    const clientData = req.body;
    console.log('📝 Received client creation request:', {
      firstName: clientData.firstName,
      lastName: clientData.lastName,
      email: clientData.email,
      aktenzeichen: clientData.aktenzeichen,
      current_status: clientData.current_status,
      workflow_status: clientData.workflow_status
    });
    
    // Validate required fields
    if (!clientData.firstName || !clientData.lastName || !clientData.email || !clientData.aktenzeichen) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['firstName', 'lastName', 'email', 'aktenzeichen']
      });
    }
    
    // Check if client with same aktenzeichen already exists
    const existingClient = await Client.findOne({ 
      $or: [
        { aktenzeichen: clientData.aktenzeichen },
        { email: clientData.email }
      ]
    });
    
    if (existingClient) {
      return res.status(409).json({ 
        error: 'Client already exists',
        details: existingClient.email === clientData.email ? 
          'Email already in use' : 'Aktenzeichen already exists'
      });
    }
    
    // Create new client in MongoDB
    const newClient = new Client({
      ...clientData,
      id: clientData.aktenzeichen, // Use aktenzeichen as ID
      _id: undefined, // Let MongoDB generate _id
      created_at: new Date(),
      updated_at: new Date(),
      documents: [],
      final_creditor_list: [],
      // Grant immediate portal access for manually created users
      portal_link_sent: true,
      portal_link_sent_at: new Date(),
      status_history: [{
        id: uuidv4(),
        status: clientData.current_status || 'created',
        changed_by: 'system',
        created_at: new Date()
      }]
    });
    
    await newClient.save();
    
    console.log(`✅ Created new client: ${newClient.firstName} ${newClient.lastName} (${newClient.aktenzeichen})`);
    
    res.status(201).json({
      id: newClient.id,
      _id: newClient._id,
      firstName: newClient.firstName,
      lastName: newClient.lastName,
      email: newClient.email,
      aktenzeichen: newClient.aktenzeichen,
      current_status: newClient.current_status,
      workflow_status: newClient.workflow_status,
      created_at: newClient.created_at
    });
    
  } catch (error) {
    console.error('❌ Error creating client:', error);
    
    // Enhanced error logging
    if (error.name === 'ValidationError') {
      console.error('MongoDB Validation Error:', error.errors);
      res.status(400).json({ 
        error: 'Validation error',
        details: error.message,
        validation_errors: error.errors
      });
    } else if (error.code === 11000) {
      console.error('MongoDB Duplicate Key Error:', error);
      res.status(409).json({ 
        error: 'Duplicate entry',
        details: 'Client with this email or aktenzeichen already exists'
      });
    } else {
      console.error('General Error:', error);
      res.status(500).json({ 
        error: 'Error creating client',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Admin: Clear all data from MongoDB (DANGER!)
app.delete('/api/admin/clear-database', 
  rateLimits.admin,
  authenticateAdmin,
  async (req, res) => {
  try {
    console.log('🗑️ ADMIN REQUEST: Clearing all data from MongoDB...');
    
    if (!databaseService.isHealthy()) {
      return res.status(503).json({ 
        error: 'Database not available' 
      });
    }
    
    // Get counts before deletion for confirmation
    const clientCount = await Client.countDocuments();
    
    console.log(`📊 Found ${clientCount} clients in database`);
    
    // Delete all clients (this will cascade delete all related data)
    const deleteResult = await Client.deleteMany({});
    
    console.log(`✅ Deleted ${deleteResult.deletedCount} clients from MongoDB`);
    
    // Also clean up any uploaded files directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      console.log('🗂️ Cleaning up uploads directory...');
      const clientDirs = fs.readdirSync(uploadsDir).filter(dir => {
        const dirPath = path.join(uploadsDir, dir);
        return fs.statSync(dirPath).isDirectory();
      });
      
      let filesDeleted = 0;
      for (const clientDir of clientDirs) {
        const clientDirPath = path.join(uploadsDir, clientDir);
        try {
          fs.removeSync(clientDirPath);
          filesDeleted++;
          console.log(`🗑️ Deleted directory: ${clientDir}`);
        } catch (error) {
          console.warn(`⚠️ Could not delete directory ${clientDir}:`, error.message);
        }
      }
      console.log(`📂 Cleaned up ${filesDeleted} client directories`);
    }
    
    res.json({
      success: true,
      message: 'Database cleared successfully',
      stats: {
        clients_deleted: deleteResult.deletedCount,
        upload_dirs_cleaned: fs.existsSync(uploadsDir) ? 
          fs.readdirSync(uploadsDir).filter(dir => 
            fs.statSync(path.join(uploadsDir, dir)).isDirectory()
          ).length : 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    res.status(500).json({ 
      error: 'Error clearing database',
      details: error.message 
    });
  }
});

// Trigger reprocessing of a document
app.post('/api/clients/:clientId/documents/:documentId/reprocess', async (req, res) => {
  try {
    const { clientId, documentId } = req.params;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const docIndex = client.documents?.findIndex(doc => doc.id === documentId);
    
    if (docIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = client.documents[docIndex];
    const filePath = path.join(__dirname, 'uploads', clientId, document.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document file not found' });
    }
    
    // Update status to processing
    client.documents[docIndex].processing_status = 'processing';
    client.documents[docIndex].processing_error = null;
    await saveClient(client);
    
    // Start reprocessing in background
    setImmediate(async () => {
      try {
        console.log(`Reprocessing document: ${document.name}`);
        const extractedData = await documentProcessor.processDocument(filePath, document.name);
        const validation = documentProcessor.validateExtraction(extractedData);
        const summary = documentProcessor.generateSummary(extractedData);
        
        client.documents[docIndex] = {
          ...client.documents[docIndex],
          processing_status: 'completed',
          extracted_data: extractedData,
          validation: validation,
          summary: summary,
          processed_at: new Date().toISOString()
        };
        
        await saveClient(client);
        console.log(`Reprocessing completed for: ${document.name}`);
      } catch (error) {
        console.error(`Reprocessing failed for ${document.name}:`, error);
        client.documents[docIndex] = {
          ...client.documents[docIndex],
          processing_status: 'failed',
          processing_error: error.message,
          processed_at: new Date().toISOString()
        };
        await saveClient(client);
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Document reprocessing started',
      document_id: documentId
    });
  } catch (error) {
    console.error('Error starting reprocessing:', error);
    res.status(500).json({ 
      error: 'Error starting reprocessing',
      details: error.message 
    });
  }
});

// Admin: Manual document review
app.patch('/api/admin/clients/:clientId/documents/:documentId/review', async (req, res) => {
  try {
    const { clientId, documentId } = req.params;
    const { document_status, admin_note, reviewed_by } = req.body;
    const client = await getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const docIndex = client.documents?.findIndex(doc => doc.id === documentId);
    
    if (docIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Validate the new status
    const validStatuses = ['creditor_confirmed', 'non_creditor_confirmed', 'needs_review', 'duplicate_detected'];
    if (!validStatuses.includes(document_status)) {
      return res.status(400).json({ error: 'Invalid document status' });
    }
    
    // Update document with admin review
    client.documents[docIndex] = {
      ...client.documents[docIndex],
      document_status: document_status,
      status_reason: admin_note || `Manuell geprüft: ${document_status}`,
      admin_reviewed: true,
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: reviewed_by || 'Admin',
      manual_review_required: false // Clear manual review flag after admin review
    };
    
    await saveClient(client);
    
    console.log(`📋 Admin Review: Document "${client.documents[docIndex].name}" marked as "${document_status}" by ${reviewed_by || 'Admin'}`);
    
    res.json({ 
      success: true, 
      message: `Dokument erfolgreich als "${document_status}" markiert`,
      document: {
        id: documentId,
        document_status: document_status,
        status_reason: admin_note,
        admin_reviewed: true,
        admin_reviewed_at: client.documents[docIndex].admin_reviewed_at,
        admin_reviewed_by: reviewed_by || 'Admin'
      }
    });
  } catch (error) {
    console.error('Error reviewing document:', error);
    res.status(500).json({ 
      error: 'Error reviewing document',
      details: error.message 
    });
  }
});

// Delete document
app.delete('/api/clients/:clientId/documents/:documentId', (req, res) => {
  const { clientId, documentId } = req.params;
  const client = clientsData[clientId];
  
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  
  const documentIndex = client.documents.findIndex(doc => doc.id === documentId);
  
  if (documentIndex === -1) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  const document = client.documents[documentIndex];
  const filePath = path.join(uploadsDir, clientId, document.filename);
  
  // Remove file from filesystem
  if (fs.existsSync(filePath)) {
    fs.removeSync(filePath);
  }
  
  // Remove from client documents
  client.documents.splice(documentIndex, 1);
  
  res.json({ success: true, message: 'Dokument gelöscht' });
});

// =============================================================================
// ZENDESK CREDITOR CONTACT ENDPOINTS
// =============================================================================

// Start creditor contact process for confirmed clients
app.post('/api/clients/:clientId/start-creditor-contact', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Only allow if client has confirmed creditors
    if (client.workflow_status !== 'completed') {
      return res.status(400).json({ 
        error: 'Creditor contact can only be started after client confirmation is completed',
        current_status: client.workflow_status
      });
    }
    
    console.log(`🚀 Starting Zendesk creditor contact process for client ${clientId}`);
    
    const clientData = {
      name: `${client.firstName} ${client.lastName}`,
      email: client.email
    };
    
    const result = await creditorContactService.processClientCreditorConfirmation(clientId, clientData);
    
    if (result.success) {
      // Update client workflow status
      client.creditor_contact_started = true;
      client.creditor_contact_started_at = new Date().toISOString();
      client.workflow_status = 'creditor_contact_active';
      
      console.log(`✅ Creditor contact process completed for ${clientId}`);
      console.log(`📊 Results: ${result.tickets_created} tickets, ${result.emails_sent} emails`);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error starting creditor contact process:', error);
    res.status(500).json({ 
      error: 'Error starting creditor contact process',
      details: error.message 
    });
  }
});

// Resend creditor emails for a client
app.post('/api/clients/:clientId/resend-creditor-emails', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    if (!client.creditor_contact_started) {
      return res.status(400).json({ 
        error: 'Creditor contact process has not been started yet',
        current_status: client.workflow_status
      });
    }
    
    console.log(`🔄 Re-sending creditor emails for client ${clientId}`);
    
    // Get existing creditor contact data from the service
    const status = await creditorContactService.getClientCreditorStatus(clientId);
    
    if (!status.creditor_contacts || status.creditor_contacts.length === 0) {
      return res.status(400).json({ 
        error: 'No creditor contacts found to resend'
      });
    }
    
    // Re-send emails for all existing contacts
    let emailsSent = 0;
    const results = [];
    
    for (let i = 0; i < status.creditor_contacts.length; i++) {
      const contact = status.creditor_contacts[i];
      
      try {
        console.log(`📧 Re-sending email ${i + 1}/${status.creditor_contacts.length} for ${contact.creditor_name}`);
        
        // Send email via Zendesk (reuse existing ticket)
        if (contact.zendesk_ticket_id) {
          const clientData = {
            name: `${client.firstName} ${client.lastName}`,
            email: client.email
          };
          
          await creditorContactService.zendesk.sendCreditorEmailViaTicket(
            contact.zendesk_ticket_id,
            contact,
            clientData
          );
          
          // Update contact status
          contact.contact_status = 'email_sent';
          contact.email_sent_at = new Date().toISOString();
          contact.updated_at = new Date().toISOString();
          
          emailsSent++;
          results.push({
            creditor_name: contact.creditor_name,
            ticket_id: contact.zendesk_ticket_id,
            success: true
          });
          
          // Wait between emails to avoid rate limits
          if (i < status.creditor_contacts.length - 1) {
            console.log(`⏰ Waiting 3 seconds before next email...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
      } catch (error) {
        console.error(`❌ Failed to resend email for ${contact.creditor_name}:`, error.message);
        results.push({
          creditor_name: contact.creditor_name,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Re-sent ${emailsSent} creditor emails for client ${clientId}`);
    
    res.json({
      success: true,
      emails_sent: emailsSent,
      total_creditors: status.creditor_contacts.length,
      results: results,
      message: `${emailsSent} E-Mails erneut versendet`,
      processing_timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error re-sending creditor emails:', error);
    res.status(500).json({ 
      error: 'Error re-sending creditor emails',
      details: error.message 
    });
  }
});

// Get creditor contact status for a client
app.get('/api/clients/:clientId/creditor-contact-status', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const status = await creditorContactService.getClientCreditorStatus(clientId);
    
    res.json({
      ...status,
      client_info: {
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        workflow_status: client.workflow_status,
        creditor_contact_started: client.creditor_contact_started || false,
        creditor_contact_started_at: client.creditor_contact_started_at
      }
    });
    
  } catch (error) {
    console.error('Error getting creditor contact status:', error);
    res.status(500).json({ 
      error: 'Error getting creditor contact status',
      details: error.message 
    });
  }
});

// Get final debt summary for a client
app.get('/api/clients/:clientId/final-debt-summary', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const summary = await creditorContactService.getFinalDebtSummary(clientId);
    
    res.json({
      ...summary,
      client_info: {
        name: `${client.firstName} ${client.lastName}`,
        email: client.email
      }
    });
    
  } catch (error) {
    console.error('Error getting final debt summary:', error);
    res.status(500).json({ 
      error: 'Error getting final debt summary',
      details: error.message 
    });
  }
});

// Zendesk webhook endpoint for processing creditor responses
app.post('/api/zendesk-webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('📥 Received Zendesk webhook:', webhookData.type || 'unknown');
    
    // Check if this is a ticket comment update from creditor response
    if (webhookData.type === 'ticket_comment_created') {
      const ticketId = webhookData.ticket?.id;
      const comment = webhookData.comment;
      
      // Only process public comments (creditor responses)
      if (comment?.public && comment.via?.channel !== 'web') {
        console.log(`📧 Processing creditor response for ticket ${ticketId}`);
        
        const result = await creditorContactService.processIncomingCreditorResponse(ticketId, comment);
        
        if (result.success) {
          console.log(`✅ Processed response: ${result.creditor_name} - ${result.amount} EUR`);
        } else {
          console.log(`❌ Failed to process response: ${result.error}`);
        }
      }
    }
    
    res.json({ status: 'success', message: 'Webhook processed' });
    
  } catch (error) {
    console.error('Error processing Zendesk webhook:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Zendesk webhook endpoint for "Portal - Link" macro
app.post('/api/zendesk-webhook/portal-link', async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('🔗 Received Portal-Link webhook:', JSON.stringify(webhookData, null, 2));
    
    // Extract ticket and user information
    const ticket = webhookData.ticket;
    const requester = ticket?.requester;
    
    if (!ticket || !requester) {
      throw new Error('Missing ticket or requester information');
    }
    
    // Validate required fields
    if (!requester.email) {
      throw new Error('Requester email is required');
    }
    
    // Extract Aktenzeichen and Email from the webhook
    const aktenzeichen = requester?.aktenzeichen || 
                        ticket.external_id || 
                        ticket.id || 
                        `MAND_${Date.now()}`;
    
    const email = requester.email.toLowerCase().trim();
    const name = requester.name || 'Unknown';
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
    
    console.log(`📋 Creating portal user: ${name} (${email}) - Aktenzeichen: ${aktenzeichen}`);
    
    // Generate unique client ID - use Aktenzeichen directly if alphanumeric, otherwise create safe version
    const clientId = aktenzeichen;
    
    // Check if client already exists
    const existingClient = await getClient(clientId);
    if (existingClient) {
      console.log(`⚠️ Client ${clientId} already exists, updating info`);
    }
    
    // Parse name into first and last name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Create or update client in database
    const clientData = {
      id: clientId,
      aktenzeichen: aktenzeichen,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: requester.phone || '',
      address: '',
      phase: 1,
      documents: existingClient?.documents || [],
      workflow_status: 'portal_access_sent',
      portal_link_sent: true,
      portal_link_sent_at: new Date().toISOString(),
      zendesk_user_id: requester.id,
      zendesk_ticket_id: ticket.id,
      created_at: existingClient?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Portal access
      portal_token: existingClient?.portal_token || uuidv4(),
      portal_link: existingClient?.portal_link || `https://portal.kanzlei.de/login`
    };
    
    const client = await saveClient(clientData);
    
    console.log(`✅ Client ${clientId} created/updated with portal access`);
    console.log(`🔗 Portal link: ${client.portal_link}`);
    
    // Update Zendesk ticket with portal information
    try {
      await creditorContactService.zendesk.addTicketComment(
        ticket.id,
        `✅ Portal-Zugang wurde erstellt\n\n` +
        `👤 Mandant: ${name}\n` +
        `📧 E-Mail: ${email}\n` +
        `📁 Aktenzeichen: ${aktenzeichen}\n` +
        `🔗 Portal-Link: ${client.portal_link}\n\n` +
        `Der Mandant kann sich nun im Portal anmelden und Dokumente hochladen.`,
        false // Internal comment
      );
      console.log('✅ Zendesk ticket updated successfully');
    } catch (zendeskError) {
      console.error('⚠️ Failed to update Zendesk ticket (this is normal for test webhooks):', zendeskError.message);
      // Don't throw error - webhook should still succeed even if Zendesk update fails
    }
    
    res.json({ 
      status: 'success', 
      message: 'Portal user created',
      client_id: clientId,
      portal_link: client.portal_link,
      aktenzeichen: aktenzeichen
    });
    
  } catch (error) {
    console.error('Error processing Portal-Link webhook:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Portal login endpoint
app.post('/api/portal/login', 
  rateLimits.auth, 
  validateRequest([
    validationRules.email,
    validationRules.aktenzeichen
  ]), 
  async (req, res) => {
  try {
    const { email, aktenzeichen } = req.body;
    
    if (!email || !aktenzeichen) {
      return res.status(400).json({ 
        error: 'Email und Aktenzeichen sind erforderlich' 
      });
    }
    
    console.log(`🔐 Portal login attempt: ${email} - Aktenzeichen: ${aktenzeichen}`);
    
    // Find client by email and aktenzeichen
    let foundClient = null;
    
    try {
      if (databaseService.isHealthy()) {
        console.log(`🔍 Searching in MongoDB for client with email: ${email} and aktenzeichen: ${aktenzeichen}`);
        
        foundClient = await Client.findOne({ email: email, aktenzeichen: aktenzeichen });
        
        if (foundClient) {
          console.log(`✅ Client found in MongoDB: ${foundClient.aktenzeichen} | ${foundClient.email}`);
        } else {
          console.log(`❌ No client found in MongoDB with exact match`);
          
          // Try to find similar clients for debugging
          const byEmail = await Client.findOne({ email: email });
          const byAktenzeichen = await Client.findOne({ aktenzeichen: aktenzeichen });
          
          if (byEmail) {
            console.log(`🔍 Found client with same email but different aktenzeichen: ${byEmail.aktenzeichen}`);
          }
          if (byAktenzeichen) {
            console.log(`🔍 Found client with same aktenzeichen but different email: ${byAktenzeichen.email}`);
            
            // SMART FIX: If we find a client with matching aktenzeichen but similar email, 
            // check if it's a common typo (like missing dot or extra characters)
            const dbEmail = byAktenzeichen.email.toLowerCase();
            const loginEmail = email.toLowerCase();
            
            // Check if emails are similar (common typos: dot issues, extra characters)
            const emailSimilar = (
              dbEmail.replace(/\./g, '') === loginEmail.replace(/\./g, '') || // dot differences
              dbEmail.replace(/[^a-z0-9@]/g, '') === loginEmail.replace(/[^a-z0-9@]/g, '') // special char differences
            );
            
            if (emailSimilar) {
              console.log(`🔧 Email similarity detected - accepting login with similar email`);
              console.log(`   Database: ${byAktenzeichen.email}`);
              console.log(`   Login attempt: ${email}`);
              foundClient = byAktenzeichen;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error searching client in MongoDB:', error);
    }
    
    // Fallback to in-memory search
    if (!foundClient) {
      console.log(`🔍 Searching in-memory storage (${Object.keys(clientsData).length} clients)`);
      for (const [clientId, client] of Object.entries(clientsData)) {
        if (client.email === email && client.aktenzeichen === aktenzeichen) {
          foundClient = client;
          console.log(`✅ Client found in in-memory storage: ${foundClient.aktenzeichen} | ${foundClient.email}`);
          break;
        }
      }
      
      if (!foundClient) {
        console.log(`❌ No client found in in-memory storage either`);
      }
    }
    
    if (!foundClient) {
      console.log(`❌ Login failed: No client found with email ${email} and Aktenzeichen ${aktenzeichen}`);
      return res.status(401).json({ 
        error: 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre E-Mail und Ihr Aktenzeichen.' 
      });
    }
    
    // Portal access is always granted - removed access restriction
    // This allows all valid users to access the portal immediately
    
    // Generate JWT token instead of simple session token
    const jwtToken = generateClientToken(foundClient.id, foundClient.email);
    const sessionToken = uuidv4(); // Keep for backward compatibility
    
    // Update client with session token
    foundClient.session_token = sessionToken;
    foundClient.last_login = new Date().toISOString();
    
    // Save updated client
    await saveClient(foundClient);
    
    console.log(`✅ Login successful for ${email} (Client ID: ${foundClient.id})`);
    
    res.json({
      success: true,
      message: 'Anmeldung erfolgreich',
      client: {
        id: foundClient.id,
        firstName: foundClient.firstName,
        lastName: foundClient.lastName,
        email: foundClient.email,
        aktenzeichen: foundClient.aktenzeichen,
        phase: foundClient.phase,
        workflow_status: foundClient.workflow_status,
        documents_count: foundClient.documents?.length || 0
      },
      session_token: sessionToken, // Backward compatibility
      token: jwtToken // New JWT token
    });
    
  } catch (error) {
    console.error('Error during portal login:', error);
    res.status(500).json({ 
      error: 'Anmeldefehler',
      details: error.message 
    });
  }
});

// Admin login endpoint
app.post('/api/admin/login',
  rateLimits.auth,
  validateRequest([
    validationRules.email,
    validationRules.password
  ]),
  async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // TODO: Replace with proper admin user management
    // For now, use environment variables for admin credentials
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mandanten-portal.de';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // CHANGE THIS!
    
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ 
        error: 'Ungültige Admin-Anmeldedaten' 
      });
    }
    
    // Generate admin JWT token
    const token = generateAdminToken(email);
    
    res.json({
      success: true,
      message: 'Admin-Anmeldung erfolgreich',
      token,
      user: {
        email,
        role: 'admin'
      }
    });
    
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ 
      error: 'Anmeldefehler',
      details: error.message 
    });
  }
});

// Portal session validation endpoint
app.get('/api/portal/validate-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No session token provided' });
    }
    
    const sessionToken = authHeader.substring(7);
    
    // Find client by session token
    let foundClient = null;
    
    try {
      if (databaseService.isHealthy()) {
        foundClient = await Client.findOne({ session_token: sessionToken });
      }
    } catch (error) {
      console.error('Error searching client by session token in MongoDB:', error);
    }
    
    // Fallback to in-memory search
    if (!foundClient) {
      for (const [clientId, client] of Object.entries(clientsData)) {
        if (client.session_token === sessionToken) {
          foundClient = client;
          break;
        }
      }
    }
    
    if (!foundClient) {
      return res.status(401).json({ error: 'Invalid session token' });
    }
    
    res.json({
      valid: true,
      client: {
        id: foundClient.id,
        firstName: foundClient.firstName,
        lastName: foundClient.lastName,
        email: foundClient.email,
        aktenzeichen: foundClient.aktenzeichen,
        phase: foundClient.phase,
        workflow_status: foundClient.workflow_status
      }
    });
    
  } catch (error) {
    console.error('Error validating session:', error);
    res.status(500).json({ 
      error: 'Session validation error',
      details: error.message 
    });
  }
});

// Process timeout creditors (manual trigger)
app.post('/api/admin/process-timeout-creditors', async (req, res) => {
  try {
    const { timeout_days = 14 } = req.body;
    
    console.log(`⏰ Processing timeout creditors (${timeout_days} days)`);
    
    const result = await creditorContactService.processTimeoutCreditors(timeout_days);
    
    console.log(`✅ Processed ${result.processed_count} timeout creditors`);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error processing timeout creditors:', error);
    res.status(500).json({ 
      error: 'Error processing timeout creditors',
      details: error.message 
    });
  }
});

// Test Zendesk connection
app.get('/api/admin/test-zendesk', async (req, res) => {
  try {
    const zendesk = creditorContactService.zendesk;
    const connectionOk = await zendesk.testConnection();
    
    res.json({ 
      success: connectionOk,
      message: connectionOk ? 'Zendesk connection successful' : 'Zendesk connection failed'
    });
    
  } catch (error) {
    console.error('Error testing Zendesk connection:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error testing Zendesk connection',
      details: error.message 
    });
  }
});

// Add demo documents for testing
app.post('/api/admin/clients/:clientId/add-demo-documents', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Add comprehensive demo documents for testing
    const demoDocuments = [
      {
        id: 'demo-doc-1',
        name: 'Stadtsparkasse_Mahnung.pdf',
        filename: 'demo-stadtsparkasse-mahnung.pdf',
        type: 'application/pdf',
        size: 152034,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.95,
        extracted_data: {
          creditor_data: {
            sender_name: 'Stadtsparkasse München',
            sender_email: 'forderungen@sskmuenchen.de',
            sender_address: 'Sparkassenstraße 2, 80331 München',
            reference_number: '57852774001',
            claim_amount: 2500.00,
            is_representative: false,
            actual_creditor: null
          },
          confidence: 0.95,
          reasoning: 'Eindeutig identifizierbares Gläubigerdokument mit Forderungsangabe',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      },
      {
        id: 'demo-doc-2',
        name: 'Deutsche_Telekom_Rechnung.pdf',
        filename: 'demo-telekom-rechnung.pdf',
        type: 'application/pdf',
        size: 89456,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.92,
        extracted_data: {
          creditor_data: {
            sender_name: 'Deutsche Telekom AG',
            sender_email: 'inkasso@telekom.de',
            sender_address: 'Friedrich-Ebert-Allee 140, 53113 Bonn',
            reference_number: '98765432109',
            claim_amount: 450.75,
            is_representative: false,
            actual_creditor: null
          },
          confidence: 0.92,
          reasoning: 'Rechnungsdokument mit offener Forderung identifiziert',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      },
      {
        id: 'demo-doc-3',
        name: 'EOS_Inkasso_Mahnung.pdf',
        filename: 'demo-inkasso-mahnung.pdf',
        type: 'application/pdf',
        size: 203487,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.88,
        extracted_data: {
          creditor_data: {
            sender_name: 'EOS Deutscher Inkasso-Dienst GmbH',
            sender_email: 'mahnung@eos-solutions.com',
            sender_address: 'Steindamm 71, 20099 Hamburg',
            reference_number: '44556677889',
            claim_amount: 1280.30,
            is_representative: true,
            actual_creditor: 'Versandhaus Otto GmbH'
          },
          confidence: 0.88,
          reasoning: 'Inkasso-Dokument für Drittgläubiger identifiziert',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      },
      {
        id: 'demo-doc-4',
        name: 'Amazon_Kreditkarte_Mahnung.pdf',
        filename: 'demo-amazon-kreditkarte.pdf',
        type: 'application/pdf',
        size: 145678,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.93,
        extracted_data: {
          creditor_data: {
            sender_name: 'Landesbank Berlin AG',
            sender_email: 'kreditkarten@lbb.de',
            sender_address: 'Alexanderplatz 2, 10178 Berlin',
            reference_number: '11223344556',
            claim_amount: 3450.80,
            is_representative: false,
            actual_creditor: null
          },
          confidence: 0.93,
          reasoning: 'Kreditkarten-Abrechnung mit ausstehender Forderung',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      },
      {
        id: 'demo-doc-5',
        name: 'Vodafone_Mobilfunk_Mahnung.pdf',
        filename: 'demo-vodafone-mahnung.pdf',
        type: 'application/pdf',
        size: 95432,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.91,
        extracted_data: {
          creditor_data: {
            sender_name: 'Vodafone GmbH',
            sender_email: 'rechnung@vodafone.de',
            sender_address: 'Ferdinand-Braun-Platz 1, 40549 Düsseldorf',
            reference_number: '77888999000',
            claim_amount: 189.95,
            is_representative: false,
            actual_creditor: null
          },
          confidence: 0.91,
          reasoning: 'Mobilfunk-Rechnung mit ausstehender Zahlung',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      },
      {
        id: 'demo-doc-6',
        name: 'Santander_Kredit_Mahnung.pdf',
        filename: 'demo-santander-kredit.pdf',
        type: 'application/pdf',
        size: 187654,
        uploadedAt: new Date().toISOString(),
        processing_status: 'completed',
        document_status: 'creditor_confirmed',
        status_reason: 'KI: Gläubigerdokument bestätigt',
        is_duplicate: false,
        confidence: 0.96,
        extracted_data: {
          creditor_data: {
            sender_name: 'Santander Consumer Bank AG',
            sender_email: 'inkasso@santander.de',
            sender_address: 'Santander-Platz 1, 41061 Mönchengladbach',
            reference_number: '33445566778',
            claim_amount: 8750.45,
            is_representative: false,
            actual_creditor: null
          },
          confidence: 0.96,
          reasoning: 'Kredit-Mahnung mit detaillierter Forderungsaufstellung',
          workflow_status: 'GLÄUBIGERDOKUMENT'
        }
      }
    ];
    
    // Add demo documents to client
    client.documents = [...client.documents, ...demoDocuments];
    
    // Update client workflow status to ready for admin review
    client.workflow_status = 'admin_review';
    client.admin_approved = false;
    client.client_confirmed_creditors = false;
    
    console.log(`✅ Added ${demoDocuments.length} demo documents for client ${clientId}`);
    
    const totalDebt = demoDocuments.reduce((sum, doc) => sum + (doc.extracted_data.creditor_data.claim_amount || 0), 0);
    
    res.json({ 
      success: true,
      message: `${demoDocuments.length} Demo-Gläubiger-Dokumente hinzugefügt`,
      documents_added: demoDocuments.length,
      total_documents: client.documents.length,
      total_debt_amount: totalDebt,
      workflow_status: client.workflow_status,
      creditor_summary: {
        total_creditors: demoDocuments.length,
        banks: ['Stadtsparkasse München', 'Landesbank Berlin AG', 'Santander Consumer Bank AG'],
        telecom: ['Deutsche Telekom AG', 'Vodafone GmbH'],
        inkasso: ['EOS Deutscher Inkasso-Dienst GmbH'],
        reference_numbers: demoDocuments.map(d => d.extracted_data.creditor_data.reference_number)
      }
    });
    
  } catch (error) {
    console.error('Error adding demo documents:', error);
    res.status(500).json({ 
      error: 'Error adding demo documents',
      details: error.message 
    });
  }
});

// =============================================================================
// DEBT AMOUNT EXTRACTION TEST ENDPOINTS
// =============================================================================

// Test debt amount extraction with sample text
app.post('/api/admin/test-debt-extraction', async (req, res) => {
  try {
    const { email_body, creditor_context } = req.body;
    
    if (!email_body) {
      return res.status(400).json({ error: 'email_body is required' });
    }
    
    console.log(`🧪 Testing debt extraction on provided email...`);
    
    const result = await debtAmountExtractor.extractDebtAmount(email_body, creditor_context);
    
    res.json({
      success: true,
      email_body: email_body.slice(0, 200) + (email_body.length > 200 ? '...' : ''),
      extraction_result: result,
      message: `Extracted amount: ${result.extracted_amount} EUR (confidence: ${result.confidence})`
    });
    
  } catch (error) {
    console.error('Error testing debt extraction:', error);
    res.status(500).json({ 
      error: 'Error testing debt extraction',
      details: error.message 
    });
  }
});

// Run full debt extraction test suite
app.get('/api/admin/test-debt-extraction-suite', async (req, res) => {
  try {
    console.log(`🧪 Running debt extraction test suite...`);
    
    const results = await debtAmountExtractor.testExtraction();
    
    const successCount = results.filter(r => r.success).length;
    const totalTests = results.length;
    
    res.json({
      success: true,
      test_results: results,
      summary: {
        tests_passed: successCount,
        tests_total: totalTests,
        success_rate: Math.round((successCount / totalTests) * 100)
      },
      message: `Test Suite Complete: ${successCount}/${totalTests} tests passed`
    });
    
  } catch (error) {
    console.error('Error running debt extraction test suite:', error);
    res.status(500).json({ 
      error: 'Error running debt extraction test suite',
      details: error.message 
    });
  }
});

// =============================================================================
// CREDITOR RESPONSE PROCESSING ENDPOINTS
// =============================================================================

// Simulate creditor responses for a client (for testing)
app.post('/api/clients/:clientId/simulate-creditor-responses', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log(`🎭 Simulating creditor responses for client ${clientId}`);
    
    const result = await creditorContactService.simulateCreditorResponses(clientId);
    
    if (result.success) {
      console.log(`✅ Simulated ${result.simulated_responses} creditor responses`);
    }
    
    res.json({
      success: result.success,
      client_reference: clientId,
      total_contacts: result.total_contacts,
      simulated_responses: result.simulated_responses,
      processed_successfully: result.processed_successfully,
      results: result.results,
      message: `${result.simulated_responses} Gläubiger-Antworten simuliert`
    });
    
  } catch (error) {
    console.error('Error simulating creditor responses:', error);
    res.status(500).json({ 
      error: 'Error simulating creditor responses',
      details: error.message 
    });
  }
});

// Process individual creditor response (manual testing)
app.post('/api/admin/process-creditor-response', async (req, res) => {
  try {
    const { email_body, reference_number, creditor_email, is_simulation = true } = req.body;
    
    if (!email_body) {
      return res.status(400).json({ error: 'email_body is required' });
    }
    
    console.log(`📧 Processing creditor response${is_simulation ? ' (TEST)' : ''}...`);
    console.log(`📋 Reference: ${reference_number || 'auto-detect'}`);
    
    const emailData = {
      body: email_body,
      subject: `Re: Gläubiger-Anfrage${reference_number ? ` - Az: ${reference_number}` : ''}`,
      sender_email: creditor_email || 'test@example.com'
    };
    
    const result = await creditorContactService.processCreditorResponse(emailData, is_simulation);
    
    res.json({
      success: result.success,
      result: result,
      message: result.success 
        ? `Antwort verarbeitet: ${result.final_amount} EUR (${result.amount_source})`
        : `Fehler: ${result.error}`
    });
    
  } catch (error) {
    console.error('Error processing creditor response:', error);
    res.status(500).json({ 
      error: 'Error processing creditor response',
      details: error.message 
    });
  }
});

// Get response processing statistics for a client
app.get('/api/clients/:clientId/response-stats', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const stats = creditorContactService.getResponseStats(clientId);
    
    res.json({
      client_reference: clientId,
      client_name: `${client.firstName} ${client.lastName}`,
      response_stats: stats,
      last_updated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting response stats:', error);
    res.status(500).json({ 
      error: 'Error getting response stats',
      details: error.message 
    });
  }
});

// Manual webhook test for creditor response
app.post('/api/admin/test-webhook-response', async (req, res) => {
  try {
    const { ticket_id, comment_body } = req.body;
    
    if (!ticket_id || !comment_body) {
      return res.status(400).json({ error: 'ticket_id and comment_body are required' });
    }
    
    console.log(`🧪 Testing webhook response processing for ticket ${ticket_id}`);
    
    const result = await creditorContactService.processIncomingCreditorResponse(ticket_id, {
      body: comment_body,
      public: true,
      via: { channel: 'email' }
    });
    
    res.json({
      success: result.success,
      ticket_id: ticket_id,
      result: result,
      message: result.success 
        ? `Webhook-Test erfolgreich: ${result.creditor_name} - ${result.final_amount} EUR`
        : `Webhook-Test fehlgeschlagen: ${result.error}`
    });
    
  } catch (error) {
    console.error('Error testing webhook response:', error);
    res.status(500).json({ 
      error: 'Error testing webhook response',
      details: error.message 
    });
  }
});

// ============================================================================
// PHASE 2: DEBT RESTRUCTURING PLAN ENDPOINTS
// ============================================================================

// Calculate garnishable income for a client
app.post('/api/clients/:clientId/calculate-garnishable-income', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { netIncome, maritalStatus, numberOfChildren } = req.body;
    
    console.log(`💰 Calculating garnishable income for client: ${clientId}`);
    console.log(`   Net income: ${netIncome} EUR`);
    console.log(`   Marital status: ${maritalStatus}`);
    console.log(`   Children: ${numberOfChildren}`);
    
    // Validate required parameters
    if (!netIncome || !maritalStatus) {
      return res.status(400).json({ 
        error: 'Missing required parameters: netIncome, maritalStatus' 
      });
    }
    
    if (netIncome <= 0) {
      return res.status(400).json({ 
        error: 'Net income must be greater than 0' 
      });
    }
    
    const validStatuses = ['ledig', 'verheiratet', 'geschieden', 'verwitwet'];
    if (!validStatuses.includes(maritalStatus)) {
      return res.status(400).json({ 
        error: `Invalid marital status. Valid values: ${validStatuses.join(', ')}` 
      });
    }
    
    // Calculate garnishable income using 2025-2026 table
    const result = garnishmentCalculator.calculate(
      parseFloat(netIncome),
      maritalStatus,
      parseInt(numberOfChildren) || 0
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Garnishment calculation failed',
        details: result.error 
      });
    }
    
    res.json({
      success: true,
      clientId: clientId,
      garnishableIncome: result.garnishableAmount,
      calculationDetails: result.calculationDetails,
      calculation_timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error calculating garnishable income:', error);
    res.status(500).json({ 
      error: 'Error calculating garnishable income',
      details: error.message 
    });
  }
});

// Get total debt from Phase 1 creditor data
app.get('/api/clients/:clientId/total-debt', (req, res) => {
  try {
    const clientId = req.params.clientId;
    
    console.log(`📊 Calculating total debt for client: ${clientId}`);
    
    const result = garnishmentCalculator.calculateTotalDebtFromCreditors(
      clientId, 
      creditorContactService
    );
    
    if (!result.success) {
      return res.status(404).json({ 
        error: 'Failed to calculate total debt',
        details: result.error 
      });
    }
    
    res.json({
      success: true,
      clientId: clientId,
      totalDebt: result.totalDebt,
      creditorCount: result.creditorCount,
      creditorSummary: result.creditorSummary,
      calculation_timestamp: result.calculation_timestamp
    });
    
  } catch (error) {
    console.error('Error calculating total debt:', error);
    res.status(500).json({ 
      error: 'Error calculating total debt',
      details: error.message 
    });
  }
});

// Calculate creditor quotas based on garnishable income
app.post('/api/clients/:clientId/calculate-creditor-quotas', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { garnishableIncome } = req.body;
    
    console.log(`💰 Calculating creditor quotas for client: ${clientId}`);
    console.log(`   Garnishable income: ${garnishableIncome} EUR`);
    
    if (!garnishableIncome && garnishableIncome !== 0) {
      return res.status(400).json({ 
        error: 'Garnishable income parameter is required' 
      });
    }

    if (garnishableIncome <= 0) {
      return res.json({
        success: true,
        clientId: clientId,
        totalDebt: 0,
        creditorCount: 0,
        garnishableIncome: garnishableIncome,
        creditorQuotas: [],
        quotasSumCheck: {
          calculated_total: 0,
          target_total: garnishableIncome,
          difference: 0,
          within_tolerance: true
        },
        message: 'Kein pfändbares Einkommen - keine Ratenzahlung möglich',
        calculation_timestamp: new Date().toISOString()
      });
    }
    
    const result = garnishmentCalculator.calculateCreditorQuotas(
      clientId,
      parseFloat(garnishableIncome),
      creditorContactService
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Quota calculation failed',
        details: result.error 
      });
    }
    
    res.json({
      success: true,
      clientId: clientId,
      totalDebt: result.totalDebt,
      creditorCount: result.creditorCount,
      garnishableIncome: result.garnishableIncome,
      creditorQuotas: result.creditorQuotas,
      quotasSumCheck: result.quotasSumCheck,
      calculation_timestamp: result.calculation_timestamp
    });
    
  } catch (error) {
    console.error('Error calculating creditor quotas:', error);
    res.status(500).json({ 
      error: 'Error calculating creditor quotas',
      details: error.message 
    });
  }
});

// Generate complete restructuring analysis (combines all calculations)
app.post('/api/clients/:clientId/restructuring-analysis', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { netIncome, maritalStatus, numberOfChildren } = req.body;
    
    console.log(`📋 Generating complete restructuring analysis for client: ${clientId}`);
    
    // Validate required parameters
    if (!netIncome || !maritalStatus) {
      return res.status(400).json({ 
        error: 'Missing required parameters: netIncome, maritalStatus' 
      });
    }
    
    const financialData = {
      netIncome: parseFloat(netIncome),
      maritalStatus: maritalStatus,
      numberOfChildren: parseInt(numberOfChildren) || 0
    };
    
    const result = garnishmentCalculator.generateRestructuringAnalysis(
      clientId,
      financialData,
      creditorContactService
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Restructuring analysis failed',
        details: result.error 
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error generating restructuring analysis:', error);
    res.status(500).json({ 
      error: 'Error generating restructuring analysis',
      details: error.message 
    });
  }
});

// Create demo creditor contacts for Phase 2 testing
app.post('/api/test/create-demo-creditor-contacts/:clientId', (req, res) => {
  try {
    const clientId = req.params.clientId;
    
    console.log(`📋 Creating demo creditor contacts for client: ${clientId}`);
    
    // Create demo creditor contacts directly in creditorContactService
    const demoContacts = [
      {
        id: 'demo-contact-1',
        client_reference: clientId,
        creditor_name: 'Stadtsparkasse München',
        creditor_email: 'forderungen@stadtsparkasse-muenchen.de',
        creditor_address: 'Sparkassenstraße 2, 80331 München',
        reference_number: '57852774001',
        original_claim_amount: 2500.00,
        document_ids: ['demo-doc-1'],
        
        // Response processing results (simulated)
        contact_status: 'responded',
        response_received_at: new Date().toISOString(),
        current_debt_amount: 2750.50,
        creditor_response_text: 'Aktuelle Forderung: 2.750,50 EUR inkl. Zinsen und Kosten.',
        final_debt_amount: 2750.50,
        amount_source: 'creditor_response',
        extraction_confidence: 0.95,
        
        // Timestamps
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'demo-contact-2',
        client_reference: clientId,
        creditor_name: 'Telekom Deutschland GmbH',
        creditor_email: 'inkasso@telekom.de',
        creditor_address: 'Friedrich-Ebert-Allee 140, 53113 Bonn',
        reference_number: '88997766001',
        original_claim_amount: 345.67,
        document_ids: ['demo-doc-2'],
        
        contact_status: 'responded',
        response_received_at: new Date().toISOString(),
        current_debt_amount: 410.20,
        creditor_response_text: 'Gesamtforderung: 410,20 EUR (Hauptforderung + Mahnkosten)',
        final_debt_amount: 410.20,
        amount_source: 'creditor_response',
        extraction_confidence: 0.88,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'demo-contact-3',
        client_reference: clientId,
        creditor_name: 'ABC Inkasso GmbH',
        creditor_email: 'forderungsmanagement@abc-inkasso.de',
        creditor_address: 'Inkassostraße 15, 60311 Frankfurt',
        reference_number: '99888777666',
        original_claim_amount: 1200.00,
        document_ids: ['demo-doc-3'],
        
        contact_status: 'timeout',
        response_received_at: null,
        current_debt_amount: null,
        creditor_response_text: null,
        final_debt_amount: 1200.00, // Using original amount due to timeout
        amount_source: 'original_document',
        extraction_confidence: 0.0,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'demo-contact-4',
        client_reference: clientId,
        creditor_name: 'Landesbank Berlin AG',
        creditor_email: 'kreditkarten@lbb.de',
        creditor_address: 'Alexanderplatz 2, 10178 Berlin',
        reference_number: '11223344556',
        original_claim_amount: 3450.80,
        document_ids: ['demo-doc-4'],
        
        contact_status: 'responded',
        response_received_at: new Date().toISOString(),
        current_debt_amount: 3650.95,
        creditor_response_text: 'Aktuelle Kreditkartenschuld: 3.650,95 EUR inklusive Verzugszinsen.',
        final_debt_amount: 3650.95,
        amount_source: 'creditor_response',
        extraction_confidence: 0.93,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'demo-contact-5',
        client_reference: clientId,
        creditor_name: 'Vodafone GmbH',
        creditor_email: 'rechnung@vodafone.de',
        creditor_address: 'Ferdinand-Braun-Platz 1, 40549 Düsseldorf',
        reference_number: '77888999000',
        original_claim_amount: 189.95,
        document_ids: ['demo-doc-5'],
        
        contact_status: 'responded',
        response_received_at: new Date().toISOString(),
        current_debt_amount: 220.45,
        creditor_response_text: 'Offener Betrag: 220,45 EUR für Mobilfunk-Dienste.',
        final_debt_amount: 220.45,
        amount_source: 'creditor_response',
        extraction_confidence: 0.91,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'demo-contact-6',
        client_reference: clientId,
        creditor_name: 'Santander Consumer Bank AG',
        creditor_email: 'inkasso@santander.de',
        creditor_address: 'Santander-Platz 1, 41061 Mönchengladbach',
        reference_number: '33445566778',
        original_claim_amount: 8750.45,
        document_ids: ['demo-doc-6'],
        
        contact_status: 'response_unclear',
        response_received_at: new Date().toISOString(),
        current_debt_amount: 0, // Unclear response
        creditor_response_text: 'Wir prüfen Ihre Anfrage und melden uns zeitnah.',
        final_debt_amount: 8750.45, // Using original amount due to unclear response
        amount_source: 'original_document',
        extraction_confidence: 0.1,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    // Add contacts to creditorContactService
    for (const contact of demoContacts) {
      creditorContactService.creditorContacts.set(contact.id, contact);
    }
    
    const totalDebt = demoContacts.reduce((sum, contact) => sum + contact.final_debt_amount, 0);
    
    console.log(`✅ Created ${demoContacts.length} demo creditor contacts`);
    console.log(`💰 Total debt: ${totalDebt} EUR`);
    
    res.json({
      success: true,
      client_id: clientId,
      contacts_created: demoContacts.length,
      total_debt: totalDebt,
      contacts: demoContacts.map(c => ({
        id: c.id,
        creditor_name: c.creditor_name,
        reference_number: c.reference_number,
        final_debt_amount: c.final_debt_amount,
        contact_status: c.contact_status
      }))
    });
    
  } catch (error) {
    console.error('Error creating demo creditor contacts:', error);
    res.status(500).json({ 
      error: 'Error creating demo creditor contacts',
      details: error.message 
    });
  }
});

// Test garnishment calculator
app.get('/api/test/garnishment-calculator', (req, res) => {
  try {
    console.log('🧪 Testing garnishment calculator...');
    
    const testPassed = garnishmentCalculator.testCalculator();
    
    res.json({
      success: true,
      testPassed: testPassed,
      message: testPassed ? 'All tests passed!' : 'Some tests failed - check server logs',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error testing garnishment calculator:', error);
    res.status(500).json({ 
      error: 'Error testing garnishment calculator',
      details: error.message 
    });
  }
});

// Get client financial overview (combines Phase 1 data with Phase 2 calculations)
app.get('/api/clients/:clientId/financial-overview', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log(`📊 Generating financial overview for client: ${clientId}`);
    
    // Get creditor contact status
    const creditorStatus = await creditorContactService.getClientCreditorStatus(clientId);
    
    // Get total debt calculation
    const debtResult = garnishmentCalculator.calculateTotalDebtFromCreditors(
      clientId, 
      creditorContactService
    );
    
    const overview = {
      client_info: {
        id: clientId,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        phone: client.phone,
        workflow_status: client.workflow_status
      },
      
      // Phase 1 status
      document_processing: {
        total_documents: client.documents.length,
        creditor_documents: client.documents.filter(d => d.document_status === 'creditor_confirmed').length,
        admin_approved: client.admin_approved,
        client_confirmed: client.client_confirmed_creditors
      },
      
      // Creditor communication status
      creditor_communication: {
        zendesk_sync_status: creditorStatus.sync_info ? 'completed' : 'not_started',
        creditor_contacts: creditorStatus.creditor_contacts.length,
        emails_sent: creditorStatus.summary.emails_sent,
        responses_received: creditorStatus.summary.responses_received,
        main_ticket_id: creditorStatus.main_ticket_id
      },
      
      // Debt analysis
      debt_analysis: debtResult.success ? {
        total_debt: debtResult.totalDebt,
        creditor_count: debtResult.creditorCount,
        creditor_breakdown: debtResult.creditorSummary,
        ready_for_restructuring: debtResult.totalDebt > 0 && debtResult.creditorCount > 0
      } : {
        error: debtResult.error,
        ready_for_restructuring: false
      },
      
      // Next steps
      next_steps: {
        phase_1_complete: client.client_confirmed_creditors && creditorStatus.summary.emails_sent > 0,
        ready_for_phase_2: debtResult.success && debtResult.totalDebt > 0,
        needs_financial_data: true, // Would check if financial data is already saved
        needs_garnishment_calculation: true
      }
    };
    
    res.json(overview);
    
  } catch (error) {
    console.error('Error generating financial overview:', error);
    res.status(500).json({ 
      error: 'Error generating financial overview',
      details: error.message 
    });
  }
});

// ================================
// Phase 2 Test Data Endpoints
// ================================

// Get test data statistics
app.get('/api/test/phase2/stats', (req, res) => {
  try {
    console.log('📊 Getting test data statistics...');
    
    const stats = testDataService.getTestDataStats();
    
    res.json({
      success: true,
      stats: stats,
      message: 'Test data statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error getting test data stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get test data statistics',
      details: error.message
    });
  }
});

// Get all financial profiles
app.get('/api/test/phase2/financial-profiles', (req, res) => {
  try {
    console.log('👥 Getting all financial profiles...');
    
    const profiles = testDataService.getAllFinancialProfiles();
    
    res.json({
      success: true,
      profiles: profiles,
      count: profiles.length,
      message: 'Financial profiles retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error getting financial profiles:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get financial profiles',
      details: error.message
    });
  }
});

// Get specific financial profile
app.get('/api/test/phase2/financial-profiles/:profileId', (req, res) => {
  try {
    const profileId = req.params.profileId;
    console.log(`👤 Getting financial profile: ${profileId}`);
    
    const profile = testDataService.getFinancialProfile(profileId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `Financial profile '${profileId}' not found`
      });
    }
    
    res.json({
      success: true,
      profile: profile,
      message: 'Financial profile retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error getting financial profile:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get financial profile',
      details: error.message
    });
  }
});

// Test financial profile with garnishment calculator
app.post('/api/test/phase2/test-financial-profile/:profileId', (req, res) => {
  try {
    const profileId = req.params.profileId;
    console.log(`🧪 Testing financial profile: ${profileId}`);
    
    const profile = testDataService.getFinancialProfile(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `Financial profile '${profileId}' not found`
      });
    }
    
    // Run calculation
    const result = garnishmentCalculator.calculate(
      profile.client_data.netIncome,
      profile.client_data.maritalStatus,
      profile.client_data.numberOfChildren
    );
    
    // Validate results
    const validation = testDataService.validateResults(
      { garnishableIncome: result.garnishableAmount },
      profile.expected_results
    );
    
    res.json({
      success: true,
      profile: profile,
      calculation_result: result,
      validation: validation,
      message: validation.valid ? 'Test passed successfully' : 'Test validation failed'
    });
    
  } catch (error) {
    console.error('❌ Error testing financial profile:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to test financial profile',
      details: error.message
    });
  }
});

// Run all financial profile tests
app.get('/api/test/phase2/run-financial-tests', (req, res) => {
  try {
    console.log('🧪 Running all financial profile tests...');
    
    const testResults = testDataService.runFinancialProfileTests(
      (netIncome, maritalStatus, numberOfChildren) => 
        garnishmentCalculator.calculate(netIncome, maritalStatus, numberOfChildren)
    );
    
    res.json({
      success: true,
      test_results: testResults,
      message: `Financial tests completed: ${testResults.passed}/${testResults.total} passed`
    });
    
  } catch (error) {
    console.error('❌ Error running financial tests:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to run financial tests',
      details: error.message
    });
  }
});

// Create test client with complete workflow data
app.post('/api/test/phase2/create-test-client/:testCaseId', (req, res) => {
  try {
    const testCaseId = req.params.testCaseId;
    console.log(`🏗️ Creating test client for case: ${testCaseId}`);
    
    const testData = testDataService.createTestClient(testCaseId);
    const clientId = testData.clientData.id;
    
    // Add to clients data
    clientsData[clientId] = testData.clientData;
    
    // Add creditor contacts to service
    creditorContactService.creditorContacts = testData.creditorContacts;
    
    console.log(`✅ Test client created: ${clientId}`);
    
    res.json({
      success: true,
      client_id: clientId,
      client_data: testData.clientData,
      creditor_contacts: Array.from(testData.creditorContacts.values()),
      test_case: testData.testCase,
      message: `Test client '${clientId}' created successfully`
    });
    
  } catch (error) {
    console.error('❌ Error creating test client:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create test client',
      details: error.message
    });
  }
});

// Run complete integration test
app.post('/api/test/phase2/run-integration-test/:testCaseId', async (req, res) => {
  try {
    const testCaseId = req.params.testCaseId;
    console.log(`🔬 Running integration test: ${testCaseId}`);
    
    // Create test client
    const testData = testDataService.createTestClient(testCaseId);
    const clientId = testData.clientData.id;
    
    // Temporarily add to system
    clientsData[clientId] = testData.clientData;
    creditorContactService.creditorContacts = testData.creditorContacts;
    
    try {
      // Run garnishment calculation
      const garnishmentResult = garnishmentCalculator.calculateGarnishableIncome2025(
        testData.clientData.financial_data.netIncome,
        testData.clientData.financial_data.maritalStatus,
        testData.clientData.financial_data.numberOfChildren
      );
      
      // Run creditor quota calculation
      const quotasResult = garnishmentCalculator.calculateCreditorQuotas(
        clientId,
        garnishmentResult.garnishableAmount,
        creditorContactService
      );
      
      // Generate restructuring analysis
      const analysisResult = garnishmentCalculator.generateRestructuringAnalysis(
        clientId,
        testData.clientData.financial_data,
        creditorContactService
      );
      
      // Validate results
      const validation = testDataService.validateResults(
        {
          totalDebt: quotasResult.totalDebt,
          garnishableIncome: garnishmentResult.garnishableAmount,
          creditorQuotas: quotasResult.creditorQuotas,
          quotasSumCheck: quotasResult.quotasSumCheck
        },
        testData.testCase.expected_calculations
      );
      
      res.json({
        success: true,
        test_case_id: testCaseId,
        client_id: clientId,
        results: {
          garnishment: garnishmentResult,
          creditor_quotas: quotasResult,
          restructuring_analysis: analysisResult
        },
        validation: validation,
        message: validation.valid ? 'Integration test passed' : 'Integration test failed validation'
      });
      
    } finally {
      // Clean up test data
      delete clientsData[clientId];
      creditorContactService.creditorContacts.clear();
    }
    
  } catch (error) {
    console.error('❌ Error running integration test:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to run integration test',
      details: error.message
    });
  }
});

// Get creditor response scenarios
app.get('/api/test/phase2/creditor-scenarios', (req, res) => {
  try {
    console.log('🏛️ Getting creditor scenarios...');
    
    const scenarios = testDataService.creditorResponses?.test_scenarios || [];
    
    res.json({
      success: true,
      scenarios: scenarios,
      count: scenarios.length,
      message: 'Creditor scenarios retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error getting creditor scenarios:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get creditor scenarios',
      details: error.message
    });
  }
});

// Get workflow test cases
app.get('/api/test/phase2/workflow-tests', (req, res) => {
  try {
    console.log('🔗 Getting workflow test cases...');
    
    const testCases = testDataService.integrationTestCases?.complete_workflow_tests || [];
    
    res.json({
      success: true,
      test_cases: testCases,
      count: testCases.length,
      message: 'Workflow test cases retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error getting workflow tests:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow tests',
      details: error.message
    });
  }
});

// Test 2025-2026 garnishment calculator with edge cases
app.get('/api/test/phase2/garnishment-edge-cases', (req, res) => {
  try {
    console.log('⚡ Testing garnishment calculator edge cases...');
    
    const edgeCases = [
      // Below threshold
      { income: 1559, marital: 'ledig', children: 0, expected: 0 },
      // Exactly at threshold
      { income: 1560, marital: 'ledig', children: 0, expected: 3.50 },
      // Full garnishment threshold
      { income: 4767, marital: 'ledig', children: 0, expected: 4767 },
      // Above full garnishment
      { income: 5000, marital: 'ledig', children: 0, expected: 5000 },
      // Large family protection
      { income: 3000, marital: 'verheiratet', children: 5, expected: 0 }
    ];
    
    const results = edgeCases.map(testCase => {
      const result = garnishmentCalculator.calculate(
        testCase.income,
        testCase.marital,
        testCase.children
      );
      
      const passed = Math.abs(result.garnishableAmount - testCase.expected) < 0.01;
      
      return {
        input: testCase,
        actual_result: result.garnishableAmount,
        expected: testCase.expected,
        passed: passed,
        difference: Math.abs(result.garnishableAmount - testCase.expected)
      };
    });
    
    const passedCount = results.filter(r => r.passed).length;
    
    res.json({
      success: true,
      edge_case_results: results,
      summary: {
        total_tests: results.length,
        passed: passedCount,
        failed: results.length - passedCount
      },
      message: `Edge case tests completed: ${passedCount}/${results.length} passed`
    });
    
  } catch (error) {
    console.error('❌ Error testing edge cases:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to test edge cases',
      details: error.message
    });
  }
});

// Process documents to final creditor list (missing workflow step)
app.post('/api/clients/:clientId/process-documents-to-creditors', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    console.log(`📋 Processing documents to final creditor list for client: ${clientId}`);

    // Find all completed creditor documents
    const creditorDocs = client.documents.filter(doc => 
      doc.document_status === 'creditor_confirmed' && 
      doc.processing_status === 'completed' &&
      doc.extracted_data &&
      doc.extracted_data.creditor_data
    );

    console.log(`Found ${creditorDocs.length} creditor documents`);

    // Generate creditor list from documents
    const newCreditors = creditorDocs.map((doc, index) => {
      const creditorData = doc.extracted_data.creditor_data;
      return {
        id: `creditor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender_name: creditorData.sender_name,
        sender_address: creditorData.sender_address,
        sender_email: creditorData.sender_email,
        reference_number: creditorData.reference_number,
        claim_amount: creditorData.claim_amount,
        is_representative: creditorData.is_representative,
        actual_creditor: creditorData.actual_creditor,
        source_document: doc.name,
        source_document_id: doc.id,
        ai_confidence: doc.confidence,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString()
      };
    });

    // Update client data
    client.final_creditor_list = newCreditors;
    client.workflow_status = 'admin_review';

    console.log(`✅ Generated ${newCreditors.length} creditors in final list`);

    return res.json({
      success: true,
      message: `Processed ${creditorDocs.length} documents to ${newCreditors.length} creditors`,
      creditors_generated: newCreditors.length,
      workflow_status: client.workflow_status,
      creditors: newCreditors.map(c => ({
        name: c.sender_name,
        amount: c.claim_amount,
        reference: c.reference_number
      }))
    });

  } catch (error) {
    console.error('❌ Error processing documents to creditors:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process documents to creditors',
      details: error.message
    });
  }
});

// Fix missing creditor contacts for any client
app.post('/api/clients/:clientId/fix-creditor-contacts', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = clientsData[clientId];
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    console.log(`🔧 Fixing creditor contacts for client: ${clientId}`);

    // Generate creditor contacts from final_creditor_list
    if (client.final_creditor_list && client.final_creditor_list.length > 0) {
      client.final_creditor_list.forEach((creditor, index) => {
        const contactId = `${clientId}-contact-${index + 1}`;
        
        // Create creditor contact entry
        creditorContactService.creditorContacts.set(contactId, {
          id: contactId,
          client_reference: clientId,
          creditor_name: creditor.sender_name || creditor.creditor_name,
          creditor_email: creditor.sender_email || creditor.creditor_email || `${(creditor.sender_name || creditor.creditor_name).toLowerCase().replace(/\s+/g, '.')}@example.com`,
          reference_number: creditor.reference_number,
          contact_status: 'completed',
          final_debt_amount: creditor.claim_amount || creditor.estimated_amount || 0,
          amount_source: 'creditor_confirmed',
          response_received_date: new Date().toISOString(),
          response_data: {
            creditor_name: creditor.sender_name || creditor.creditor_name,
            extracted_data: {
              final_debt_amount: creditor.claim_amount || creditor.estimated_amount || 0
            }
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });

      console.log(`✅ Created ${client.final_creditor_list.length} creditor contacts`);

      return res.json({
        success: true,
        message: `Fixed creditor contacts for client ${clientId}`,
        contacts_created: client.final_creditor_list.length,
        client_status: client.workflow_status
      });
    } else {
      return res.json({
        success: false,
        error: 'No creditors found in final_creditor_list',
        client_status: client.workflow_status
      });
    }

  } catch (error) {
    console.error('❌ Error fixing creditor contacts:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fix creditor contacts',
      details: error.message
    });
  }
});

// Initialize demo data for client 12345
app.post('/api/test/phase2/init-demo-client', (req, res) => {
  try {
    const clientId = '12345';
    console.log('🚀 Initializing demo data for client 12345...');
    
    // Create test client with high debt scenario
    const testData = testDataService.createTestClient('standard_debt_restructuring');
    
    // Update existing client 12345 with financial data
    if (clientsData[clientId]) {
      clientsData[clientId].financial_data = testData.clientData.financial_data;
      clientsData[clientId].phase = 2;
      clientsData[clientId].workflow_status = 'creditor_contact_completed';
    }
    
    // Add creditor contacts to service for client 12345
    const demoCreditorContacts = testDataService.generateMockCreditorContacts(clientId, 'high_debt_multiple_creditors');
    
    // Add contacts to the service
    demoCreditorContacts.forEach((contact, contactId) => {
      creditorContactService.creditorContacts.set(contactId, contact);
    });
    
    console.log(`✅ Demo client initialized with ${demoCreditorContacts.size} creditor contacts`);
    
    res.json({
      success: true,
      client_id: clientId,
      creditor_contacts_added: demoCreditorContacts.size,
      financial_data: clientsData[clientId]?.financial_data,
      message: 'Demo client 12345 initialized successfully'
    });
    
  } catch (error) {
    console.error('❌ Error initializing demo client:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize demo client',
      details: error.message
    });
  }
});

// Reset test data (clear all creditor contacts)
app.post('/api/test/phase2/reset', (req, res) => {
  try {
    console.log('🔄 Resetting test data...');
    
    // Clear creditor contacts
    creditorContactService.creditorContacts.clear();
    
    // Reset client 12345 to default state
    if (clientsData['12345']) {
      delete clientsData['12345'].financial_data;
      clientsData['12345'].phase = 1;
      clientsData['12345'].workflow_status = 'documents_processing';
    }
    
    res.json({
      success: true,
      message: 'Test data reset successfully'
    });
    
  } catch (error) {
    console.error('❌ Error resetting test data:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset test data',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
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

// Start server with database initialization
async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`💾 Database: ${databaseService.isHealthy() ? 'MongoDB Connected' : 'In-Memory Fallback'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Admin: Enhanced Dashboard Status (inline for consistent auth)
app.get('/api/admin/dashboard-status', 
  rateLimits.admin,
  authenticateAdmin,
  async (req, res) => {
  try {
    console.log('📊 Dashboard Status: Getting enhanced client statuses');

    const clients = await Client.find({}).sort({ updated_at: -1 });
    
    const clientStatuses = clients.map(client => {
      const status = getClientDisplayStatus(client);
      
      return {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        created_at: client.created_at,
        updated_at: client.updated_at,
        
        // Enhanced status info
        payment: status.payment,
        documents: status.documents,
        processing: status.processing,
        review: status.review,
        overall_status: status.overall_status,
        
        // Raw data for detailed views
        first_payment_received: client.first_payment_received,
        payment_ticket_type: client.payment_ticket_type,
        current_status: client.current_status,
        documents_count: client.documents?.length || 0,
        creditors_count: client.final_creditor_list?.length || 0,
        
        // Timestamps
        payment_processed_at: client.payment_processed_at,
        document_request_sent_at: client.document_request_sent_at,
        all_documents_processed_at: client.all_documents_processed_at,
        
        // Actions needed
        needs_attention: status.needs_attention,
        next_action: status.next_action
      };
    });

    // Statistics
    const stats = {
      total_clients: clients.length,
      payment_confirmed: clients.filter(c => c.first_payment_received).length,
      awaiting_documents: clients.filter(c => c.payment_ticket_type === 'document_request').length,
      processing: clients.filter(c => c.payment_ticket_type === 'processing_wait').length,
      manual_review_needed: clients.filter(c => c.payment_ticket_type === 'manual_review').length,
      auto_approved: clients.filter(c => c.payment_ticket_type === 'auto_approved').length,
      no_creditors: clients.filter(c => c.payment_ticket_type === 'no_creditors_found').length,
      needs_attention: clientStatuses.filter(c => c.needs_attention).length
    };

    res.json({
      success: true,
      clients: clientStatuses,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting dashboard status:', error);
    res.status(500).json({
      error: 'Failed to get dashboard status',
      details: error.message
    });
  }
});

// Helper function for client display status
function getClientDisplayStatus(client) {
  const documents = client.documents || [];
  const creditors = client.final_creditor_list || [];
  
  const status = {
    payment: client.first_payment_received ? '✅ Bezahlt' : '❌ Ausstehend',
    documents: `${documents.length} Dokumente`,
    processing: 'Unbekannt',
    review: 'Ausstehend',
    overall_status: 'created',
    needs_attention: false,
    next_action: 'Warten auf erste Rate'
  };
  
  // Calculate processing status
  if (documents.length === 0) {
    status.processing = '❌ Keine Dokumente';
  } else {
    const completed = documents.filter(d => d.processing_status === 'completed');
    const processing = documents.filter(d => d.processing_status === 'processing');
    
    if (completed.length === documents.length) {
      status.processing = '✅ Abgeschlossen';
    } else if (processing.length > 0) {
      status.processing = `⏳ ${completed.length}/${documents.length}`;
    } else {
      status.processing = `📋 ${completed.length}/${documents.length}`;
    }
  }
  
  // Calculate review status based on payment state
  if (!client.first_payment_received) {
    status.overall_status = 'awaiting_payment';
    status.review = '💰 Warte auf erste Rate';
    status.next_action = 'Warten auf erste Rate';
  } else if (client.payment_ticket_type) {
    switch(client.payment_ticket_type) {
      case 'document_request':
        status.overall_status = 'awaiting_documents';
        status.review = '📄 Warte auf Dokumente';
        status.next_action = 'Mandant kontaktieren - Dokumente anfordern';
        status.needs_attention = true;
        break;
        
      case 'processing_wait':
        status.overall_status = 'processing';
        status.review = '⏳ AI verarbeitet';
        status.next_action = 'Warten auf AI-Verarbeitung';
        break;
        
      case 'manual_review':
        status.overall_status = 'manual_review';
        status.review = '🔍 Manuelle Prüfung';
        status.next_action = 'Manuelle Gläubiger-Prüfung durchführen';
        status.needs_attention = true;
        break;
        
      case 'auto_approved':
        status.overall_status = 'ready_for_confirmation';
        status.review = '✅ Bereit zur Bestätigung';
        status.next_action = 'Gläubigerliste an Mandant senden';
        status.needs_attention = true;
        break;
        
      case 'no_creditors_found':
        status.overall_status = 'problem';
        status.review = '⚠️ Keine Gläubiger';
        status.next_action = 'Dokumente manuell prüfen';
        status.needs_attention = true;
        break;
        
      default:
        status.overall_status = 'unknown';
        status.review = '❓ Unbekannt';
        status.next_action = 'Status prüfen';
        status.needs_attention = true;
    }
  } else {
    // Payment received but no ticket type set yet (should not happen with new system)
    status.overall_status = 'payment_confirmed';
    status.review = '✅ Zahlung bestätigt';
    status.next_action = 'System prüfen - Ticket-Typ fehlt';
    status.needs_attention = true;
  }
  
  return status;
}

// Handle graceful shutdown
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

// Export for other services
module.exports = { app, clientsData, getClient, saveClient };