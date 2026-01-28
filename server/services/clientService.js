const Client = require('../models/Client');
const databaseService = require('./database');

// Promise-based mutex for database operations to prevent race conditions
const processingMutex = new Map();

class ClientService {
    constructor() {
        this.processingMutex = processingMutex;
    }

    // Pure MongoDB function - no fallback to in-memory
    async getClient(clientId) {
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

    // Helper function to get client's aktenzeichen for settlement services
    async getClientAktenzeichen(clientId) {
        try {
            const client = await this.getClient(clientId);
            if (!client) {
                return null;
            }
            return client.aktenzeichen;
        } catch (error) {
            console.error('Error getting client aktenzeichen:', error);
            return null;
        }
    }

    // Pure MongoDB function - no fallback to in-memory
    async saveClient(clientData) {
        try {
            if (!databaseService.isHealthy()) {
                throw new Error('Database connection not available');
            }

            console.log(`💾 saveClient: Updating client ${clientData.aktenzeichen || clientData.id}`);

            // Log for debugging calculation table persistence
            if (clientData.creditor_calculation_table) {
                console.log(`💾 saveClient: Client has creditor_calculation_table, length: ${clientData.creditor_calculation_table.length}`);
            }

            const client = await Client.findOneAndUpdate(
                { id: clientData.id },
                clientData,
                { upsert: true, new: true }
            );

            console.log(`✅ saveClient: Successfully saved client ${client.id}`);
            return client;
        } catch (error) {
            console.error('❌ Error saving client to MongoDB:', error);
            throw error;
        }
    }

    // Safe client update function to prevent race conditions
    async safeClientUpdate(clientId, updateFunction) {
        // If no lock exists, create one resolved to start immediately
        if (!this.processingMutex.has(clientId)) {
            this.processingMutex.set(clientId, Promise.resolve());
        }

        // Chain this operation after the previous one
        const currentLock = this.processingMutex.get(clientId);

        const newLock = currentLock.then(async () => {
            try {
                console.log(`🔒 Acquiring lock for client ${clientId}`);

                // Get fresh client data
                const client = await this.getClient(clientId);
                if (!client) {
                    throw new Error(`Client ${clientId} not found`);
                }

                const beforeCreditorCount = (client.final_creditor_list || []).length;
                console.log(`📊 [safeClientUpdate] Before update - final_creditor_list count: ${beforeCreditorCount}`);

                // Apply the update function
                const updatedClient = await updateFunction(client);

                if (!updatedClient) {
                    console.error(`❌ [safeClientUpdate] updateFunction returned null/undefined!`);
                    throw new Error('Update function did not return a client object');
                }

                const afterCreditorCount = (updatedClient.final_creditor_list || []).length;
                console.log(`📊 [safeClientUpdate] After update - final_creditor_list count: ${afterCreditorCount}`);

                // Save to database
                const savedClient = await this.saveClient(updatedClient);

                // Verify save
                const savedCreditorCount = (savedClient.final_creditor_list || []).length;
                console.log(`📊 [safeClientUpdate] After save - final_creditor_list count: ${savedCreditorCount}`);

                if (savedCreditorCount !== afterCreditorCount) {
                    console.error(`⚠️ [safeClientUpdate] CREDITOR COUNT MISMATCH! Expected: ${afterCreditorCount}, Got: ${savedCreditorCount}`);
                }

                console.log(`✅ Lock released for client ${clientId}`);
                return savedClient;
            } catch (error) {
                console.error(`❌ Error in safeClientUpdate for ${clientId}:`, error);
                throw error;
            }
        });

        // Update the lock to point to the new promise
        this.processingMutex.set(clientId, newLock);

        return newLock;
    }
}

module.exports = new ClientService();
