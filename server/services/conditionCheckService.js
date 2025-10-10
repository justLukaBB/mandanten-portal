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
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    // Special case: If payment was received first and documents uploaded after reminder
    if (client.first_payment_received && client.document_reminder_sent_via_side_conversation) {
      console.log(`🎯 Documents uploaded after payment + reminder for ${client.aktenzeichen}. Starting 7-day delay...`);
      
      // Add status history for this specific scenario
      client.status_history.push({
        id: require('uuid').v4(),
        status: 'documents_uploaded_after_payment_reminder',
        changed_by: 'system',
        metadata: {
          payment_received_first: true,
          reminder_sent_at: client.document_reminder_side_conversation_at,
          documents_uploaded_at: new Date(),
          side_conversation_id: client.document_reminder_side_conversation_id
        }
      });
      
      await client.save();
      
      // Now check if both conditions are met (they should be)
      return await this.checkAndScheduleIfBothConditionsMet(clientId, 'document_after_reminder');
    }
    
    // Check if both conditions are met first
    const conditionResult = await this.checkAndScheduleIfBothConditionsMet(clientId, 'document');
    
    // NEW: If both conditions are met (payment + documents), trigger processing-complete webhook
    // This ensures the main processing ticket is created when documents are uploaded after payment
    if (conditionResult.bothConditionsMet && conditionResult.scheduled) {
      console.log(`🎯 Both conditions met for ${client.aktenzeichen} - triggering processing-complete webhook...`);
      
      try {
        // Import the processing-complete webhook handler
        const { triggerProcessingCompleteWebhook } = require('../routes/portal-webhooks');
        
        // Trigger the processing-complete webhook asynchronously
        setTimeout(async () => {
          try {
            await triggerProcessingCompleteWebhook(clientId);
            console.log(`✅ Processing-complete webhook triggered for ${client.aktenzeichen}`);
          } catch (error) {
            console.error(`❌ Error triggering processing-complete webhook for ${client.aktenzeichen}:`, error);
          }
        }, 1000); // Small delay to ensure database save completes first
        
        // Update the result to indicate that processing was triggered
        conditionResult.processingTriggered = true;
        conditionResult.processingTriggeredAt = new Date();
        
      } catch (error) {
        console.error(`❌ Error setting up processing-complete webhook for ${client.aktenzeichen}:`, error);
        conditionResult.processingError = error.message;
      }
    }
    
    return conditionResult;
  }
}

module.exports = ConditionCheckService;