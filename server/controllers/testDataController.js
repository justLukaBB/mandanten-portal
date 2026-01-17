const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/**
 * Controller for Test Data and Demo Simulation
 * Requires injection of:
 * - testDataService
 * - creditorContactService
 * - clientsData (if still needed, though legacy?)
 * - Client
 * - Agent (for create-agent)
 */
class TestDataController {
    constructor({ testDataService, creditorContactService, clientsData, Client, Agent }) {
        this.testDataService = testDataService;
        this.creditorContactService = creditorContactService;
        this.clientsData = clientsData; // Keeping for now if tests rely on in-memory state manipulation, but should migrate
        this.Client = Client; // Not used in ported code? Wait, init-demo-client used clientsData extensively.
        this.Agent = Agent;
    }

    /**
     * Initialize demo data for client 12345
     * POST /api/test/phase2/init-demo-client
     */
    initDemoClient = async (req, res) => {
        try {
            const clientId = '12345';
            console.log('🚀 Initializing demo data for client 12345...');

            if (!this.testDataService) {
                return res.status(500).json({ error: 'testDataService not initialized' });
            }

            // Create test client with high debt scenario
            const testData = this.testDataService.createTestClient('standard_debt_restructuring');

            // Update existing client 12345 with financial data
            // Note: Server.js used clientsData[clientId] directly. 
            // If we are strictly MongoDB now, we should update DB.
            // But phase 2 tests might be in-memory dependent?
            // "ALL OLD IN-MEMORY STORAGE REMOVED" comment in server.js implies we should use DB.
            // However, this specific route explicitly manipulated `clientsData`.
            // Let's support both or just DB if possible.
            // If I look at server.js: 1157: clientsData[clientId].financial_data = ...
            // If clientsData is a proxy throwing errors (as seen in server.js line 438), then this code would FAIL in server.js too!
            // Wait, server.js line 438: `const clientsData = new Proxy({}, ...)`
            // So `clientsData[clientId]` would throw!
            // This means the inline code I saw in server.js (1148-1189) was dead/broken code if accessed?
            // OR `clientsData` variable was shadowed?
            // In server.js line 438 it is global.
            // But line 1148 is inside app.post.
            // If I ported the code exactly, it would break.
            // Conclusion: This test endpoint was likely for the old in-memory version and might be broken or needs DB update.
            // I will implement it to update DB instead.

            // Fetch generic '12345' from DB or create it?
            let client = null;
            if (this.Client) {
                client = await this.Client.findOne({ id: clientId });
                if (!client) {
                    // create dummy if missing?
                    client = new this.Client({ id: clientId, aktenzeichen: 'DEMO-12345', email: 'demo@example.com' });
                }

                client.financial_data = testData.clientData.financial_data;
                client.phase = 2;
                client.workflow_status = 'creditor_contact_completed';
                await client.save();
            }

            // Add creditor contacts to service for client 12345
            const demoCreditorContacts = this.testDataService.generateMockCreditorContacts(clientId, 'high_debt_multiple_creditors');

            // Add contacts to the service
            demoCreditorContacts.forEach((contact, contactId) => {
                this.creditorContactService.creditorContacts.set(contactId, contact);
            });

            console.log(`✅ Demo client initialized with ${demoCreditorContacts.size} creditor contacts`);

            res.json({
                success: true,
                client_id: clientId,
                creditor_contacts_added: demoCreditorContacts.size,
                financial_data: testData.clientData.financial_data,
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
    }

    /**
     * Reset test data
     * POST /api/test/phase2/reset
     */
    resetTestData = async (req, res) => {
        try {
            console.log('🔄 Resetting test data...');

            // Clear creditor contacts
            this.creditorContactService.creditorContacts.clear();

            // Reset client 12345 to default state
            if (this.Client) {
                const client = await this.Client.findOne({ id: '12345' });
                if (client) {
                    client.financial_data = undefined;
                    client.phase = 1;
                    client.workflow_status = 'documents_processing';
                    await client.save();
                }
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
    }

    /**
     * Create test agent
     * POST /api/test/create-agent
     */
    createTestAgent = async (req, res) => {
        try {
            // Check if test agent already exists
            let testAgent = await this.Agent.findOne({ username: 'test2' });

            if (testAgent) {
                console.log('✅ Test agent already exists');
                return res.json({
                    success: true,
                    message: 'Test agent already exists',
                    credentials: {
                        username: 'test2',
                        password: 'testpassword123'
                    }
                });
            }

            // Create test agent
            const hashedPassword = await bcrypt.hash('testpassword123', 12);

            testAgent = new this.Agent({
                id: uuidv4(),
                username: 'test2',
                email: 'test2@example.com',
                password_hash: hashedPassword,
                first_name: 'Test',
                last_name: 'Agent',
                role: 'agent',
                is_active: true
            });

            await testAgent.save();

            console.log('✅ Test agent created successfully');

            res.json({
                success: true,
                message: 'Test agent created successfully',
                credentials: {
                    username: 'test2',
                    password: 'testpassword123'
                }
            });

        } catch (error) {
            console.error('❌ Error creating test agent:', error);
            res.status(500).json({
                error: 'Failed to create test agent',
                details: error.message
            });
        }
    }

    /**
     * List available documents (for debugging)
     * GET /api/documents-list
     */
    getDocumentsList = (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            // assuming uploadsDir or documents dir is standard. 
            // In server.js it was path.join(__dirname, 'documents')
            // Here __dirname is inside controllers/ so we need ../documents
            const documentsDir = path.join(__dirname, '../documents');

            if (!fs.existsSync(documentsDir)) {
                return res.json({ success: true, count: 0, documents: [], message: 'Documents directory not found' });
            }

            const files = fs.readdirSync(documentsDir).filter(file => file.endsWith('.docx'));
            const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com';

            const documentUrls = files.map(filename => ({
                filename,
                url: `${baseUrl}/documents/${filename}`,
                size: fs.statSync(path.join(documentsDir, filename)).size
            }));

            res.json({
                success: true,
                count: files.length,
                documents: documentUrls,
                documentsDir: documentsDir,
                baseUrl: baseUrl
            });
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Test document access
     * GET /api/test-document
     */
    testDocumentAccess = (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const testFile = path.join(__dirname, '../documents', 'TEST_Schuldenbereinigungsplan.docx');

            if (fs.existsSync(testFile)) {
                const stats = fs.statSync(testFile);
                res.json({
                    success: true,
                    message: 'TEST document exists',
                    file: testFile,
                    size: stats.size,
                    testUrl: `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/documents/TEST_Schuldenbereinigungsplan.docx`
                });
            } else {
                res.json({
                    success: false,
                    message: 'TEST document not found',
                    file: testFile
                });
            }
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }
    }

}

module.exports = TestDataController;
