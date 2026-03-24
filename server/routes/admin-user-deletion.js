const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { authenticateAdmin } = require('../middleware/auth');
const Client = require('../models/Client');
const UserDeletion = require('../models/UserDeletion');
const ImpersonationToken = require('../models/ImpersonationToken');
const CreditorEmail = require('../models/CreditorEmail');
const DocumentProcessingJob = require('../models/DocumentProcessingJob');
const { deleteFromGCS } = require('../services/gcs-service');

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

    // Find the user - try by id first, then by aktenzeichen
    let client = await Client.findOne({ id: userId, ...req.tenantFilter });
    if (!client) {
      client = await Client.findOne({ aktenzeichen: userId, ...req.tenantFilter });
    }

    if (!client) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with id or aktenzeichen: ${userId}`
      });
    }

    // Strict cross-tenant guard (post-query verification)
    if (req.kanzleiId && (!client.kanzleiId || client.kanzleiId !== req.kanzleiId)) {
      console.error(`[SECURITY] Cross-tenant deletion blocked: admin kanzlei ${req.kanzleiId}, client kanzlei ${client.kanzleiId}`);
      return res.status(403).json({ error: 'Cannot delete clients from another kanzlei' });
    }

    console.log(`User found for deletion:`, {
      id: client.id,
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
        had_schufa_report: !!client.schufa_report,
        had_zendesk_data: !!(client.zendesk_ticket_id || client.zendesk_user_id),
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
        gcs_files: 0,
        local_files: 0,
        creditors: 0,
        creditor_emails: 0,
        processing_jobs: 0,
        impersonation_tokens: 0,
      }
    };

    // Step 1: Delete GCS files + local files for all documents
    console.log(`🗂️  Step 1: Deleting document files (GCS + local)...`);
    try {
      if (client.documents && client.documents.length > 0) {
        for (const doc of client.documents) {
          // Try GCS deletion via URL or filename
          const gcsIdentifier = doc.url || doc.filename;
          if (gcsIdentifier) {
            try {
              const deleted = await deleteFromGCS(gcsIdentifier);
              if (deleted) {
                deletionSummary.deleted_items.gcs_files++;
                console.log(`  ✓ Deleted GCS file: ${doc.filename || doc.name}`);
              }
            } catch (gcsError) {
              console.error(`  ✗ GCS delete failed for ${doc.filename}:`, gcsError.message);
              await deletionLog.addError('gcs_file_deletion', gcsError);
            }
          }

          // Also try local file_path (legacy)
          if (doc.file_path) {
            try {
              const fullPath = path.join(__dirname, '..', doc.file_path);
              if (await fs.pathExists(fullPath)) {
                await fs.remove(fullPath);
                deletionSummary.deleted_items.local_files++;
              }
            } catch (fileError) {
              await deletionLog.addError('local_file_deletion', fileError);
            }
          }
        }
        deletionSummary.deleted_items.documents = client.documents.length;
      }
      console.log(`  ✓ ${deletionSummary.deleted_items.gcs_files} GCS files, ${deletionSummary.deleted_items.local_files} local files deleted`);
    } catch (error) {
      console.error(`❌ Error in file deletion step:`, error);
      await deletionLog.addError('file_deletion_batch', error);
    }

    // Step 2: Delete impersonation tokens
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

    // Step 3: Delete CreditorEmail records
    console.log(`📧 Step 3: Deleting creditor email records...`);
    try {
      const emailResult = await CreditorEmail.deleteMany({
        $or: [
          { client_id: client._id },
          { client_aktenzeichen: client.aktenzeichen }
        ]
      });
      deletionSummary.deleted_items.creditor_emails = emailResult.deletedCount || 0;
      console.log(`  ✓ Deleted ${deletionSummary.deleted_items.creditor_emails} creditor email records`);
    } catch (error) {
      console.error(`❌ Error deleting creditor emails:`, error);
      await deletionLog.addError('creditor_email_deletion', error);
    }

    // Step 4: Delete DocumentProcessingJob records
    console.log(`⚙️  Step 4: Deleting document processing jobs...`);
    try {
      const jobResult = await DocumentProcessingJob.deleteMany({
        client_id: client.id
      });
      deletionSummary.deleted_items.processing_jobs = jobResult.deletedCount || 0;
      console.log(`  ✓ Deleted ${deletionSummary.deleted_items.processing_jobs} processing jobs`);
    } catch (error) {
      console.error(`❌ Error deleting processing jobs:`, error);
      await deletionLog.addError('processing_job_deletion', error);
    }

    // Step 5: Count creditors (for reporting — embedded in Client, deleted with it)
    if (client.final_creditor_list && client.final_creditor_list.length > 0) {
      deletionSummary.deleted_items.creditors = client.final_creditor_list.length;
    }

    // Step 6: Anonymize Zendesk data (best-effort, non-blocking)
    if (client.zendesk_ticket_id || client.zendesk_user_id) {
      console.log(`🎫 Step 6: Zendesk anonymization note...`);
      // Zendesk API anonymization would require zendeskService integration.
      // For now, log that manual Zendesk cleanup is needed.
      console.log(`  ⚠️  Zendesk data exists (user: ${client.zendesk_user_id}, ticket: ${client.zendesk_ticket_id}) — requires manual anonymization`);
      await deletionLog.addError('zendesk_anonymization', new Error(
        `Manual Zendesk cleanup required: user_id=${client.zendesk_user_id}, ticket_id=${client.zendesk_ticket_id}`
      ));
    }

    // Step 7: Delete the user account (with all embedded data)
    console.log(`👤 Step 7: Deleting user account...`);
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

/**
 * GET /api/admin/clients/:userId/gdpr-export
 * Art. 15 DSGVO — Auskunftsrecht / Art. 20 — Datenportabilität
 *
 * Returns ALL data stored about a client as structured JSON.
 * Includes: profile, documents metadata, creditors, status history,
 * financial data, creditor emails, impersonation history, processing jobs.
 *
 * Sensitive fields (password_hash, session_token, portal_token) are excluded.
 */
router.get('/clients/:userId/gdpr-export', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.adminId;

    // Find client — tenant-scoped
    let client = await Client.findOne({ id: userId, ...req.tenantFilter });
    if (!client) {
      client = await Client.findOne({ aktenzeichen: userId, ...req.tenantFilter });
    }
    if (!client) {
      return res.status(404).json({ error: 'Client nicht gefunden' });
    }

    // Strict cross-tenant guard (post-query verification)
    if (req.kanzleiId && (!client.kanzleiId || client.kanzleiId !== req.kanzleiId)) {
      console.error(`[SECURITY] Cross-tenant GDPR export blocked: admin kanzlei ${req.kanzleiId}, client kanzlei ${client.kanzleiId}`);
      return res.status(403).json({ error: 'Cannot export data from another kanzlei' });
    }

    console.log(`[GDPR] Art. 15 export requested by admin ${adminId} for client ${client.aktenzeichen}`);

    const clientObj = client.toObject();

    // Remove sensitive/internal fields
    const sensitiveFields = [
      'password_hash', 'session_token', 'portal_token',
      'second_letter_form_token', '__v'
    ];
    sensitiveFields.forEach(f => delete clientObj[f]);

    // 1. Personal data
    const personalData = {
      id: clientObj.id,
      kanzleiId: clientObj.kanzleiId,
      aktenzeichen: clientObj.aktenzeichen,
      firstName: clientObj.firstName,
      lastName: clientObj.lastName,
      email: clientObj.email,
      phone: clientObj.phone,
      address: clientObj.address,
      strasse: clientObj.strasse,
      hausnummer: clientObj.hausnummer,
      plz: clientObj.plz,
      wohnort: clientObj.wohnort,
      mobiltelefon: clientObj.mobiltelefon,
      geburtstag: clientObj.geburtstag,
      geburtsort: clientObj.geburtsort,
      geschlecht: clientObj.geschlecht,
      familienstand: clientObj.familienstand,
      case_source: clientObj.case_source,
      created_at: clientObj.created_at,
      updated_at: clientObj.updated_at,
    };

    // 2. Employment & income
    const employment = {
      beschaeftigungsart: clientObj.beschaeftigungsart,
      derzeitige_taetigkeit: clientObj.derzeitige_taetigkeit,
      erlernter_beruf: clientObj.erlernter_beruf,
      netto_einkommen: clientObj.netto_einkommen,
      selbststaendig: clientObj.selbststaendig,
      befristet: clientObj.befristet,
      war_selbststaendig: clientObj.war_selbststaendig,
    };

    // 3. Family
    const family = {
      kinder_anzahl: clientObj.kinder_anzahl,
      kinder_alter: clientObj.kinder_alter,
      unterhaltspflicht: clientObj.unterhaltspflicht,
    };

    // 4. Debt overview
    const debtOverview = {
      gesamt_schulden: clientObj.gesamt_schulden,
      anzahl_glaeubiger: clientObj.anzahl_glaeubiger,
      aktuelle_pfaendung: clientObj.aktuelle_pfaendung,
      schuldenart_info: clientObj.schuldenart_info,
      p_konto: clientObj.p_konto,
    };

    // 5. Financial data (settlement plan input)
    const financialData = {
      financial_data: clientObj.financial_data || null,
      extended_financial_data: clientObj.extended_financial_data || null,
      calculated_settlement_plan: clientObj.calculated_settlement_plan || null,
      debt_settlement_plan: clientObj.debt_settlement_plan || null,
      creditor_calculation_table: clientObj.creditor_calculation_table || null,
      second_letter_financial_snapshot: clientObj.second_letter_financial_snapshot || null,
    };

    // 6. Documents metadata (no file content, just metadata)
    const documents = (clientObj.documents || []).map(doc => ({
      id: doc.id,
      name: doc.name,
      filename: doc.filename,
      type: doc.type,
      size: doc.size,
      uploadedAt: doc.uploadedAt,
      processing_status: doc.processing_status,
      document_status: doc.document_status,
      is_creditor_document: doc.is_creditor_document,
      confidence: doc.confidence,
      extracted_data: doc.extracted_data || null,
      manually_reviewed: doc.manually_reviewed,
      reviewed_at: doc.reviewed_at,
      reviewed_by: doc.reviewed_by,
    }));

    // 7. Creditor list
    const creditors = (clientObj.final_creditor_list || []).map(c => ({
      id: c.id,
      sender_name: c.sender_name,
      sender_address: c.sender_address,
      sender_email: c.sender_email,
      reference_number: c.reference_number,
      claim_amount: c.claim_amount,
      status: c.status,
      contact_status: c.contact_status,
      is_representative: c.is_representative,
      actual_creditor: c.actual_creditor,
      created_at: c.created_at,
      settlement_response_status: c.settlement_response_status,
      settlement_response_text: c.settlement_response_text,
    }));

    // 8. Status history
    const statusHistory = clientObj.status_history || [];

    // 9. Workflow state
    const workflowState = {
      phase: clientObj.phase,
      current_status: clientObj.current_status,
      workflow_status: clientObj.workflow_status,
      second_letter_status: clientObj.second_letter_status,
      first_payment_received: clientObj.first_payment_received,
      payment_received_at: clientObj.payment_received_at,
      admin_approved: clientObj.admin_approved,
      client_confirmed_creditors: clientObj.client_confirmed_creditors,
      creditor_contact_started: clientObj.creditor_contact_started,
    };

    // 10. SCHUFA report (if exists)
    const schufaReport = clientObj.schufa_report || null;

    // 11. Creditor emails (from CreditorEmail collection)
    const creditorEmails = await CreditorEmail.find({
      $or: [
        { client_id: client._id },
        { client_aktenzeichen: client.aktenzeichen }
      ]
    }).select('-__v').lean();

    // 12. Impersonation history (who accessed this account)
    const impersonationHistory = await ImpersonationToken.find({
      client_id: client.id
    }).select('-token -__v').lean();

    // 13. Document processing jobs
    const processingJobs = await DocumentProcessingJob.find({
      client_id: client.id
    }).select('-__v').lean();

    // 14. Zendesk tickets
    const zendeskData = {
      zendesk_user_id: clientObj.zendesk_user_id,
      zendesk_ticket_id: clientObj.zendesk_ticket_id,
      zendesk_tickets: clientObj.zendesk_tickets || [],
    };

    // 15. Leineweber sync data
    const leineweberData = {
      leineweber_task_id: clientObj.leineweber_task_id,
      leineweber_form_data: clientObj.leineweber_form_data || null,
      leineweber_synced_at: clientObj.leineweber_synced_at,
    };

    // 16. Portal access history
    const portalAccess = {
      portal_link_sent: clientObj.portal_link_sent,
      portal_link_sent_at: clientObj.portal_link_sent_at,
      last_login: clientObj.last_login,
      isPasswordSet: clientObj.isPasswordSet,
      welcome_email_sent: clientObj.welcome_email_sent,
      welcome_email_sent_at: clientObj.welcome_email_sent_at,
    };

    // Assemble export
    const gdprExport = {
      _meta: {
        export_type: 'DSGVO Art. 15 Auskunft / Art. 20 Datenportabilität',
        exported_at: new Date().toISOString(),
        exported_by: adminId,
        client_id: client.id,
        client_aktenzeichen: client.aktenzeichen,
        format: 'JSON',
      },
      personal_data: personalData,
      employment,
      family,
      debt_overview: debtOverview,
      financial_data: financialData,
      documents,
      creditors,
      status_history: statusHistory,
      workflow_state: workflowState,
      schufa_report: schufaReport,
      creditor_emails: creditorEmails,
      impersonation_history: impersonationHistory,
      document_processing_jobs: processingJobs,
      zendesk: zendeskData,
      leineweber: leineweberData,
      portal_access: portalAccess,
    };

    // Set filename header for download
    const filename = `DSGVO-Export_${client.aktenzeichen}_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    res.json(gdprExport);

  } catch (error) {
    console.error('[GDPR] Export failed:', error);
    res.status(500).json({
      error: 'DSGVO-Export fehlgeschlagen',
      message: error.message
    });
  }
});

module.exports = router;
