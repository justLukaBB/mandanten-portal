const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const DocumentReminderService = require('../services/documentReminderService');
const documentReminderService = new DocumentReminderService();

/**
 * Get all clients who have paid but haven't uploaded documents
 * This endpoint is used by the PendingDocumentsMonitor component
 */
router.get('/admin/clients/pending-documents', async (req, res) => {
  try {
    // Find clients with payment but no documents
    const pendingClients = await Client.find({
      first_payment_received: true,
      payment_ticket_type: 'document_request',
      'documents': { $size: 0 }
    })
    .select({
      id: 1,
      aktenzeichen: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      phone: 1,
      first_payment_received: 1,
      payment_processed_at: 1,
      document_reminder_count: 1,
      last_document_reminder_at: 1,
      documents: 1,
      zendesk_ticket_id: 1,
      zendesk_tickets: 1
    })
    .sort({ payment_processed_at: 1 }); // Oldest payments first

    // Calculate additional metrics
    const clientsWithMetrics = pendingClients.map(client => {
      const daysWaiting = Math.floor(
        (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Find the most relevant Zendesk ticket
      const relevantTicket = client.zendesk_tickets?.find(
        t => t.ticket_type === 'payment_review' || t.ticket_type === 'main_ticket'
      );

      return {
        ...client.toObject(),
        daysWaiting,
        urgencyScore: calculateUrgencyScore(daysWaiting, client.document_reminder_count || 0),
        zendesk_ticket_id: relevantTicket?.ticket_id || client.zendesk_ticket_id
      };
    });

    // Sort by urgency score (highest first)
    clientsWithMetrics.sort((a, b) => b.urgencyScore - a.urgencyScore);

    res.json({
      success: true,
      clients: clientsWithMetrics,
      summary: {
        total: clientsWithMetrics.length,
        critical: clientsWithMetrics.filter(c => c.urgencyScore >= 8).length,
        warning: clientsWithMetrics.filter(c => c.urgencyScore >= 5 && c.urgencyScore < 8).length,
        normal: clientsWithMetrics.filter(c => c.urgencyScore < 5).length,
        averageDaysWaiting: clientsWithMetrics.reduce((sum, c) => sum + c.daysWaiting, 0) / clientsWithMetrics.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching pending document clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending clients',
      details: error.message
    });
  }
});

/**
 * Send manual reminder for a specific client
 */
router.post('/admin/clients/:clientId/send-reminder', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findOne({ id: clientId });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Use the document reminder service to send reminder
    const result = await documentReminderService.sendDocumentReminder(client);
    
    res.json({
      success: true,
      reminderSent: true,
      reminderCount: result.reminderCount,
      zendeskUpdated: result.zendeskUpdated
    });
    
  } catch (error) {
    console.error('Error sending manual reminder:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send reminder',
      details: error.message
    });
  }
});

/**
 * Get document upload statistics
 */
router.get('/admin/stats/document-uploads', async (req, res) => {
  try {
    const stats = await Client.aggregate([
      {
        $match: {
          first_payment_received: true
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: 1 },
          withDocuments: {
            $sum: {
              $cond: [{ $gt: [{ $size: '$documents' }, 0] }, 1, 0]
            }
          },
          avgDaysToUpload: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $size: '$documents' }, 0] },
                    '$payment_processed_at',
                    '$documents_uploaded_after_payment_at'
                  ]
                },
                {
                  $divide: [
                    {
                      $subtract: [
                        '$documents_uploaded_after_payment_at',
                        '$payment_processed_at'
                      ]
                    },
                    1000 * 60 * 60 * 24 // Convert to days
                  ]
                },
                null
              ]
            }
          },
          avgRemindersBeforeUpload: {
            $avg: {
              $cond: [
                { $gt: ['$document_reminder_count', 0] },
                '$document_reminder_count',
                null
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalPaid: 0,
      withDocuments: 0,
      avgDaysToUpload: 0,
      avgRemindersBeforeUpload: 0
    };

    res.json({
      success: true,
      stats: {
        ...result,
        withoutDocuments: result.totalPaid - result.withDocuments,
        uploadRate: result.totalPaid > 0 ? 
          ((result.withDocuments / result.totalPaid) * 100).toFixed(1) : 0,
        avgDaysToUpload: result.avgDaysToUpload?.toFixed(1) || 0,
        avgRemindersBeforeUpload: result.avgRemindersBeforeUpload?.toFixed(1) || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching document upload stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      details: error.message
    });
  }
});

/**
 * Calculate urgency score based on days waiting and reminder count
 * Score 0-10: 10 being most urgent
 */
function calculateUrgencyScore(daysWaiting, reminderCount) {
  let score = 0;
  
  // Days waiting contribution (0-5 points)
  if (daysWaiting >= 10) score += 5;
  else if (daysWaiting >= 7) score += 4;
  else if (daysWaiting >= 5) score += 3;
  else if (daysWaiting >= 3) score += 2;
  else if (daysWaiting >= 1) score += 1;
  
  // Reminder count contribution (0-5 points)
  if (reminderCount >= 5) score += 5;
  else if (reminderCount >= 3) score += 4;
  else if (reminderCount >= 2) score += 3;
  else if (reminderCount >= 1) score += 2;
  
  return Math.min(score, 10);
}

module.exports = router;