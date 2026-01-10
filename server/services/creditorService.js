const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');

/**
 * CreditorService
 * Handles all creditor-related business logic and data operations
 */
class CreditorService {
    /**
     * Map frontend camelCase fields to backend snake_case schema
     * @param {Object} creditorData - Creditor data from frontend
     * @returns {Object} Mapped creditor data
     */
    mapFieldsToSchema(creditorData) {
        return {
            sender_name: (creditorData.name || '').trim(),
            sender_email: (creditorData.email || '').trim(),
            sender_address: (creditorData.address || '').trim(),
            reference_number: (creditorData.referenceNumber || '').trim(),
            claim_amount: creditorData.amount ? parseFloat(creditorData.amount) : 0,
            is_representative: creditorData.isRepresentative === true,
            actual_creditor: (creditorData.actualCreditor || '').trim(),
        };
    }

    /**
     * Create a new creditor object with metadata
     * @param {Object} creditorData - Creditor data from frontend
     * @param {String} createdBy - Who created the creditor ('client' or 'admin')
     * @param {String} reviewedBy - Who reviewed/created (userId or 'client')
     * @returns {Object} Complete creditor object
     */
    createCreditorObject(creditorData, createdBy = 'client', reviewedBy = 'client') {
        const mappedData = this.mapFieldsToSchema(creditorData);

        return {
            id: uuidv4(),
            ...mappedData,

            // Manual creation metadata
            status: 'confirmed',
            confidence: 1.0,
            ai_confidence: 1.0,
            manually_reviewed: true,
            reviewed_by: reviewedBy,
            reviewed_at: new Date(),
            confirmed_at: new Date(),
            created_at: new Date(),
            created_via: createdBy === 'admin' ? 'admin_manual_entry' : 'client_manual_entry',
            correction_notes: (creditorData.notes || '').trim() || `Manually created by ${createdBy}`,
            review_action: 'manually_created',

            // Document association
            document_id: null,
            source_document: `Manual Entry (${createdBy === 'admin' ? 'Admin' : 'Client'} Portal)`,
            source_document_id: null
        };
    }

    /**
     * Add creditor to client's final_creditor_list
     * @param {String} clientId - Client ID
     * @param {Object} creditorData - Creditor data
     * @param {String} createdBy - Who created the creditor
     * @param {String} reviewedBy - Who reviewed/created
     * @returns {Promise<Object>} Result object with success status and data
     */
    async addCreditorToClient(clientId, creditorData, createdBy = 'client', reviewedBy = 'client') {
        try {
            // Validate required fields
            if (!creditorData.name || creditorData.name.trim() === '') {
                return {
                    success: false,
                    error: 'Name is required'
                };
            }

            // Find client
            const client = await this.getClient(clientId);

            if (!client) {
                return {
                    success: false,
                    error: 'Client not found'
                };
            }

            // Create new creditor
            const newCreditor = this.createCreditorObject(creditorData, createdBy, reviewedBy);

            // Initialize final_creditor_list if it doesn't exist
            if (!client.final_creditor_list) {
                client.final_creditor_list = [];
            }

            // Add creditor to the list
            client.final_creditor_list.push(newCreditor);

            // Add to status history
            client.status_history = client.status_history || [];
            client.status_history.push({
                id: uuidv4(),
                status: 'manual_creditor_added',
                changed_by: createdBy,
                metadata: {
                    creditor_name: creditorData.name,
                    creditor_amount: creditorData.amount || 0,
                    total_creditors: client.final_creditor_list.length,
                    added_via: `${createdBy}_portal`
                },
                created_at: new Date()
            });

            // Save client
            await this.saveClient(client);

            console.log(`✅ Successfully added creditor "${creditorData.name}" to client ${client.aktenzeichen}`);

            return {
                success: true,
                creditor: {
                    id: newCreditor.id,
                    name: newCreditor.sender_name,
                    amount: newCreditor.claim_amount
                },
                client: {
                    id: client.id,
                    aktenzeichen: client.aktenzeichen,
                    total_creditors: client.final_creditor_list.length
                }
            };

        } catch (error) {
            console.error('❌ Error in addCreditorToClient:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get client by ID
     * @param {String} clientId - Client ID
     * @returns {Promise<Object|null>} Client object or null
     */
    async getClient(clientId) {
        try {
            // Try to find by id first, then by aktenzeichen
            let client = await Client.findOne({ id: clientId });
            if (!client) {
                client = await Client.findOne({ aktenzeichen: clientId });
            }
            return client;
        } catch (error) {
            console.error('Error getting client:', error);
            throw error;
        }
    }

    /**
     * Get client with creditors list
     * @param {String} clientId - Client ID
     * @returns {Promise<Object>} Client info and creditors list
     */
    async getClientWithCreditors(clientId) {
        try {
            const client = await this.getClient(clientId);

            if (!client) {
                return {
                    success: false,
                    error: 'Client not found'
                };
            }

            // Return client info and creditors
            return {
                success: true,
                client: {
                    id: client.id,
                    name: `${client.firstName} ${client.lastName}`.trim(),
                    aktenzeichen: client.aktenzeichen,
                    email: client.email
                },
                creditors: client.final_creditor_list || []
            };

        } catch (error) {
            console.error('Error getting client with creditors:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Save client to database
     * @param {Object} client - Client object
     * @returns {Promise<Object>} Saved client
     */
    async saveClient(client) {
        try {
            await client.save();
            return client;
        } catch (error) {
            console.error('Error saving client:', error);
            throw error;
        }
    }
}

module.exports = CreditorService;
