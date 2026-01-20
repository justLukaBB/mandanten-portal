const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { authenticateAdmin } = require('../middleware/auth');
const Client = require('../models/Client');
const UserDeletion = require('../models/UserDeletion');
const ImpersonationToken = require('../models/ImpersonationToken');
const ZendeskUserDeletionService = require('../services/zendeskUserDeletionService');

/**
 * DELETE /api/admin/users/:userId
 * Permanently delete a user and ALL associated data
 *
 * DANGEROUS OPERATION - Cannot be undone
 *
 * Security:
 * - Requires admin authentication
 * - Creates permanent audit log
 * - Cascade deletes all related data
 */
router.delete('/users/:userId', authenticateAdmin, async (req, res) => {
  const startTime = Date.now();
  let deletionLog = null;

  try {
    const { userId } = req.params;
    const adminId = req.adminId;
    const { reason } = req.body;

    console.log(`🗑️  User deletion requested:`, { userId, adminId });

    // Validate request
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Find the user - support both MongoDB ObjectId and Aktenzeichen
    let client = null;

    // Check if valid ObjectId (24 hex chars)
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      client = await Client.findById(userId);
    }

    // Fallback: Try by aktenzeichen if not found by ID
    if (!client) {
      client = await Client.findOne({ aktenzeichen: userId });
    }

    if (!client) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with id or aktenzeichen: ${userId}`
      });
    }

    console.log(`👤 User found for deletion:`, {
      id: client.id,
      email: client.email,
      name: `${client.firstName} ${client.lastName}`,
      aktenzeichen: client.aktenzeichen
    });

    // Get request metadata for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Create deletion audit log
    deletionLog = await UserDeletion.logDeletion({
      deleted_user_id: client.id,
      deleted_user_email: client.email || 'no-email',
      deleted_user_name: `${client.firstName} ${client.lastName}`,
      deleted_user_aktenzeichen: client.aktenzeichen,
      admin_id: adminId,
      admin_email: req.adminEmail || 'admin@mandanten-portal.de',
      ip_address: ipAddress,
      user_agent: userAgent,
      deletion_reason: reason || 'Admin-initiated deletion',
      deleted_data_summary: {
        documents_count: client.documents?.length || 0,
        creditors_count: client.final_creditor_list?.length || 0,
        had_financial_data: !!client.financial_data,
        workflow_status: client.workflow_status || client.current_status,
        account_created_at: client.created_at
      },
      deletion_status: 'in_progress'
    });

    console.log(`📝 Deletion audit log created:`, deletionLog._id);

    // Collect all data to be deleted for reporting
    const deletionSummary = {
      user_id: client.id,
      user_email: client.email,
      user_name: `${client.firstName} ${client.lastName}`,
      aktenzeichen: client.aktenzeichen,
      deleted_items: {
        documents: 0,
        creditors: 0,
        impersonation_tokens: 0,
        zendesk_user: 0,
        files: 0
      }
    };

    // Step 1: Delete physical documents/files from filesystem
    console.log(`🗂️  Step 1: Deleting physical files...`);
    try {
      if (client.documents && client.documents.length > 0) {
        for (const doc of client.documents) {
          if (doc.file_path) {
            try {
              const fullPath = path.join(__dirname, '..', doc.file_path);
              if (await fs.pathExists(fullPath)) {
                await fs.remove(fullPath);
                deletionSummary.deleted_items.files++;
                console.log(`  ✓ Deleted file: ${doc.file_path}`);
              }
            } catch (fileError) {
              console.error(`  ✗ Error deleting file ${doc.file_path}:`, fileError.message);
              await deletionLog.addError('file_deletion', fileError);
            }
          }
        }
        deletionSummary.deleted_items.documents = client.documents.length;
      }
    } catch (error) {
      console.error(`❌ Error in file deletion step:`, error);
      await deletionLog.addError('file_deletion_batch', error);
    }

    // Step 2: Delete impersonation tokens for this user
    console.log(`🔐 Step 2: Deleting impersonation tokens...`);
    try {
      const impersonationResult = await ImpersonationToken.deleteMany({
        client_id: client.id
      });
      deletionSummary.deleted_items.impersonation_tokens = impersonationResult.deletedCount || 0;
      console.log(`  ✓ Deleted ${deletionSummary.deleted_items.impersonation_tokens} impersonation tokens`);
    } catch (error) {
      console.error(`❌ Error deleting impersonation tokens:`, error);
      await deletionLog.addError('impersonation_token_deletion', error);
    }

    // Step 3: Count creditors (for reporting)
    if (client.final_creditor_list && client.final_creditor_list.length > 0) {
      deletionSummary.deleted_items.creditors = client.final_creditor_list.length;
    }

    // Step 4: Delete from Zendesk (New Step)
    console.log(`🗑️ Step 4: Deleting from Zendesk...`);
    if (client.zendesk_user_id) {
      try {
        const zendeskResult = await ZendeskUserDeletionService.deleteUser(client.zendesk_user_id);
        if (zendeskResult.success) {
          deletionSummary.deleted_items.zendesk_user = 1;

          if (zendeskResult.actionTaken === 'suspended') {
            console.log(`  ✓ Zendesk user SUSPENDED (fallback): ${client.zendesk_user_id}`);
            await deletionLog.addInfo('zendesk_deletion', 'User suspended (record invalid for deletion)');
          } else {
            const ticketsClosed = zendeskResult.ticketsClosed || 0;
            const isPermanent = zendeskResult.permanentlyDeleted;
            const actionText = isPermanent ? 'PERMANENTLY deleted' : 'deleted';

            console.log(`  ✓ Zendesk user ${actionText}: ${client.zendesk_user_id}. ${ticketsClosed > 0 ? `(Closed ${ticketsClosed} tickets)` : ''}`);

            if (ticketsClosed > 0) {
              await deletionLog.addInfo('zendesk_ticket_closure', `Auto-closed ${ticketsClosed} tickets.`);
            }

            if (isPermanent) {
              await deletionLog.addInfo('zendesk_permanent_deletion', 'User was immediately wiped from Zendesk (skipped 30-day trash).');
            }
          }

        } else {
          // Format the error message for logging
          const errorMsg = typeof zendeskResult.error === 'object'
            ? JSON.stringify(zendeskResult.error)
            : zendeskResult.error;

          console.warn(`  ⚠️ Zendesk deletion failed: ${errorMsg}`);
          await deletionLog.addError('zendesk_deletion', errorMsg);
        }
      } catch (error) {
        console.error(`❌ Error in Zendesk deletion step:`, error);
        await deletionLog.addError('zendesk_deletion_exception', error);
      }
    } else {
      console.log(`  ℹ️ No Zendesk User ID found for this client. Skipping Zendesk deletion.`);
    }

    // Step 5: Delete the user account (with all embedded data)
    console.log(`👤 Step 5: Deleting user account...`);
    try {
      await Client.deleteOne({ _id: client._id });
      console.log(`  ✓ User account deleted`);
    } catch (error) {
      console.error(`❌ Error deleting user account:`, error);
      await deletionLog.addError('user_account_deletion', error);
      throw error; // Critical error - abort
    }

    // Calculate deletion duration
    const duration_ms = Date.now() - startTime;

    // Mark deletion as completed
    await deletionLog.markCompleted(duration_ms);

    console.log(`✅ User deletion completed successfully:`, {
      user: client.email,
      duration_ms,
      deleted: deletionSummary.deleted_items
    });

    // Return success response
    res.json({
      success: true,
      message: `User ${client.firstName} ${client.lastName} and all associated data have been permanently deleted`,
      deleted_user_id: client.id,
      deleted_user_email: client.email,
      deletion_summary: deletionSummary.deleted_items,
      deletion_log_id: deletionLog._id,
      duration_ms
    });

  } catch (error) {
    console.error('❌ User deletion failed:', error);

    // Mark deletion as failed in audit log
    if (deletionLog) {
      await deletionLog.markFailed(error);
    }

    res.status(500).json({
      error: 'User deletion failed',
      message: error.message,
      details: 'The deletion process encountered an error. Some data may have been partially deleted. Please check the deletion audit log.'
    });
  }
});

/**
 * GET /api/admin/user-deletions
 * Get all user deletion audit logs (paginated)
 */
router.get('/user-deletions', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await UserDeletion.getAllDeletions(page, limit);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error fetching user deletion logs:', error);
    res.status(500).json({
      error: 'Failed to fetch deletion logs',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/user-deletions/:userId
 * Get deletion history for a specific user
 */
router.get('/user-deletions/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const deletions = await UserDeletion.find({
      $or: [
        { deleted_user_id: userId },
        { deleted_user_aktenzeichen: userId }
      ]
    }).sort({ deletion_timestamp: -1 });

    res.json({
      success: true,
      user_id: userId,
      deletions,
      count: deletions.length
    });

  } catch (error) {
    console.error('Error fetching user deletion history:', error);
    res.status(500).json({
      error: 'Failed to fetch user deletion history',
      message: error.message
    });
  }
});

module.exports = router;
