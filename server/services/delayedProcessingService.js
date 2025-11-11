const Client = require('../models/Client');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class DelayedProcessingService {
  constructor() {
    this.delayHours = 24; // Default 24 hour delay
    this.sevenDayDelayHours = 168; // 7 days delay for payment + documents
    this.checkIntervalMinutes = 30; // Check every 30 minutes for pending webhooks
  }

  /**
   * Schedule a processing complete webhook to be triggered after the delay period
   * @param {string} clientId - The client ID
   * @param {string} documentId - Optional document ID
   * @param {number} delayHours - Optional custom delay in hours (default 24)
   */
  async scheduleProcessingCompleteWebhook(clientId, documentId = null, delayHours = null) {
    try {
      const delay = delayHours || this.delayHours;
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + delay);

      const client = await Client.findOne({ id: clientId });
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }

      // Store the scheduled webhook information
      client.processing_complete_webhook_scheduled = true;
      client.processing_complete_webhook_scheduled_at = scheduledTime;
      client.processing_complete_webhook_triggered = false;
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'processing_complete_webhook_scheduled',
        changed_by: 'system',
        metadata: {
          scheduled_for: scheduledTime,
          delay_hours: delay,
          reason: 'Giving client time to upload additional documents',
          document_id: documentId
        }
      });

      await client.save();

      console.log(`⏰ Scheduled processing-complete webhook for client ${clientId} at ${scheduledTime.toISOString()}`);
      
      return {
        success: true,
        scheduledFor: scheduledTime,
        delayHours: delay
      };

    } catch (error) {
      console.error(`❌ Error scheduling processing-complete webhook:`, error);
      throw error;
    }
  }

  /**
   * Check for any pending webhooks that need to be triggered
   * This should be called periodically (e.g., every 30 minutes)
   */
  async checkAndTriggerPendingWebhooks() {
    try {
      console.log('🔍 Checking for pending processing-complete webhooks...');

      // Find all clients with scheduled webhooks that haven't been triggered yet
      const pendingClients = await Client.find({
        processing_complete_webhook_scheduled: true,
        processing_complete_webhook_triggered: { $ne: true },
        processing_complete_webhook_scheduled_at: { $lte: new Date() }
      });

      console.log(`📋 Found ${pendingClients.length} clients with pending webhooks`);

      let successCount = 0;
      let errorCount = 0;

      for (const client of pendingClients) {
        try {
          // Double-check that all conditions are still met
          if (!this.shouldTriggerWebhook(client)) {
            console.log(`⏳ Skipping webhook for ${client.aktenzeichen} - conditions no longer met`);
            continue;
          }

          console.log(`🚀 Triggering delayed webhook for ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
          
          const result = await this.triggerProcessingCompleteWebhook(client.id);
          
          if (result.success) {
            // Mark as triggered
            client.processing_complete_webhook_triggered = true;
            client.processing_complete_webhook_triggered_at = new Date();
            
            // Add to status history
            client.status_history.push({
              id: uuidv4(),
              status: 'processing_complete_webhook_triggered',
              changed_by: 'system',
              metadata: {
                scheduled_at: client.processing_complete_webhook_scheduled_at,
                triggered_at: new Date(),
                delay_hours: this.delayHours
              }
            });

            await client.save();
            successCount++;
          } else {
            errorCount++;
          }

        } catch (error) {
          console.error(`❌ Error processing webhook for ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Delayed webhook check complete. Triggered: ${successCount}, Errors: ${errorCount}`);
      
      return {
        totalChecked: pendingClients.length,
        webhooksTriggered: successCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('❌ Error in delayed processing service:', error);
      throw error;
    }
  }

  /**
   * Check if webhook should still be triggered
   * (in case client uploaded more documents or status changed)
   */
  shouldTriggerWebhook(client) {
    // Only trigger if:
    // 1. Payment is confirmed
    // 2. All documents are processed
    // 3. Client hasn't uploaded new documents recently (within last hour)
    
    if (!client.first_payment_received) return false;
    
    const documents = client.documents || [];
    const processingDocs = documents.filter(d => d.processing_status === 'processing');
    if (processingDocs.length > 0) return false;

    // Check if any documents were uploaded in the last hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const recentDocs = documents.filter(d => 
      new Date(d.uploadedAt) > oneHourAgo
    );
    
    if (recentDocs.length > 0) {
      console.log(`⏸️ Client ${client.aktenzeichen} uploaded documents recently, postponing webhook`);
      // Reschedule for another 24 hours
      client.processing_complete_webhook_scheduled_at = new Date();
      client.processing_complete_webhook_scheduled_at.setHours(
        client.processing_complete_webhook_scheduled_at.getHours() + this.delayHours
      );
      return false;
    }

    return true;
  }

  /**
   * Trigger the processing complete webhook immediately
   */
  async triggerProcessingCompleteWebhook(clientId, documentId = null) {
    try {
      const baseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
      const webhookUrl = `${baseUrl}/api/zendesk-webhooks/processing-complete`;
      
      console.log(`🔗 Triggering processing-complete webhook for client ${clientId}`);
      
      const response = await axios.post(webhookUrl, {
        client_id: clientId,
        document_id: documentId,
        timestamp: new Date().toISOString(),
        triggered_by: 'delayed_processing_service',
        delayed_trigger: true
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MandarenPortal-DelayedProcessing/1.0'
        }
      });
      
      console.log(`✅ Processing-complete webhook triggered successfully for client ${clientId}`);
      return { success: true, data: response.data };
      
    } catch (error) {
      console.error(`❌ Failed to trigger processing-complete webhook for client ${clientId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Schedule a 7-day review after both payment and documents are uploaded
   * @param {string} clientId - The client ID
   */
  async scheduleSevenDayReview(clientId) {
    try {
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + this.sevenDayDelayHours);

      const client = await Client.findOne({ id: clientId });
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }

      // Store the scheduled review information
      client.both_conditions_met_at = new Date();
      client.seven_day_review_scheduled = true;
      client.seven_day_review_scheduled_at = scheduledTime;
      client.seven_day_review_triggered = false;
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'seven_day_review_scheduled',
        changed_by: 'system',
        metadata: {
          scheduled_for: scheduledTime,
          delay_days: 7,
          reason: 'Giving client 7 days to upload additional documents after payment and initial upload',
          payment_received: client.first_payment_received,
          documents_count: (client.documents || []).length
        }
      });

      await client.save();

      console.log(`⏰ Scheduled 7-day review for client ${clientId} at ${scheduledTime.toISOString()}`);
      
      return {
        success: true,
        scheduledFor: scheduledTime,
        delayDays: 7
      };

    } catch (error) {
      console.error(`❌ Error scheduling 7-day review:`, error);
      throw error;
    }
  }

  /**
   * Check for and trigger pending 7-day reviews
   */
  async checkAndTriggerSevenDayReviews() {
    try {
      console.log('🔍 Checking for pending 7-day reviews...');

      // Find all clients with scheduled reviews that haven't been triggered yet
      const pendingClients = await Client.find({
        seven_day_review_scheduled: true,
        seven_day_review_triggered: { $ne: true },
        seven_day_review_scheduled_at: { $lte: new Date() }
      });

      console.log(`📋 Found ${pendingClients.length} clients with pending 7-day reviews`);

      let successCount = 0;
      let errorCount = 0;

      for (const client of pendingClients) {
        try {
          console.log(`🚀 Triggering 7-day review for ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
          
          // Mark as triggered
          client.seven_day_review_triggered = true;
          client.seven_day_review_triggered_at = new Date();
          
          // Add to status history
          client.status_history.push({
            id: uuidv4(),
            status: 'seven_day_review_triggered',
            changed_by: 'system',
            metadata: {
              scheduled_at: client.seven_day_review_scheduled_at,
              triggered_at: new Date(),
              documents_at_trigger: (client.documents || []).length,
              delay_days: 7
            }
          });

          // Update status to creditor_review
          client.current_status = 'creditor_review';

          await client.save();

          // Trigger the review process
          await this.triggerCreditorReviewProcess(client.id);
          
          successCount++;

        } catch (error) {
          console.error(`❌ Error processing 7-day review for ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ 7-day review check complete. Triggered: ${successCount}, Errors: ${errorCount}`);
      
      return {
        totalChecked: pendingClients.length,
        reviewsTriggered: successCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('❌ Error in 7-day review service:', error);
      throw error;
    }
  }

  /**
   * Check for clients awaiting confirmation for 3+ minutes and auto-confirm them
   * (Testing mode - normally 7 days)
   */
  async checkAndAutoConfirmCreditors() {
    try {
      console.log('🔍 Checking for clients awaiting confirmation for 3+ minutes (TEST MODE)...');

      const threeMinutesAgo = new Date();
      threeMinutesAgo.setMinutes(threeMinutesAgo.getMinutes() - 3);

      // Find clients who have been awaiting confirmation for 3+ minutes (TEST MODE)
      const pendingClients = await Client.find({
        current_status: 'awaiting_client_confirmation',
        admin_approved: true,
        client_confirmed_creditors: { $ne: true },
        admin_approved_at: { $lte: threeMinutesAgo }
      });

      console.log(`📋 Found ${pendingClients.length} clients ready for auto-confirmation`);

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const client of pendingClients) {
        try {
          const minutesSinceApproval = Math.floor((new Date() - new Date(client.admin_approved_at)) / (1000 * 60));
          
          // Check if client has new unreviewed documents that would block auto-confirmation
          if (this.hasUnreviewedDocumentsBlockingAutoConfirmation(client)) {
            console.log(`⏸️ Skipping auto-confirmation for ${client.aktenzeichen} - has unreviewed documents requiring agent review`);
            skippedCount++;
            continue;
          }
          
          console.log(`⏰ Auto-confirming creditors for ${client.firstName} ${client.lastName} (${client.aktenzeichen}) - ${minutesSinceApproval} minutes since approval`);
          
          // Auto-confirm the creditors
          client.client_confirmed_creditors = true;
          client.client_confirmed_at = new Date();
          client.current_status = 'creditor_contact_initiated';
          
          // Add to status history
          client.status_history.push({
            id: uuidv4(),
            status: 'creditors_auto_confirmed',
            changed_by: 'system',
            metadata: {
              reason: '3-minute auto-confirmation - no client response (TEST MODE)',
              admin_approved_at: client.admin_approved_at,
              minutes_elapsed: minutesSinceApproval,
              auto_confirmed_at: new Date(),
              test_mode: true
            }
          });

          client.status_history.push({
            id: uuidv4(),
            status: 'creditor_contact_initiated',
            changed_by: 'system',
            metadata: {
              reason: 'Auto-triggered after 3-minute creditor confirmation (TEST MODE)',
              creditor_count: (client.final_creditor_list || []).length,
              test_mode: true
            }
          });

          await client.save();

          // Trigger creditor contact process
          await this.triggerCreditorContactService(client.id);
          
          successCount++;
          console.log(`✅ Auto-confirmed and initiated creditor contact for ${client.aktenzeichen}`);

        } catch (error) {
          console.error(`❌ Error auto-confirming creditors for ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Auto-confirmation check complete. Auto-confirmed: ${successCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
      
      return {
        totalChecked: pendingClients.length,
        autoConfirmed: successCount,
        skipped: skippedCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('❌ Error in auto-confirmation service:', error);
      throw error;
    }
  }

  /**
   * Check if client has unreviewed documents that would block auto-confirmation
   */
  hasUnreviewedDocumentsBlockingAutoConfirmation(client) {
    const documents = client.documents || [];
    const config = require('../config/config');
    
    // Check for documents that need manual review
    const documentsNeedingReview = documents.filter(doc => {
      const documentConfidence = doc.extracted_data?.confidence || 0;
      const manualReviewRequired = doc.extracted_data?.manual_review_required === true;
      const isCreditorDocument = doc.is_creditor_document === true;
      const alreadyReviewed = doc.manually_reviewed === true;
      
      // Check if document was uploaded after admin approval
      const uploadedAfterApproval = client.admin_approved_at && 
        new Date(doc.uploadedAt) > new Date(client.admin_approved_at);
      
      // Block auto-confirmation if:
      // 1. Document was uploaded after admin approval AND
      // 2. Document needs review (either manual flag or low confidence creditor doc) AND
      // 3. Document hasn't been manually reviewed yet
      return uploadedAfterApproval && 
             !alreadyReviewed && 
             (manualReviewRequired || (isCreditorDocument && documentConfidence < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD));
    });

    if (documentsNeedingReview.length > 0) {
      console.log(`🔍 Client ${client.aktenzeichen} has ${documentsNeedingReview.length} unreviewed documents uploaded after admin approval:`);
      documentsNeedingReview.forEach(doc => {
        console.log(`   - ${doc.name} (uploaded: ${doc.uploadedAt}, confidence: ${doc.extracted_data?.confidence || 0})`);
      });
      return true;
    }
    
    return false;
  }

  /**
   * Trigger the creditor contact service after auto-confirmation
   */
  async triggerCreditorContactService(clientId) {
    try {
      const baseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
      const webhookUrl = `${baseUrl}/api/zendesk-webhooks/client-creditor-confirmed`;
      
      console.log(`🔗 Triggering creditor contact service for client ${clientId}`);
      
      const response = await axios.post(webhookUrl, {
        client_id: clientId,
        timestamp: new Date().toISOString(),
        triggered_by: 'auto_confirmation_service',
        auto_confirmed: true
      }, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MandarenPortal-AutoConfirmation/1.0'
        }
      });
      
      console.log(`✅ Creditor contact service triggered successfully for client ${clientId}`);
      return { success: true, data: response.data };
      
    } catch (error) {
      console.error(`❌ Failed to trigger creditor contact service for client ${clientId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trigger the creditor review process (create ticket for agents)
   */
  async triggerCreditorReviewProcess(clientId) {
    try {
      const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
      const webhookUrl = `${baseUrl}/api/zendesk-webhooks/creditor-review-ready`;
      
      console.log(`🔗 Triggering creditor review for client ${clientId}`);
      console.log(`📡 Webhook URL: ${webhookUrl}`);
      console.log(`📋 Payload: { client_id: "${clientId}", triggered_by: "seven_day_review_service", review_type: "scheduled_7_day" }`);
      
      const response = await axios.post(webhookUrl, {
        client_id: clientId,
        timestamp: new Date().toISOString(),
        triggered_by: 'seven_day_review_service',
        review_type: 'scheduled_7_day'
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MandarenPortal-SevenDayReview/1.0'
        }
      });
      
      console.log(`✅ Creditor review triggered successfully for client ${clientId}`);
      return { success: true, data: response.data };
      
    } catch (error) {
      console.error(`❌ Failed to trigger creditor review for client ${clientId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a scheduled webhook (e.g., if admin wants to process immediately)
   */
  async cancelScheduledWebhook(clientId) {
    try {
      const client = await Client.findOne({ id: clientId });
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }

      client.processing_complete_webhook_scheduled = false;
      client.processing_complete_webhook_triggered = true; // Mark as handled
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'processing_complete_webhook_cancelled',
        changed_by: 'system',
        metadata: {
          scheduled_for: client.processing_complete_webhook_scheduled_at,
          cancelled_at: new Date(),
          reason: 'Manual override or immediate processing requested'
        }
      });

      await client.save();

      console.log(`❌ Cancelled scheduled webhook for client ${clientId}`);
      
      return { success: true };

    } catch (error) {
      console.error(`❌ Error cancelling scheduled webhook:`, error);
      throw error;
    }
  }
}

module.exports = DelayedProcessingService;