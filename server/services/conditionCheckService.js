const Client = require('../models/Client');
const DelayedProcessingService = require('./delayedProcessingService');
const { v4: uuidv4 } = require('uuid');

class ConditionCheckService {
  constructor() {
    this.delayedProcessingService = new DelayedProcessingService();
  }

  /**
   * Check if both conditions (payment + documents) are met and schedule 7-day review
   * @param {string} clientId - The client ID
   * @param {string} triggerType - 'payment' or 'document' to identify what triggered the check
   */
  async checkAndScheduleIfBothConditionsMet(clientId, triggerType) {
    try {
      const client = await Client.findOne({ id: clientId });
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }

      // Check if 7-day review is already scheduled
      if (client.seven_day_review_scheduled) {
        console.log(`⏰ 7-day review already scheduled for client ${clientId}`);
        return {
          alreadyScheduled: true,
          scheduledAt: client.seven_day_review_scheduled_at
        };
      }

      // Check both conditions
      const hasPayment = client.first_payment_received === true;
      const hasDocuments = client.documents && client.documents.length > 0;
      
      console.log(`🔍 Checking conditions for ${client.aktenzeichen}:`);
      console.log(`   - Payment received: ${hasPayment}`);
      console.log(`   - Documents uploaded: ${hasDocuments} (${client.documents?.length || 0} documents)`);
      console.log(`   - Triggered by: ${triggerType}`);

      if (hasPayment && hasDocuments) {
        console.log(`✅ Both conditions met for ${client.aktenzeichen}! Scheduling 7-day review...`);
        
        // Add to status history
        client.status_history.push({
          id: uuidv4(),
          status: 'both_conditions_met',
          changed_by: 'system',
          metadata: {
            trigger_type: triggerType,
            payment_received: hasPayment,
            documents_count: client.documents.length,
            timestamp: new Date()
          }
        });

        await client.save();

        // Schedule the 7-day review
        const result = await this.delayedProcessingService.scheduleSevenDayReview(clientId);
        
        return {
          bothConditionsMet: true,
          scheduled: true,
          scheduledFor: result.scheduledFor,
          triggeredBy: triggerType
        };
      }

      return {
        bothConditionsMet: false,
        hasPayment,
        hasDocuments,
        documentsCount: client.documents?.length || 0
      };

    } catch (error) {
      console.error(`❌ Error checking conditions for client ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Handle payment confirmation and check if both conditions are met
   */
  async handlePaymentConfirmed(clientId) {
    console.log(`💰 Payment confirmed for client ${clientId}, checking if both conditions are met...`);
    return await this.checkAndScheduleIfBothConditionsMet(clientId, 'payment');
  }

  /**
   * Handle document upload and check if both conditions are met
   */
  async handleDocumentUploaded(clientId) {
    console.log(`📄 Document uploaded for client ${clientId}, checking if both conditions are met...`);
    return await this.checkAndScheduleIfBothConditionsMet(clientId, 'document');
  }
}

module.exports = ConditionCheckService;