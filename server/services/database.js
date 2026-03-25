const mongoose = require('mongoose');
require('dotenv').config();

class DatabaseService {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is required');
      }

      console.log('🔌 Connecting to MongoDB...');
      console.log('📍 MongoDB URI:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials in logs

      await mongoose.connect(mongoUri);

      this.isConnected = true;
      console.log('✅ Connected to MongoDB successfully');

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('🔌 MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('🔌 Disconnected from MongoDB');
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
    }
  }

  isHealthy() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  async testConnection() {
    try {
      await mongoose.connection.db.admin().ping();
      console.log('🏓 MongoDB ping successful');
      return true;
    } catch (error) {
      console.error('❌ MongoDB ping failed:', error);
      return false;
    }
  }

  // Migration helper - convert in-memory data to MongoDB
  async migrateInMemoryData(inMemoryData) {
    try {
      const Client = require('../models/Client');

      console.log('🔄 Starting migration of in-memory data to MongoDB...');

      let migratedCount = 0;
      let skippedCount = 0;

      for (const [clientId, clientData] of Object.entries(inMemoryData)) {
        try {
          // Check if client already exists
          const existingClient = await Client.findOne({ id: clientId });

          if (existingClient) {
            console.log(`⏭️ Client ${clientId} already exists, skipping...`);
            skippedCount++;
            continue;
          }

          // Ensure kanzleiId is set
          if (!clientData.kanzleiId) {
            const Kanzlei = require('../models/Kanzlei');
            const defaultKanzlei = await Kanzlei.findOne({ is_active: true }).sort({ created_at: 1 });
            if (defaultKanzlei) {
              clientData.kanzleiId = defaultKanzlei.id;
            } else {
              console.warn(`⚠️ No active kanzlei found, client ${clientId} will have no kanzleiId`);
            }
          }

          // Create new client
          const newClient = new Client(clientData);
          await newClient.save();

          console.log(`✅ Migrated client: ${clientId} (${clientData.firstName} ${clientData.lastName})`);
          migratedCount++;

        } catch (error) {
          console.error(`❌ Error migrating client ${clientId}:`, error.message);
        }
      }

      console.log(`🎉 Migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
      return { migrated: migratedCount, skipped: skippedCount };

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService();