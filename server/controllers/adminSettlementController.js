const Client = require('../models/Client');

/**
 * Controller for Admin Settlement and Nullplan Monitoring
 * Requires injection of the global SettlementResponseMonitor instance
 */
/**
 * Controller for Admin Settlement and Nullplan Monitoring
 * Requires injection of the global SettlementResponseMonitor instance and CreditorService
 */
class AdminSettlementController {
    constructor(monitor, creditorService) {
        this.monitor = monitor;
        this.creditorService = creditorService;
    }

    // Helper to get aktenzeichen
    async _getClientAktenzeichen(clientId) {
        try {
            // Try to find by id first, then by aktenzeichen
            let client = await Client.findOne({ id: clientId });
            if (!client) {
                client = await Client.findOne({ aktenzeichen: clientId });
            }
            return client ? client.aktenzeichen : null;
        } catch (error) {
            console.error('Error getting client aktenzeichen:', error);
            return null;
        }
    }

    /**
     * Get settlement responses summary
     * GET /api/admin/clients/:clientId/settlement-responses
     */
    getSettlementResponses = async (req, res) => {
        try {
            const { clientId } = req.params;

            // Convert clientId to aktenzeichen
            const aktenzeichen = await this._getClientAktenzeichen(clientId);
            if (!aktenzeichen) {
                return res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
            }

            const summary = await this.monitor.generateSettlementSummary(aktenzeichen);
            res.json({
                success: true,
                summary: summary
            });

        } catch (error) {
            console.error('❌ Error getting settlement responses:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Process settlement timeouts
     * POST /api/admin/clients/:clientId/process-settlement-timeouts
     */
    processSettlementTimeouts = async (req, res) => {
        try {
            const { clientId } = req.params;
            const { timeoutDays = 30 } = req.body;

            // Convert clientId to aktenzeichen
            const aktenzeichen = await this._getClientAktenzeichen(clientId);
            if (!aktenzeichen) {
                return res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
            }

            const result = await this.monitor.processTimeouts(aktenzeichen, timeoutDays);
            res.json({
                success: true,
                result: result
            });

        } catch (error) {
            console.error('❌ Error processing settlement timeouts:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get monitoring status
     * GET /api/admin/clients/:clientId/settlement-monitoring-status
     */
    getMonitoringStatus = async (req, res) => {
        try {
            const { clientId } = req.params;

            // Convert clientId to aktenzeichen
            const aktenzeichen = await this._getClientAktenzeichen(clientId);
            if (!aktenzeichen) {
                return res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
            }

            const status = this.monitor.getMonitoringStatus(aktenzeichen);
            res.json({
                success: true,
                status: status
            });

        } catch (error) {
            console.error('❌ Error getting monitoring status:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get nullplan responses
     * GET /api/admin/clients/:clientId/nullplan-responses
     */
    getNullplanResponses = async (req, res) => {
        try {
            const { clientId } = req.params;

            // Convert clientId to aktenzeichen
            const aktenzeichen = await this._getClientAktenzeichen(clientId);
            if (!aktenzeichen) {
                return res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
            }

            // Get client data to analyze nullplan responses
            const client = await Client.findOne({ aktenzeichen: aktenzeichen });
            if (!client) {
                return res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
            }

            // Generate nullplan summary from creditor data
            const nullplanCreditors = client.final_creditor_list?.filter(c =>
                c.nullplan_side_conversation_id || c.nullplan_sent_at
            ) || [];

            const summary = {
                total_creditors: nullplanCreditors.length,
                accepted: nullplanCreditors.filter(c => c.nullplan_response_status === 'accepted').length,
                declined: nullplanCreditors.filter(c => c.nullplan_response_status === 'declined').length,
                no_responses: nullplanCreditors.filter(c => c.nullplan_response_status === 'no_response').length,
                pending: nullplanCreditors.filter(c => !c.nullplan_response_status || c.nullplan_response_status === 'pending').length,
                total_debt: nullplanCreditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0),
                acceptance_rate: nullplanCreditors.length > 0 ?
                    Math.round((nullplanCreditors.filter(c => c.nullplan_response_status === 'accepted').length / nullplanCreditors.length) * 100) : 0,
                plan_type: 'Nullplan',
                garnishable_amount: 0,
                legal_reference: '§ 305 Abs. 1 Nr. 1 InsO'
            };

            res.json({
                success: true,
                summary: summary
            });

        } catch (error) {
            console.error('❌ Error getting nullplan responses:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Fix settlement tracking issues manual trigger
     * POST /api/admin/clients/:clientId/fix-settlement-tracking
     */
    fixSettlementTracking = async (req, res) => {
        try {
            const { clientId } = req.params;
            console.log(`🔧 Manually fixing settlement tracking for client ${clientId}`);

            // Use creditorService to retry tracking sync
            if (!this.creditorService) {
                return res.status(500).json({ error: 'Creditor Service not initialized' });
            }

            // Convert clientId to aktenzeichen if needed - creditorService methods usually take aktenzeichen
            const aktenzeichen = await this._getClientAktenzeichen(clientId);
            if (!aktenzeichen) {
                return res.status(404).json({ error: 'Client not found' });
            }

            // We'll trigger the robust update which checks Zendesk vs DB
            const result = await this.creditorService.robustUpdateCreditorsWithRetry(aktenzeichen);

            res.json({
                success: true,
                message: 'Settlement tracking fix triggered',
                result: result
            });

        } catch (error) {
            console.error('❌ Error fixing settlement tracking:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to fix settlement tracking',
                details: error.message
            });
        }
    }
}

// Export a factory function to creating the controller instance
// Now accepting monitor AND creditorService
module.exports = (monitor, creditorService) => new AdminSettlementController(monitor, creditorService);
