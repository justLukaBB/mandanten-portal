/**
 * Factory to create Admin Test Controller
 * @param {Object} dependencies
 * @param {Object} dependencies.debtAmountExtractor - Service for extracting debt amounts
 * @param {Object} dependencies.creditorContactService - Service for creditor communications
 * @param {Object} dependencies.garnishmentCalculator - Service for garnishment calculations
 * @param {Object} dependencies.clientsData - In-memory clients data (Legacy/Cache)
 * @param {Object} dependencies.testDataService - Service for managing test data and scenarios
 */
const createAdminTestController = ({ debtAmountExtractor, creditorContactService, garnishmentCalculator, clientsData, testDataService, financialDataReminderService, safeClientUpdate, getClient, Client }) => {
    return {
        // --- Phase 2 Simulation & Test Data Endpoints ---

        // Test Zendesk Connection
        testZendeskConnection: async (req, res) => {
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
        },

        // Add demo documents for testing
        addDemoDocuments: (req, res) => {
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
                                name: 'Stadtsparkasse München',
                                address: 'Sparkassenstraße 2, 80331 München',
                                amount: 2500.00,
                                iban: 'DE12345678901234567890',
                                reference: '57852774001'
                            },
                            ocr_text_snippet: '...'
                        }
                    },
                    {
                        id: 'demo-doc-2',
                        name: 'Telekom_Rechnung_Mai.pdf',
                        filename: 'demo-telekom-rechnung.pdf',
                        type: 'application/pdf',
                        size: 85400,
                        uploadedAt: new Date().toISOString(),
                        processing_status: 'completed',
                        document_status: 'creditor_confirmed',
                        status_reason: 'KI: Gläubigerdokument bestätigt',
                        is_duplicate: false,
                        confidence: 0.88,
                        extracted_data: {
                            creditor_data: {
                                name: 'Telekom Deutschland GmbH',
                                address: 'Friedrich-Ebert-Allee 140, 53113 Bonn',
                                amount: 345.67,
                                reference: '88997766001'
                            },
                            ocr_text_snippet: '...'
                        }
                    }
                ];

                if (!client.documents) {
                    client.documents = [];
                }

                // Add demo docs
                client.documents.push(...demoDocuments);

                // Also populate final_creditor_list if empty (for Phase 2 testing)
                if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
                    client.final_creditor_list = [
                        {
                            id: 'cred_demo_1',
                            sender_name: 'Stadtsparkasse München',
                            claim_amount: 2500.00,
                            document_id: 'demo-doc-1',
                            contact_status: 'pending',
                            created_via: 'extraction'
                        },
                        {
                            id: 'cred_demo_2',
                            sender_name: 'Telekom Deutschland GmbH',
                            claim_amount: 345.67,
                            document_id: 'demo-doc-2',
                            contact_status: 'pending',
                            created_via: 'extraction'
                        }
                    ];
                }

                res.json({
                    success: true,
                    message: 'Demo documents added successfully',
                    documents_added: demoDocuments.length
                });

            } catch (error) {
                console.error('Error adding demo documents:', error);
                res.status(500).json({
                    error: 'Error adding demo documents',
                    details: error.message
                });
            }
        },

        // Admin: Simulate 30-day period
        simulateThirtyDayPeriod: async (req, res) => {
            try {
                const clientId = req.params.clientId;

                // Flexible client retrieval (cache or DB)
                const client = await (getClient ? getClient(clientId) : Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] }));

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                console.log(`🕐 30-Day Simulation: Creating creditor calculation table for ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);

                // Check if client has final_creditor_list
                if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
                    return res.status(400).json({
                        error: 'No creditors found for calculation',
                        message: 'Client must have a final creditor list first. Please ensure documents are processed and creditors are approved.'
                    });
                }

                // Create creditor calculation table with 3-tier amount logic
                const currentTime = new Date().toISOString();
                const creditorCalculationTable = [];
                let totalDebt = 0;

                client.final_creditor_list.forEach((creditor, index) => {
                    let finalAmount = 0;
                    let amountSource = 'default_fallback';
                    let contactStatus = 'no_response';

                    // 3-Tier Logic:
                    // 1. Check if we got a creditor response (priority 1)
                    if (creditor.current_debt_amount && creditor.contact_status === 'responded') {
                        finalAmount = creditor.current_debt_amount;
                        amountSource = 'creditor_response';
                        contactStatus = 'responded';
                    }
                    // Also check for alternative response amount fields
                    else if (creditor.creditor_response_amount) {
                        finalAmount = creditor.creditor_response_amount;
                        amountSource = 'creditor_response';
                        contactStatus = 'responded';
                    }
                    // 2. Use AI-extracted amount from documents (priority 2)
                    else if (creditor.claim_amount) {
                        finalAmount = creditor.claim_amount;
                        amountSource = 'original_document';
                        contactStatus = creditor.contact_status || 'no_response';
                    }
                    // 3. Default €100 if no information available (priority 3)
                    else {
                        finalAmount = 100.00;
                        amountSource = 'default_fallback';
                        contactStatus = 'no_response';
                    }

                    totalDebt += finalAmount;

                    creditorCalculationTable.push({
                        id: creditor.id || `calc_${Date.now()}_${index}`,
                        name: creditor.sender_name || creditor.creditor_name || 'Unknown Creditor',
                        email: creditor.sender_email || creditor.creditor_email || '',
                        address: creditor.sender_address || creditor.creditor_address || '',
                        reference_number: creditor.reference_number || '',
                        original_amount: creditor.claim_amount || 0,
                        final_amount: finalAmount,
                        amount_source: amountSource,
                        contact_status: contactStatus,
                        is_representative: creditor.is_representative || false,
                        actual_creditor: creditor.actual_creditor || creditor.sender_name,
                        ai_confidence: creditor.ai_confidence || 0,
                        created_at: currentTime
                    });
                });

                // Store the creditor calculation table in the client record using safeClientUpdate
                // If safeClientUpdate provided use it, otherwise fallback (assume in-memory update logic not ideal but passable for test)
                const updateFn = safeClientUpdate || (async (cid, updateCallback) => {
                    const c = await (getClient ? getClient(cid) : Client.findOne({ $or: [{ id: cid }, { aktenzeichen: cid }] }));
                    if (!c) throw new Error('Client not found');
                    const updated = await updateCallback(c);
                    // If using mongoose save
                    if (updated.save) await updated.save();
                    return updated;
                });

                const updatedClient = await updateFn(clientId, async (c) => {
                    c.creditor_calculation_table = creditorCalculationTable;
                    c.creditor_calculation_created_at = currentTime;
                    c.creditor_calculation_total_debt = totalDebt;
                    c.current_status = 'creditor_calculation_ready';

                    // Add a note about the calculation
                    if (!c.admin_notes) {
                        c.admin_notes = [];
                    }
                    c.admin_notes.push({
                        timestamp: currentTime,
                        note: `🕐 30-Day Simulation: Created creditor calculation table with ${creditorCalculationTable.length} creditors, total debt: €${totalDebt.toFixed(2)}`,
                        admin: 'system_simulation'
                    });
                    return c;
                });

                // Generate automatic Schuldenbereinigungsplan calculation if financial data exists
                let settlementPlan = null;
                if (updatedClient.financial_data && updatedClient.financial_data.monthly_net_income) {
                    try {
                        console.log(`🧮 Generating automatic settlement plan calculation...`);

                        const financialData = {
                            netIncome: updatedClient.financial_data.monthly_net_income,
                            maritalStatus: updatedClient.financial_data.marital_status || 'ledig',
                            numberOfChildren: updatedClient.financial_data.number_of_children || 0
                        };

                        // Create mock creditor contact service that matches the expected interface
                        const creditorContacts = new Map();
                        creditorCalculationTable.forEach((creditor, index) => {
                            creditorContacts.set(`creditor_${index}`, {
                                client_reference: clientId,
                                creditor_name: creditor.name,
                                creditor_email: creditor.email,
                                reference_number: creditor.reference_number,
                                final_debt_amount: creditor.final_amount,
                                amount_source: creditor.amount_source,
                                contact_status: creditor.contact_status
                            });
                        });

                        const mockCreditorContactService = {
                            creditorContacts: creditorContacts
                        };

                        settlementPlan = garnishmentCalculator.generateRestructuringAnalysis(
                            clientId,
                            financialData,
                            mockCreditorContactService
                        );

                        if (settlementPlan && settlementPlan.success) {
                            console.log(`✅ Settlement plan generated successfully`);

                            // Save settlement plan to database
                            await updateFn(clientId, async (c) => {
                                c.calculated_settlement_plan = settlementPlan;
                                return c;
                            });
                        } else {
                            settlementPlan = { success: false, error: settlementPlan?.error || 'Unknown calculation error' };
                        }

                    } catch (error) {
                        console.error(`❌ Error generating settlement plan:`, error);
                        settlementPlan = { success: false, error: error.message || 'Unknown error occurred' };
                    }
                }

                // INTEGRATION: Activate financial data form after 30-day simulation
                const finalUpdatedClient = await updateFn(clientId, async (c) => {
                    c.creditor_contact_started = true;
                    c.creditor_contact_started_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
                    c.current_status = 'creditor_contact_active';
                    return c;
                });

                // Send financial data reminder email to client via injected service
                let emailResult = null;
                if (financialDataReminderService && finalUpdatedClient.zendesk_ticket_id && finalUpdatedClient.email) {
                    try {
                        console.log(`📧 Sending financial data reminder email...`);
                        emailResult = await financialDataReminderService.sendReminder(
                            finalUpdatedClient.zendesk_ticket_id,
                            {
                                firstName: finalUpdatedClient.firstName,
                                lastName: finalUpdatedClient.lastName,
                                email: finalUpdatedClient.email,
                                aktenzeichen: finalUpdatedClient.aktenzeichen
                            }
                        );

                        if (emailResult.success) {
                            await updateFn(clientId, async (c) => {
                                c.financial_data_reminder_sent_at = new Date();
                                if (emailResult.side_conversation_id) {
                                    c.financial_data_reminder_side_conversation_id = emailResult.side_conversation_id;
                                }
                                return c;
                            });
                        }
                    } catch (emailError) {
                        console.error(`❌ Error sending financial data reminder email:`, emailError);
                        emailResult = { success: false, error: emailError.message };
                    }
                } else {
                    emailResult = {
                        success: false,
                        error: 'Missing service or zendesk_ticket_id',
                        skipped: true
                    };
                }

                res.json({
                    success: true,
                    message: `30-Day simulation complete! Creditor calculation table created for ${finalUpdatedClient.firstName} ${finalUpdatedClient.lastName}. Financial data form is now available in client portal.`,
                    email_sent: emailResult?.success || false,
                    email_details: emailResult || null,
                    client_id: finalUpdatedClient.id,
                    aktenzeichen: finalUpdatedClient.aktenzeichen,
                    creditor_count: creditorCalculationTable.length,
                    total_debt: totalDebt,
                    creditor_calculation_table: creditorCalculationTable,
                    settlement_plan: settlementPlan,
                    created_at: currentTime
                });

            } catch (error) {
                console.error('❌ Error in 30-day simulation:', error.message);
                res.status(500).json({
                    error: 'Failed to create creditor calculation table',
                    details: error.message
                });
            }
        },

        getPhase2Stats: (req, res) => {
            try {
                console.log('📊 Getting test data statistics...');
                const stats = testDataService.getTestDataStats();
                res.json({ success: true, stats, message: 'Test data statistics retrieved successfully' });
            } catch (error) {
                console.error('❌ Error getting test data stats:', error.message);
                res.status(500).json({ success: false, error: 'Failed to get test data statistics', details: error.message });
            }
        },

        getAllFinancialProfiles: (req, res) => {
            try {
                console.log('👥 Getting all financial profiles...');
                const profiles = testDataService.getAllFinancialProfiles();
                res.json({ success: true, profiles, count: profiles.length, message: 'Financial profiles retrieved successfully' });
            } catch (error) {
                console.error('❌ Error getting financial profiles:', error.message);
                res.status(500).json({ success: false, error: 'Failed to get financial profiles', details: error.message });
            }
        },

        getFinancialProfile: (req, res) => {
            try {
                const profileId = req.params.profileId;
                console.log(`👤 Getting financial profile: ${profileId}`);
                const profile = testDataService.getFinancialProfile(profileId);
                if (!profile) return res.status(404).json({ success: false, error: `Financial profile '${profileId}' not found` });
                res.json({ success: true, profile, message: 'Financial profile retrieved successfully' });
            } catch (error) {
                console.error('❌ Error getting financial profile:', error.message);
                res.status(500).json({ success: false, error: 'Failed to get financial profile', details: error.message });
            }
        },

        testFinancialProfile: (req, res) => {
            try {
                const profileId = req.params.profileId;
                console.log(`🧪 Testing financial profile: ${profileId}`);
                const profile = testDataService.getFinancialProfile(profileId);
                if (!profile) return res.status(404).json({ success: false, error: `Financial profile '${profileId}' not found` });

                const result = garnishmentCalculator.calculate(
                    profile.client_data.netIncome,
                    profile.client_data.maritalStatus,
                    profile.client_data.numberOfChildren
                );

                const validation = testDataService.validateResults({ garnishableIncome: result.garnishableAmount }, profile.expected_results);
                res.json({ success: true, profile, calculation_result: result, validation, message: validation.valid ? 'Test passed successfully' : 'Test validation failed' });
            } catch (error) {
                console.error('❌ Error testing financial profile:', error.message);
                res.status(500).json({ success: false, error: 'Failed to test financial profile', details: error.message });
            }
        },

        runFinancialTests: (req, res) => {
            try {
                console.log('🧪 Running all financial profile tests...');
                const testResults = testDataService.runFinancialProfileTests((n, m, c) => garnishmentCalculator.calculate(n, m, c));
                res.json({ success: true, test_results: testResults, message: `Financial tests completed: ${testResults.passed}/${testResults.total} passed` });
            } catch (error) {
                console.error('❌ Error running financial tests:', error.message);
                res.status(500).json({ success: false, error: 'Failed to run financial tests', details: error.message });
            }
        },

        createTestClient: (req, res) => {
            try {
                const testCaseId = req.params.testCaseId;
                console.log(`🏗️ Creating test client for case: ${testCaseId}`);
                const testData = testDataService.createTestClient(testCaseId);

                // Add to in-memory store (clientsData)
                // Note: Ideally this should use saveClient or Client.create() if persisting to DB
                // But the original code likely just returned the data or modified clientsData directly.
                // Assuming testDataService.createTestClient returns the object.

                // Inject into clientsData if available
                if (clientsData) {
                    clientsData[testData.clientData.id] = testData.clientData;
                    clientsData[testData.clientData.aktenzeichen] = testData.clientData;
                }

                res.json({ success: true, client_id: testData.clientData.id, aktenzeichen: testData.clientData.aktenzeichen, message: 'Test client created', test_data: testData });
            } catch (error) {
                console.error('❌ Error creating test client:', error.message);
                res.status(500).json({ success: false, error: 'Failed to create test client', details: error.message });
            }
        },

        runIntegrationTest: async (req, res) => {
            try {
                const testCaseId = req.params.testCaseId;
                console.log(`🔬 Running integration test: ${testCaseId}`);
                const testData = testDataService.createTestClient(testCaseId);
                const clientId = testData.clientData.id;

                // Mock data injection (temporary)
                if (clientsData) clientsData[clientId] = testData.clientData;
                if (creditorContactService.creditorContacts) creditorContactService.creditorContacts = testData.creditorContacts;

                try {
                    const garnishmentResult = garnishmentCalculator.calculateGarnishableIncome2025(
                        testData.clientData.financial_data.netIncome,
                        testData.clientData.financial_data.maritalStatus,
                        testData.clientData.financial_data.numberOfChildren
                    );

                    const quotasResult = garnishmentCalculator.calculateCreditorQuotas(
                        clientId,
                        garnishmentResult.garnishableAmount,
                        creditorContactService
                    );

                    const analysisResult = garnishmentCalculator.generateRestructuringAnalysis(
                        clientId,
                        testData.clientData.financial_data,
                        creditorContactService
                    );

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
                        results: { garnishment: garnishmentResult, creditor_quotas: quotasResult, restructuring_analysis: analysisResult },
                        validation,
                        message: validation.valid ? 'Integration test passed' : 'Integration test failed validation'
                    });

                } finally {
                    if (clientsData) delete clientsData[clientId];
                    if (creditorContactService.creditorContacts) creditorContactService.creditorContacts.clear();
                }

            } catch (error) {
                console.error('❌ Error running integration test:', error.message);
                res.status(500).json({ success: false, error: 'Failed to run integration test', details: error.message });
            }
        },

        getCreditorScenarios: (req, res) => {
            try {
                console.log('🏛️ Getting creditor scenarios...');
                const scenarios = testDataService.creditorResponses?.test_scenarios || [];
                res.json({ success: true, scenarios, count: scenarios.length, message: 'Creditor scenarios retrieved successfully' });
            } catch (error) {
                console.error('❌ Error getting creditor scenarios:', error.message);
                res.status(500).json({ success: false, error: 'Failed to get creditor scenarios', details: error.message });
            }
        },

        getWorkflowTestCases: (req, res) => {
            try {
                console.log('🔗 Getting workflow test cases...');
                const testCases = testDataService.integrationTestCases?.complete_workflow_tests || [];
                res.json({ success: true, test_cases: testCases, count: testCases.length, message: 'Workflow test cases retrieved successfully' });
            } catch (error) {
                console.error('❌ Error getting workflow tests:', error.message);
                res.status(500).json({ success: false, error: 'Failed to get workflow tests', details: error.message });
            }
        },

        testGarnishmentEdgeCases: (req, res) => {
            try {
                console.log('⚡ Testing garnishment calculator edge cases...');
                const edgeCases = [
                    { income: 1559, marital: 'ledig', children: 0, expected: 0 },
                    { income: 1560, marital: 'ledig', children: 0, expected: 3.50 },
                    { income: 4767, marital: 'ledig', children: 0, expected: 4767 },
                    { income: 5000, marital: 'ledig', children: 0, expected: 5000 },
                    { income: 3000, marital: 'verheiratet', children: 5, expected: 0 }
                ];

                const results = edgeCases.map(testCase => {
                    const result = garnishmentCalculator.calculate(testCase.income, testCase.marital, testCase.children);
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
                res.json({ success: true, edge_case_results: results, summary: { total_tests: results.length, passed: passedCount, failed: results.length - passedCount }, message: `Edge case tests completed: ${passedCount}/${results.length} passed` });
            } catch (error) {
                console.error('❌ Error testing garnishment edge cases:', error.message);
                res.status(500).json({ success: false, error: 'Failed to test garnishment edge cases', details: error.message });
            }
        },

        // --- End Phase 2 ---

        // Test debt extraction on provided text
        testDebtExtraction: async (req, res) => {
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
        },

        // Run full extraction test suite
        testDebtExtractionSuite: async (req, res) => {
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
        },

        // Simulate Creditor Responses
        simulateCreditorResponses: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                // Check both clientsData and potentially DB if needed, but keeping logic consistent with extracted code
                const client = clientsData[clientId]; // Accessing injected clientsData

                if (!client) {
                    return res.status(404).json({ error: 'Client not found (in active memory)' });
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
        },

        // Process manual creditor response
        processCreditorResponse: async (req, res) => {
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
        },

        // Get Response Stats
        getResponseStats: async (req, res) => {
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
        },

        // Test Webhook Response
        testWebhookResponse: async (req, res) => {
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
        },

        // Create Demo Creditor Contacts
        createDemoCreditorContacts: async (req, res) => {
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
                        contact_status: 'responded',
                        response_received_at: new Date().toISOString(),
                        current_debt_amount: 2750.50,
                        creditor_response_text: 'Aktuelle Forderung: 2.750,50 EUR inkl. Zinsen und Kosten.',
                        final_debt_amount: 2750.50,
                        amount_source: 'creditor_response',
                        extraction_confidence: 0.95,
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
                        final_debt_amount: 1200.00,
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
                        current_debt_amount: 0,
                        creditor_response_text: 'Wir prüfen Ihre Anfrage und melden uns zeitnah.',
                        final_debt_amount: 8750.45,
                        amount_source: 'original_document',
                        extraction_confidence: 0.1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ];

                // Add contacts to creditorContactService
                if (creditorContactService.creditorContacts) {
                    for (const contact of demoContacts) {
                        creditorContactService.creditorContacts.set(contact.id, contact);
                    }
                } else {
                    console.warn('creditorContactService.creditorContacts Map is missing in production');
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
        },

        // Test Garnishment Calculator
        testGarnishmentCalculator: (req, res) => {
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
        }
    };
};

module.exports = createAdminTestController;
