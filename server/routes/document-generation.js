const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const DocumentGenerator = require('../services/documentGenerator');
const { rateLimits } = require('../middleware/security');

const router = express.Router();
const documentGenerator = new DocumentGenerator();

/**
 * Generate Schuldenbereinigungsplan Word document
 * POST /api/documents/schuldenbereinigungsplan
 */
router.post('/schuldenbereinigungsplan', rateLimits.general, async (req, res) => {
    try {
        const { client_reference, settlement_data } = req.body;

        console.log(`📄 Document generation request for client: ${client_reference}`);

        // Validate required parameters
        if (!client_reference) {
            return res.status(400).json({
                error: 'client_reference is required'
            });
        }

        if (!settlement_data) {
            return res.status(400).json({
                error: 'settlement_data is required'
            });
        }

        // Validate settlement data structure
        const requiredFields = ['monthly_payment', 'duration_months', 'creditor_payments'];
        const missingFields = requiredFields.filter(field => !settlement_data[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: `Missing required settlement data fields: ${missingFields.join(', ')}`
            });
        }

        if (!Array.isArray(settlement_data.creditor_payments) || settlement_data.creditor_payments.length === 0) {
            return res.status(400).json({
                error: 'settlement_data.creditor_payments must be a non-empty array'
            });
        }

        // Generate the document
        const result = await documentGenerator.generateSettlementPlanDocument(client_reference, settlement_data);

        if (!result.success) {
            console.error(`❌ Document generation failed: ${result.error}`);
            return res.status(500).json({
                error: 'Document generation failed',
                details: result.error
            });
        }

        console.log(`✅ Document generated: ${result.document_info.filename}`);

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${result.document_info.filename}"`);
        res.setHeader('Content-Length', result.document_info.size);

        // Send the document buffer as response
        res.send(result.buffer);

    } catch (error) {
        console.error('❌ Error in document generation endpoint:', error.message);
        res.status(500).json({
            error: 'Internal server error during document generation',
            message: error.message
        });
    }
});

/**
 * Get document generation status/info for a client
 * GET /api/documents/status/:client_reference
 */
router.get('/status/:client_reference', rateLimits.general, async (req, res) => {
    try {
        const { client_reference } = req.params;

        // Check if client exists
        const client = await Client.findOne({ aktenzeichen: client_reference });
        
        if (!client) {
            return res.status(404).json({
                error: 'Client not found',
                client_reference
            });
        }

        // Check if settlement plan data exists
        const hasSettlementPlan = !!(
            client.settlement_plan && 
            client.settlement_plan.creditor_payments && 
            client.settlement_plan.creditor_payments.length > 0
        );

        const status = {
            client_reference,
            client_name: `${client.firstName} ${client.lastName}`,
            has_settlement_plan: hasSettlementPlan,
            settlement_plan_data: hasSettlementPlan ? {
                monthly_payment: client.settlement_plan.monthly_payment,
                duration_months: client.settlement_plan.duration_months,
                creditor_count: client.settlement_plan.creditor_payments.length,
                total_debt: client.settlement_plan.total_debt,
                generated_at: client.settlement_plan.generated_at
            } : null,
            can_generate_document: hasSettlementPlan,
            last_checked: new Date().toISOString()
        };

        res.json(status);

    } catch (error) {
        console.error('❌ Error checking document status:', error.message);
        res.status(500).json({
            error: 'Failed to check document status',
            message: error.message
        });
    }
});

/**
 * Test document generation endpoint with sample data
 * GET /api/documents/test
 */
router.get('/test', rateLimits.general, async (req, res) => {
    try {
        console.log('🧪 Testing document generation with sample data...');
        
        const result = await documentGenerator.testDocumentGeneration();
        
        res.json({
            success: true,
            message: 'Test document generated successfully',
            document_info: {
                filename: result.filename,
                size: result.size,
                path: result.path
            }
        });

    } catch (error) {
        console.error('❌ Error in test document generation:', error.message);
        res.status(500).json({
            error: 'Test document generation failed',
            message: error.message
        });
    }
});

/**
 * Generate preview/info for settlement plan document without creating the file
 * POST /api/documents/preview
 */
router.post('/preview', rateLimits.general, async (req, res) => {
    try {
        const { client_reference, settlement_data } = req.body;

        if (!client_reference || !settlement_data) {
            return res.status(400).json({
                error: 'client_reference and settlement_data are required'
            });
        }

        // Get client data
        const client = await Client.findOne({ aktenzeichen: client_reference });
        if (!client) {
            return res.status(404).json({
                error: 'Client not found',
                client_reference
            });
        }

        // Generate preview info
        const preview = {
            document_title: `Außergerichtlicher Schuldenbereinigungsplan vom ${new Date().toLocaleDateString('de-DE')}`,
            client_info: {
                name: `${client.firstName} ${client.lastName}`,
                reference: client_reference
            },
            settlement_info: {
                monthly_payment: settlement_data.monthly_payment,
                duration_months: settlement_data.duration_months,
                total_debt: settlement_data.total_debt,
                creditor_count: settlement_data.creditor_payments?.length || 0
            },
            creditor_summary: settlement_data.creditor_payments?.slice(0, 5).map((creditor, index) => ({
                position: index + 1,
                name: creditor.creditor_name,
                amount: creditor.debt_amount,
                quota: creditor.quota_percentage
            })) || [],
            estimated_file_size: "~50 KB",
            generation_ready: true
        };

        res.json({
            success: true,
            preview
        });

    } catch (error) {
        console.error('❌ Error generating document preview:', error.message);
        res.status(500).json({
            error: 'Failed to generate document preview',
            message: error.message
        });
    }
});

module.exports = router;