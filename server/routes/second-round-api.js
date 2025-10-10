const express = require('express');
const router = express.Router();
const SecondRoundManager = require('../services/secondRoundManager');

/**
 * API routes for Second Round Email Management
 * Handles the 2nd email round with individual "Pfändbares Einkommen" documents
 */

const secondRoundManager = new SecondRoundManager();

/**
 * Trigger 2nd round process for a specific client
 * POST /api/second-round/trigger/:clientReference
 */
router.post('/trigger/:clientReference', async (req, res) => {
    try {
        const clientReference = req.params.clientReference;
        console.log(`📧 API: Triggering 2nd round for client: ${clientReference}`);

        const result = await secondRoundManager.triggerSecondRoundForClient(clientReference);

        if (result.success) {
            res.json({
                success: true,
                message: `2nd round completed for ${clientReference}`,
                client_reference: clientReference,
                summary: result.summary,
                processing_time: result.end_time ? 
                    new Date(result.end_time) - new Date(result.start_time) : null
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                message: result.message || 'Failed to trigger 2nd round',
                client_reference: clientReference,
                details: result.eligibility_details
            });
        }

    } catch (error) {
        console.error('❌ API error triggering 2nd round:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Check eligibility for 2nd round
 * GET /api/second-round/check/:clientReference
 */
router.get('/check/:clientReference', async (req, res) => {
    try {
        const clientReference = req.params.clientReference;
        console.log(`🔍 API: Checking 2nd round eligibility for: ${clientReference}`);

        const eligibilityResult = await secondRoundManager.checkSecondRoundEligibility(clientReference);

        res.json(eligibilityResult);

    } catch (error) {
        console.error('❌ API error checking eligibility:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Get processing status for a client
 * GET /api/second-round/status/:clientReference
 */
router.get('/status/:clientReference', async (req, res) => {
    try {
        const clientReference = req.params.clientReference;
        const status = secondRoundManager.getProcessingStatus(clientReference);

        res.json({
            success: true,
            client_reference: clientReference,
            processing_status: status
        });

    } catch (error) {
        console.error('❌ API error getting status:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Execute complete 2nd round process with manual parameters
 * POST /api/second-round/execute
 */
router.post('/execute', async (req, res) => {
    try {
        const { clientReference, mainTicketId, creditorContacts } = req.body;

        if (!clientReference || !mainTicketId || !creditorContacts) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                required: ['clientReference', 'mainTicketId', 'creditorContacts']
            });
        }

        console.log(`📧 API: Executing 2nd round process for ${clientReference} with ${creditorContacts.length} creditors`);

        const result = await secondRoundManager.executeSecondRound(
            clientReference,
            mainTicketId,
            creditorContacts
        );

        res.json(result);

    } catch (error) {
        console.error('❌ API error executing 2nd round:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Generate documents only (without sending emails)
 * POST /api/second-round/documents/:clientReference
 */
router.post('/documents/:clientReference', async (req, res) => {
    try {
        const clientReference = req.params.clientReference;
        console.log(`📄 API: Generating 2nd round documents for: ${clientReference}`);

        const result = await secondRoundManager.documentService.generateSecondRoundDocuments(clientReference);

        res.json({
            success: result.success,
            client_reference: clientReference,
            documents_generated: result.total_documents,
            is_nullplan: result.is_nullplan,
            documents: result.documents || [],
            error: result.error,
            summary: result.summary
        });

    } catch (error) {
        console.error('❌ API error generating documents:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * List all clients eligible for 2nd round
 * GET /api/second-round/eligible-clients
 */
router.get('/eligible-clients', async (req, res) => {
    try {
        console.log('📋 API: Finding clients eligible for 2nd round...');

        const Client = require('../models/Client');
        
        // Find clients who have completed first round but haven't done second round
        const clients = await Client.find({
            creditor_contact_started: true,
            'financial_data.pfaendbar_amount': { $gte: 1 } // Has pfändbar amount
        }).select('aktenzeichen firstName lastName creditor_contact_started_at financial_data.pfaendbar_amount');

        const eligibleClients = [];

        for (const client of clients) {
            const eligibilityCheck = await secondRoundManager.checkSecondRoundEligibility(client.aktenzeichen);
            
            if (eligibilityCheck.success && eligibilityCheck.eligible) {
                eligibleClients.push({
                    client_reference: client.aktenzeichen,
                    client_name: `${client.firstName} ${client.lastName}`,
                    first_round_completed: client.creditor_contact_started_at,
                    pfaendbar_amount: client.financial_data?.pfaendbar_amount || 0,
                    eligibility_details: eligibilityCheck.eligibility_details
                });
            }
        }

        res.json({
            success: true,
            eligible_clients_count: eligibleClients.length,
            total_clients_checked: clients.length,
            eligible_clients: eligibleClients
        });

    } catch (error) {
        console.error('❌ API error finding eligible clients:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Bulk trigger 2nd round for multiple clients
 * POST /api/second-round/bulk-trigger
 */
router.post('/bulk-trigger', async (req, res) => {
    try {
        const { clientReferences } = req.body;

        if (!clientReferences || !Array.isArray(clientReferences)) {
            return res.status(400).json({
                success: false,
                error: 'clientReferences array is required'
            });
        }

        console.log(`📧 API: Bulk triggering 2nd round for ${clientReferences.length} clients...`);

        const results = [];
        let successCount = 0;

        for (let i = 0; i < clientReferences.length; i++) {
            const clientReference = clientReferences[i];
            
            try {
                console.log(`   Processing ${i + 1}/${clientReferences.length}: ${clientReference}`);
                
                const result = await secondRoundManager.triggerSecondRoundForClient(clientReference);
                
                if (result.success) {
                    successCount++;
                }

                results.push({
                    client_reference: clientReference,
                    success: result.success,
                    summary: result.summary,
                    error: result.error
                });

                // Small delay between clients to avoid overwhelming the system
                if (i < clientReferences.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                console.error(`   ❌ Error processing ${clientReference}: ${error.message}`);
                results.push({
                    client_reference: clientReference,
                    success: false,
                    error: error.message
                });
            }
        }

        res.json({
            success: successCount > 0,
            processed_clients: clientReferences.length,
            successful_clients: successCount,
            failed_clients: clientReferences.length - successCount,
            results: results
        });

    } catch (error) {
        console.error('❌ API error in bulk trigger:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;