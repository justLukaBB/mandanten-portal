/**
 * Test Data Service for Phase 2 - Debt Restructuring
 * Provides comprehensive test scenarios for garnishment calculations
 * and creditor quota distributions
 */
const fs = require('fs');
const path = require('path');

class TestDataService {
    constructor() {
        console.log('🧪 Initializing Test Data Service...');
        
        this.testDataPath = path.join(__dirname, '../test-data/phase2');
        this.financialProfiles = null;
        this.creditorResponses = null;
        this.integrationTestCases = null;
        
        this._loadTestData();
        console.log('✅ Test Data Service ready');
    }

    /**
     * Load all test data from JSON files
     * @private
     */
    _loadTestData() {
        try {
            // Load financial profiles
            const financialProfilesPath = path.join(this.testDataPath, 'financial-profiles.json');
            if (fs.existsSync(financialProfilesPath)) {
                this.financialProfiles = JSON.parse(fs.readFileSync(financialProfilesPath, 'utf8'));
                console.log(`📊 Loaded ${this.financialProfiles.test_profiles.length} financial test profiles`);
            }

            // Load creditor responses  
            const creditorResponsesPath = path.join(this.testDataPath, 'creditor-responses.json');
            if (fs.existsSync(creditorResponsesPath)) {
                this.creditorResponses = JSON.parse(fs.readFileSync(creditorResponsesPath, 'utf8'));
                console.log(`🏛️ Loaded ${this.creditorResponses.realistic_creditor_responses.length} creditor response templates`);
            }

            // Load integration test cases
            const integrationTestPath = path.join(this.testDataPath, 'integration-test-cases.json');
            if (fs.existsSync(integrationTestPath)) {
                this.integrationTestCases = JSON.parse(fs.readFileSync(integrationTestPath, 'utf8'));
                console.log(`🔗 Loaded ${this.integrationTestCases.complete_workflow_tests.length} complete workflow tests`);
            }

        } catch (error) {
            console.error('❌ Error loading test data:', error.message);
        }
    }

    /**
     * Get financial profile by ID
     * @param {string} profileId - Profile identifier
     * @returns {Object|null} Financial profile data
     */
    getFinancialProfile(profileId) {
        if (!this.financialProfiles) return null;
        
        return this.financialProfiles.test_profiles.find(profile => 
            profile.profile_id === profileId
        );
    }

    /**
     * Get all available financial profiles
     * @returns {Array} List of all financial profiles
     */
    getAllFinancialProfiles() {
        return this.financialProfiles ? this.financialProfiles.test_profiles : [];
    }

    /**
     * Get creditor response by ID
     * @param {string} responseId - Response identifier
     * @returns {Object|null} Creditor response data
     */
    getCreditorResponse(responseId) {
        if (!this.creditorResponses) return null;

        return this.creditorResponses.realistic_creditor_responses.find(response =>
            response.response_id === responseId
        );
    }

    /**
     * Get creditor responses for a scenario
     * @param {string} scenarioId - Test scenario identifier
     * @returns {Array} Array of creditor responses
     */
    getCreditorScenario(scenarioId) {
        if (!this.creditorResponses) return [];

        const scenario = this.creditorResponses.test_scenarios.find(s => 
            s.scenario_id === scenarioId
        );

        if (!scenario) return [];

        return scenario.creditor_responses.map(responseId => 
            this.getCreditorResponse(responseId)
        ).filter(response => response !== null);
    }

    /**
     * Get complete workflow test case
     * @param {string} testCaseId - Test case identifier
     * @returns {Object|null} Complete test case data
     */
    getWorkflowTestCase(testCaseId) {
        if (!this.integrationTestCases) return null;

        return this.integrationTestCases.complete_workflow_tests.find(testCase =>
            testCase.test_case_id === testCaseId
        );
    }

    /**
     * Generate mock creditor contacts for a client
     * @param {string} clientId - Client identifier
     * @param {string} scenarioId - Creditor scenario ID
     * @returns {Object} Mock creditor contacts data
     */
    generateMockCreditorContacts(clientId, scenarioId) {
        const creditorResponses = this.getCreditorScenario(scenarioId);
        const creditorContacts = new Map();

        creditorResponses.forEach((response, index) => {
            const contactId = `${clientId}-contact-${index + 1}`;
            
            creditorContacts.set(contactId, {
                id: contactId,
                client_reference: clientId,
                creditor_name: response.creditor_name,
                creditor_email: response.creditor_email,
                reference_number: response.reference_number,
                contact_status: 'completed',
                final_debt_amount: response.extracted_data.final_debt_amount || 0,
                amount_source: 'creditor_confirmed',
                response_received_date: new Date(Date.now() - response.response_delay_days * 24 * 60 * 60 * 1000).toISOString(),
                response_data: response,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        });

        return creditorContacts;
    }

    /**
     * Create complete test client with Phase 1 and Phase 2 data
     * @param {string} testCaseId - Integration test case ID
     * @returns {Object} Complete client data for testing
     */
    createTestClient(testCaseId) {
        const testCase = this.getWorkflowTestCase(testCaseId);
        if (!testCase) {
            throw new Error(`Test case '${testCaseId}' not found`);
        }

        const clientId = testCase.client_profile.client_id;
        
        // Generate mock creditor contacts
        const creditorContacts = this.generateMockCreditorContacts(
            clientId, 
            testCase.creditor_scenario
        );

        // Create complete client data structure
        const clientData = {
            id: clientId,
            firstName: testCase.client_profile.firstName,
            lastName: testCase.client_profile.lastName,
            email: testCase.client_profile.email,
            phone: '+49 123 456789',
            phase: 2,
            workflow_status: 'creditor_contact_completed',
            
            // Phase 1 data (simplified for testing)
            documents: [],
            final_creditor_list: Array.from(creditorContacts.values()).map(contact => ({
                creditor_name: contact.creditor_name,
                creditor_email: contact.creditor_email,
                reference_number: contact.reference_number,
                estimated_amount: contact.final_debt_amount
            })),

            // Phase 2 financial data
            financial_data: testCase.client_profile.financial_data,
            
            // Expected test results
            expected_results: testCase.expected_calculations,
            
            // Metadata
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_test_client: true,
            test_case_id: testCaseId
        };

        return {
            clientData,
            creditorContacts,
            testCase
        };
    }

    /**
     * Validate calculation results against expected values
     * @param {Object} actualResults - Actual calculation results
     * @param {Object} expectedResults - Expected results from test case
     * @param {number} tolerance - Tolerance for numeric comparisons (default: 0.01)
     * @returns {Object} Validation results
     */
    validateResults(actualResults, expectedResults, tolerance = 0.01) {
        const validation = {
            valid: true,
            errors: [],
            warnings: [],
            details: {}
        };

        // Validate total debt
        if (expectedResults.total_debt !== undefined) {
            const debtDiff = Math.abs(actualResults.totalDebt - expectedResults.total_debt);
            if (debtDiff > tolerance) {
                validation.valid = false;
                validation.errors.push(`Total debt mismatch: expected ${expectedResults.total_debt}, got ${actualResults.totalDebt}`);
            }
            validation.details.total_debt = { expected: expectedResults.total_debt, actual: actualResults.totalDebt, diff: debtDiff };
        }

        // Validate garnishable income
        if (expectedResults.garnishable_income !== undefined) {
            const garnishableDiff = Math.abs(actualResults.garnishableIncome - expectedResults.garnishable_income);
            if (garnishableDiff > tolerance) {
                validation.valid = false;
                validation.errors.push(`Garnishable income mismatch: expected ${expectedResults.garnishable_income}, got ${actualResults.garnishableIncome}`);
            }
            validation.details.garnishable_income = { expected: expectedResults.garnishable_income, actual: actualResults.garnishableIncome, diff: garnishableDiff };
        }

        // Validate creditor quota count
        if (expectedResults.creditor_quotas && actualResults.creditorQuotas) {
            const expectedCount = expectedResults.creditor_quotas.length;
            const actualCount = actualResults.creditorQuotas.length;
            
            if (expectedCount !== actualCount) {
                validation.valid = false;
                validation.errors.push(`Creditor quota count mismatch: expected ${expectedCount}, got ${actualCount}`);
            }
            validation.details.creditor_count = { expected: expectedCount, actual: actualCount };
        }

        // Validate quota sum
        if (actualResults.quotasSumCheck && !actualResults.quotasSumCheck.within_tolerance) {
            validation.warnings.push('Creditor quotas do not sum to garnishable income within tolerance');
        }

        return validation;
    }

    /**
     * Run all financial profile tests
     * @param {Function} calculatorFunction - Function to test (should accept netIncome, maritalStatus, numberOfChildren)
     * @returns {Object} Test results summary
     */
    runFinancialProfileTests(calculatorFunction) {
        console.log('\n🧪 Running financial profile tests...\n');
        
        const profiles = this.getAllFinancialProfiles();
        const results = {
            total: profiles.length,
            passed: 0,
            failed: 0,
            details: []
        };

        for (const profile of profiles) {
            console.log(`📋 Testing: ${profile.profile_name}`);
            
            try {
                const result = calculatorFunction(
                    profile.client_data.netIncome,
                    profile.client_data.maritalStatus,
                    profile.client_data.numberOfChildren
                );

                const expected = profile.expected_results.garnishable_amount;
                const actual = result.garnishableAmount;
                const diff = Math.abs(actual - expected);
                const passed = diff < 0.01;

                console.log(`   Result: ${actual} EUR ${passed ? '✅' : '❌'}`);
                console.log(`   Expected: ${expected} EUR`);
                
                if (passed) {
                    results.passed++;
                } else {
                    results.failed++;
                    console.log(`   Difference: ${diff.toFixed(2)} EUR`);
                }

                results.details.push({
                    profile_id: profile.profile_id,
                    profile_name: profile.profile_name,
                    expected: expected,
                    actual: actual,
                    difference: diff,
                    passed: passed
                });

            } catch (error) {
                results.failed++;
                console.log(`   Error: ${error.message} ❌`);
                
                results.details.push({
                    profile_id: profile.profile_id,
                    profile_name: profile.profile_name,
                    error: error.message,
                    passed: false
                });
            }
            
            console.log('');
        }

        console.log(`📊 Financial Profile Test Results: ${results.passed}/${results.total} passed\n`);
        return results;
    }

    /**
     * Get API test cases for endpoint validation
     * @param {string} endpoint - API endpoint path
     * @returns {Array} Test cases for the endpoint
     */
    getAPITestCases(endpoint) {
        if (!this.integrationTestCases) return [];

        const endpointTests = this.integrationTestCases.api_test_endpoints.find(e => 
            e.endpoint.includes(endpoint.split('/').pop())
        );

        return endpointTests ? endpointTests.test_cases : [];
    }

    /**
     * Generate summary statistics for test data
     * @returns {Object} Statistics about available test data
     */
    getTestDataStats() {
        const stats = {
            financial_profiles: this.financialProfiles ? this.financialProfiles.test_profiles.length : 0,
            creditor_responses: this.creditorResponses ? this.creditorResponses.realistic_creditor_responses.length : 0,
            creditor_scenarios: this.creditorResponses ? this.creditorResponses.test_scenarios.length : 0,
            integration_tests: this.integrationTestCases ? this.integrationTestCases.complete_workflow_tests.length : 0,
            api_endpoints: this.integrationTestCases ? this.integrationTestCases.api_test_endpoints.length : 0
        };

        console.log('📊 Test Data Statistics:');
        Object.entries(stats).forEach(([key, value]) => {
            console.log(`   ${key.replace(/_/g, ' ')}: ${value}`);
        });

        return stats;
    }
}

module.exports = TestDataService;