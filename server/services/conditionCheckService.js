const Client = require('../models/Client');
const DelayedProcessingService = require('./delayedProcessingService');
const { v4: uuidv4 } = require('uuid');

class ConditionCheckService {
  constructor() {
    this.delayedProcessingService = new DelayedProcessingService();
  }

  /**
   * Check if documents are uploaded and schedule 7-day review.
   * Payment gate has been removed — only documents matter now.
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

      // Only check for documents (payment gate removed)
      const hasDocuments = client.documents && client.documents.length > 0;

      console.log(`🔍 Checking conditions for ${client.aktenzeichen}:`);
      console.log(`   - Documents uploaded: ${hasDocuments} (${client.documents?.length || 0} documents)`);
      console.log(`   - Triggered by: ${triggerType}`);

      if (hasDocuments) {
        console.log(`✅ Documents present for ${client.aktenzeichen}! Scheduling 7-day review...`);

        client.status_history.push({
          id: uuidv4(),
          status: 'documents_condition_met',
          changed_by: 'system',
          metadata: {
            trigger_type: triggerType,
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
        hasDocuments,
        documentsCount: client.documents?.length || 0
      };

    } catch (error) {
      console.error(`❌ Error checking conditions for client ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Handle payment confirmation — legacy no-op (payment gate removed).
   * Still schedules 7-day review if documents exist.
   */
  async handlePaymentConfirmed(clientId) {
    console.log(`💰 Payment confirmed for client ${clientId} (payment gate removed, checking documents only)...`);
    return await this.checkAndScheduleIfBothConditionsMet(clientId, 'payment');
  }

  /**
   * Handle document upload and check if conditions are met
   */
  async handleDocumentUploaded(clientId) {
    console.log(`📄 Document uploaded for client ${clientId}, checking conditions...`);

    const client = await Client.findOne({ id: clientId });
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    // Special case: Documents uploaded after no-documents email
    if (client.no_documents_email_sent) {
      console.log(`[auto-continuation] Documents uploaded after no-documents email for ${client.aktenzeichen}.`);

      client.status_history.push({
        id: uuidv4(),
        status: 'documents_uploaded_after_no_documents_email',
        changed_by: 'system',
        metadata: {
          no_documents_email_sent_at: client.no_documents_email_sent_at,
          documents_uploaded_at: new Date()
        }
      });

      await client.save();
      return await this.checkAndScheduleIfBothConditionsMet(clientId, 'document_after_no_documents_email');
    }

    // Special case: Documents uploaded after reminder
    if (client.document_reminder_sent_via_side_conversation) {
      console.log(`🎯 Documents uploaded after reminder for ${client.aktenzeichen}. Starting 7-day delay...`);

      client.status_history.push({
        id: require('uuid').v4(),
        status: 'documents_uploaded_after_reminder',
        changed_by: 'system',
        metadata: {
          reminder_sent_at: client.document_reminder_side_conversation_at,
          documents_uploaded_at: new Date(),
          side_conversation_id: client.document_reminder_side_conversation_id
        }
      });

      await client.save();
      return await this.checkAndScheduleIfBothConditionsMet(clientId, 'document_after_reminder');
    }

    return await this.checkAndScheduleIfBothConditionsMet(clientId, 'document');
  }
}

module.exports = ConditionCheckService;
