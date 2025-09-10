const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const DelayedProcessingService = require('../services/delayedProcessingService');
const LoginReminderService = require('../services/loginReminderService');

const delayedProcessingService = new DelayedProcessingService();
const loginReminderService = new LoginReminderService();

/**
 * Get all clients with scheduled processing webhooks
 */
router.get('/admin/delayed-processing', async (req, res) => {
  try {
    const pendingClients = await Client.find({
      processing_complete_webhook_scheduled: true,
      processing_complete_webhook_triggered: { $ne: true }
    })
    .select({
      id: 1,
      aktenzeichen: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      processing_complete_webhook_scheduled_at: 1,
      all_documents_processed_at: 1,
      'documents.length': 1,
      'final_creditor_list.length': 1
    })
    .sort({ processing_complete_webhook_scheduled_at: 1 });

    const clientsWithTimeRemaining = pendingClients.map(client => {
      const scheduledTime = new Date(client.processing_complete_webhook_scheduled_at);
      const now = new Date();
      const timeRemaining = Math.max(0, scheduledTime.getTime() - now.getTime());
      const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

      return {
        ...client.toObject(),
        timeRemaining: {
          hours: hoursRemaining,
          minutes: minutesRemaining,
          isReady: timeRemaining === 0
        }
      };
    });

    res.json({
      success: true,
      clients: clientsWithTimeRemaining,
      summary: {
        total: clientsWithTimeRemaining.length,
        ready: clientsWithTimeRemaining.filter(c => c.timeRemaining.isReady).length,
        pending: clientsWithTimeRemaining.filter(c => !c.timeRemaining.isReady).length
      }
    });

  } catch (error) {
    console.error('Error fetching delayed processing clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delayed processing clients',
      details: error.message
    });
  }
});

/**
 * Trigger processing immediately for a specific client (admin override)
 */
router.post('/admin/delayed-processing/:clientId/trigger-now', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    if (!client.processing_complete_webhook_scheduled) {
      return res.status(400).json({
        success: false,
        error: 'Client does not have a scheduled webhook'
      });
    }

    // Cancel the scheduled webhook and trigger immediately
    await delayedProcessingService.cancelScheduledWebhook(clientId);
    const result = await delayedProcessingService.triggerProcessingCompleteWebhook(clientId);

    if (result.success) {
      // Mark as triggered
      client.processing_complete_webhook_triggered = true;
      client.processing_complete_webhook_triggered_at = new Date();
      
      client.status_history.push({
        id: require('uuid').v4(),
        status: 'processing_complete_webhook_triggered_manual',
        changed_by: 'admin',
        metadata: {
          triggered_early: true,
          admin_override: true,
          original_scheduled_time: client.processing_complete_webhook_scheduled_at
        }
      });

      await client.save();

      res.json({
        success: true,
        message: 'Processing webhook triggered immediately',
        webhookTriggered: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to trigger webhook',
        details: result.error
      });
    }

  } catch (error) {
    console.error('Error triggering immediate processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger immediate processing',
      details: error.message
    });
  }
});

/**
 * Cancel scheduled webhook for a client
 */
router.post('/admin/delayed-processing/:clientId/cancel', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    if (!client.processing_complete_webhook_scheduled) {
      return res.status(400).json({
        success: false,
        error: 'Client does not have a scheduled webhook'
      });
    }

    await delayedProcessingService.cancelScheduledWebhook(clientId);

    res.json({
      success: true,
      message: 'Scheduled webhook cancelled',
      cancelled: true
    });

  } catch (error) {
    console.error('Error cancelling scheduled webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel scheduled webhook',
      details: error.message
    });
  }
});

/**
 * Reschedule webhook with custom delay
 */
router.post('/admin/delayed-processing/:clientId/reschedule', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { delayHours = 24 } = req.body;
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Cancel existing schedule
    if (client.processing_complete_webhook_scheduled) {
      await delayedProcessingService.cancelScheduledWebhook(clientId);
    }

    // Schedule with new delay
    const result = await delayedProcessingService.scheduleProcessingCompleteWebhook(
      clientId, 
      null, 
      delayHours
    );

    res.json({
      success: true,
      message: `Webhook rescheduled for ${delayHours} hours from now`,
      scheduledFor: result.scheduledFor,
      delayHours: result.delayHours
    });

  } catch (error) {
    console.error('Error rescheduling webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reschedule webhook',
      details: error.message
    });
  }
});

/**
 * Immediate review trigger - creates Zendesk ticket instantly for any client ready for review
 */
router.post('/admin/immediate-review/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Validate client is ready for review
    if (!client.first_payment_received) {
      return res.status(400).json({
        success: false,
        error: 'Client has not made first payment yet'
      });
    }

    const documents = client.documents || [];
    if (documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Client has no documents uploaded'
      });
    }

    const processingDocs = documents.filter(d => d.processing_status === 'processing');
    if (processingDocs.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${processingDocs.length} documents are still processing. Please wait for completion.`
      });
    }

    // Check if already triggered
    if (client.processing_complete_webhook_triggered) {
      return res.status(400).json({
        success: false,
        error: 'Processing complete webhook has already been triggered for this client'
      });
    }

    // Cancel any scheduled webhook first
    if (client.processing_complete_webhook_scheduled) {
      await delayedProcessingService.cancelScheduledWebhook(clientId);
    }

    // Trigger the processing complete webhook immediately
    const result = await delayedProcessingService.triggerProcessingCompleteWebhook(clientId);

    if (result.success) {
      // Mark as triggered with admin override
      client.processing_complete_webhook_triggered = true;
      client.processing_complete_webhook_triggered_at = new Date();
      
      client.status_history.push({
        id: require('uuid').v4(),
        status: 'processing_complete_webhook_triggered_admin',
        changed_by: 'admin',
        metadata: {
          triggered_immediately: true,
          admin_override: true,
          bypassed_delay: client.processing_complete_webhook_scheduled || false,
          documents_count: documents.length,
          creditors_count: client.final_creditor_list?.length || 0
        }
      });

      await client.save();

      res.json({
        success: true,
        message: 'Immediate review triggered successfully',
        webhookTriggered: true,
        zendeskTicketCreated: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to trigger immediate review',
        details: result.error
      });
    }

  } catch (error) {
    console.error('Error triggering immediate review:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger immediate review',
      details: error.message
    });
  }
});

/**
 * Manual trigger of the delayed webhook check (for testing)
 */
router.post('/admin/delayed-processing/check-now', async (req, res) => {
  try {
    console.log('📧 Admin triggered manual delayed webhook check');
    
    const result = await delayedProcessingService.checkAndTriggerPendingWebhooks();
    
    res.json({
      success: true,
      message: 'Delayed webhook check completed',
      totalChecked: result.totalChecked,
      webhooksTriggered: result.webhooksTriggered,
      errors: result.errors
    });
    
  } catch (error) {
    console.error('Error in manual delayed webhook check:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check delayed webhooks',
      details: error.message
    });
  }
});

/**
 * Manual trigger of the login reminder check (for testing)
 */
router.post('/admin/login-reminders/check-now', async (req, res) => {
  try {
    console.log('📧 Admin triggered manual login reminder check');
    
    const result = await loginReminderService.checkAndSendLoginReminders();
    
    res.json({
      success: true,
      message: 'Login reminder check completed',
      totalChecked: result.totalChecked,
      loginRemindersSent: result.loginRemindersSent,
      documentRemindersSent: result.documentRemindersSent,
      errors: result.errors
    });
    
  } catch (error) {
    console.error('Error in manual login reminder check:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check login reminders',
      details: error.message
    });
  }
});

module.exports = router;