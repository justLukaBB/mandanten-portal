const CreditorService = require('../services/creditorService');

const creditorService = new CreditorService();

/**
 * CreditorController
 * Handles HTTP requests for creditor operations
 */
class CreditorController {
    /**
     * Add a new creditor (client-facing endpoint)
     * POST /api/clients/:clientId/creditors
     */
    async addCreditorClient(req, res) {
        try {
            const { clientId } = req.params;
            const creditorData = req.body;

            console.log(`👤 Client ${clientId} adding manual creditor: ${creditorData.name}`);

            const result = await creditorService.addCreditorToClient(
                clientId,
                creditorData,
                'client',
                'client'
            );

            if (!result.success) {
                return res.status(400).json({
                    error: result.error
                });
            }

            res.json({
                success: true,
                message: `Gläubiger "${creditorData.name}" erfolgreich hinzugefügt`,
                creditor: result.creditor
            });

        } catch (error) {
            console.error('❌ Error adding manual creditor (client):', error);
            res.status(500).json({
                error: 'Fehler beim Hinzufügen des Gläubigers',
                details: error.message
            });
        }
    }

    /**
     * Add a new creditor (admin-facing endpoint)
     * POST /api/admin/clients/:clientId/add-creditor
     */
    async addCreditorAdmin(req, res) {
        try {
            const { clientId } = req.params;
            const creditorData = {
                name: req.body.sender_name,
                email: req.body.sender_email,
                address: req.body.sender_address,
                referenceNumber: req.body.reference_number,
                amount: req.body.claim_amount,
                notes: req.body.notes,
                isRepresentative: req.body.is_representative,
                actualCreditor: req.body.actual_creditor
            };

            console.log(`👤 Admin adding manual creditor to client ${clientId}: ${creditorData.name}`);

            const reviewedBy = req.adminId || req.agentId || 'admin';

            const result = await creditorService.addCreditorToClient(
                clientId,
                creditorData,
                'admin',
                reviewedBy
            );

            if (!result.success) {
                return res.status(400).json({
                    error: result.error
                });
            }

            res.json({
                success: true,
                message: `Creditor "${creditorData.name}" added successfully`,
                creditor: result.creditor,
                client: result.client
            });

        } catch (error) {
            console.error('❌ Error adding manual creditor (admin):', error);
            res.status(500).json({
                error: 'Failed to add creditor',
                details: error.message
            });
        }
    }

    /**
     * Get creditors for a client (client-facing endpoint)
     * GET /api/clients/:clientId/creditors
     */
    async getCreditors(req, res) {
        try {
            const { clientId } = req.params;

            // Security: Verify authenticated client matches requested client
            // Support both UUID and Aktenzeichen for impersonation compatibility
            if (req.clientId !== clientId) {
                // Double-check: fetch client to compare both id and aktenzeichen
                const Client = require('../models/Client');
                const client = await Client.findOne({
                    $or: [{ id: clientId }, { aktenzeichen: clientId }]
                });

                if (!client || (client.id !== req.clientId && client.aktenzeichen !== req.clientId)) {
                    return res.status(403).json({
                        error: 'Forbidden: You can only access your own creditors'
                    });
                }
            }

            console.log(`📋 Client ${clientId} fetching creditors list`);

            const result = await creditorService.getClientWithCreditors(clientId);

            if (!result.success) {
                return res.status(404).json({
                    error: result.error
                });
            }

            res.json({
                success: true,
                client: result.client,
                creditors: result.creditors
            });

        } catch (error) {
            console.error('❌ Error fetching creditors (client):', error);
            res.status(500).json({
                error: 'Failed to fetch creditors',
                details: error.message
            });
        }
    }
}

module.exports = new CreditorController();
