'use strict';

const fs = require('fs');
const path = require('path');

/**
 * SecondLetterService
 *
 * Dispatch orchestrator for the 2. Anschreiben workflow (Phase 33).
 *
 * Responsibilities:
 * - Iterates over eligible creditors in final_creditor_list
 * - Sends pre-generated DOCX via creditorEmailService.sendSecondRoundEmail()
 * - Updates per-creditor MongoDB tracking fields after each successful send
 * - Appends Zendesk audit comments non-blocking after each send
 * - Atomically transitions second_letter_status from FORM_SUBMITTED → SENT
 *
 * Replaces Phase 28 stub (triggerSecondLetter / submitForm / markSent were
 * standalone functions; those responsibilities now live in their respective
 * route controllers that already call secondLetterTriggerService and the
 * client-portal form route).
 *
 * Dependencies injected at construction so unit tests can substitute mocks.
 */
class SecondLetterService {
  /**
   * @param {{ Client: Object, creditorEmailService: Object, ZendeskManager: Function }} deps
   */
  constructor({ Client, creditorEmailService, ZendeskManager }) {
    this.Client = Client;
    this.creditorEmailService = creditorEmailService;
    this.ZendeskManager = ZendeskManager;
    this.zendesk = new ZendeskManager();
  }

  /**
   * Dispatch second-letter emails to all eligible creditors for a given client.
   *
   * @param {string} clientId - MongoDB _id of the client
   * @returns {Promise<Object>} Result object (see return statement)
   */
  async dispatchSecondLetterEmails(clientId) {
    const { Client } = this;

    // -------------------------------------------------------------------------
    // 1. Load client with status guard
    // -------------------------------------------------------------------------
    const client = await Client.findById(clientId);
    if (!client) {
      throw new Error('Client not found');
    }

    if (client.second_letter_status !== 'FORM_SUBMITTED') {
      return {
        success: false,
        error: 'INVALID_STATUS',
        message: `Client status is ${client.second_letter_status}, expected FORM_SUBMITTED`
      };
    }

    // -------------------------------------------------------------------------
    // 2. Filter creditors to dispatch
    // -------------------------------------------------------------------------
    const allCreditors = client.final_creditor_list || [];
    const eligibleCreditors = [];
    const skippedCreditors = [];

    for (const creditor of allCreditors) {
      const hasEmail = creditor.sender_email && creditor.sender_email.trim().length > 0;
      const hasDocument = creditor.second_letter_document_filename &&
        creditor.second_letter_document_filename.trim().length > 0;

      if (hasEmail && hasDocument) {
        eligibleCreditors.push(creditor);
      } else {
        skippedCreditors.push(creditor);
      }
    }

    console.log(
      `[SecondLetterService] ${eligibleCreditors.length} creditors to dispatch, ` +
      `${skippedCreditors.length} skipped (no email or no document)`
    );

    // NO_ELIGIBLE_CREDITORS guard: document generation (Phase 32) has not been run
    if (eligibleCreditors.length === 0 && allCreditors.length > 0) {
      return {
        success: false,
        error: 'NO_ELIGIBLE_CREDITORS',
        message: 'No creditors have second_letter_document_filename — has document generation run?'
      };
    }

    // -------------------------------------------------------------------------
    // 3. Per-creditor dispatch loop with 3x retry
    // -------------------------------------------------------------------------
    let allSucceeded = true;
    let successCount = 0;
    let failedCount = 0;
    const skippedCount = skippedCreditors.length;
    const clientIdStr = client._id.toString();
    const GENERATED_DOCS_DIR = path.join(__dirname, '../generated_documents/second_round', clientIdStr);

    for (let i = 0; i < eligibleCreditors.length; i++) {
      const creditor = eligibleCreditors[i];
      const fullDocPath = path.join(GENERATED_DOCS_DIR, creditor.second_letter_document_filename);

      // File existence check — do NOT retry if file is missing (won't appear)
      if (!fs.existsSync(fullDocPath)) {
        console.error(
          `[SecondLetterService] Document not found on disk: ${fullDocPath}` +
          ` — skipping retries for ${creditor.creditor_name}`
        );
        await this._triggerAdminAlert(
          client,
          creditor,
          new Error(`Document file not found: ${creditor.second_letter_document_filename}`)
        );
        allSucceeded = false;
        failedCount++;

        if (i < eligibleCreditors.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        continue;
      }

      const MAX_RETRIES = 3;
      let sendSucceeded = false;
      let lastError = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Dev override: route all second letter emails to a test address
          const devOverrideEmail = process.env.SECOND_LETTER_EMAIL_OVERRIDE || null;
          const actualRecipient = devOverrideEmail || creditor.sender_email;
          if (devOverrideEmail) {
            console.log(`[SecondLetterService] EMAIL OVERRIDE: ${creditor.sender_email} -> ${devOverrideEmail}`);
          }

          const result = await this.creditorEmailService.sendSecondRoundEmail({
            recipientEmail: actualRecipient,
            recipientName: creditor.creditor_name || creditor.sender_name || creditor.sender_email,
            clientName: `${client.firstName} ${client.lastName}`,
            clientReference: client.aktenzeichen,
            attachment: {
              filename: creditor.second_letter_document_filename,
              path: fullDocPath
            }
          });

          if (result.success) {
            // Per-creditor tracking in MongoDB (SEND-02)
            await Client.updateOne(
              { _id: client._id, 'final_creditor_list.id': creditor.id },
              {
                $set: {
                  'final_creditor_list.$.second_letter_sent_at': new Date(),
                  'final_creditor_list.$.second_letter_email_sent_at': new Date(),
                  'final_creditor_list.$.second_letter_document_filename': creditor.second_letter_document_filename
                }
              }
            );

            // Zendesk audit comment — non-blocking (SEND-03)
            const ticketId = client.zendesk_ticket_id || creditor.main_zendesk_ticket_id;
            if (ticketId) {
              try {
                const commentBody =
                  `📧 **2. Anschreiben via Resend gesendet (mit Anhang)**\n\n` +
                  `• Empfänger: ${creditor.creditor_name || creditor.sender_name} (${creditor.sender_email})\n` +
                  `• Dokument: ${creditor.second_letter_document_filename}\n` +
                  `• Resend ID: ${result.emailId || 'n/a'}\n` +
                  `• Zeitpunkt: ${new Date().toLocaleString('de-DE')}`;

                await this.zendesk.addTicketComment(ticketId, commentBody, false);
              } catch (zenErr) {
                console.warn(
                  `[SecondLetterService] Failed to add Zendesk audit comment for ` +
                  `${creditor.creditor_name}: ${zenErr.message}`
                );
              }
            }

            sendSucceeded = true;
            successCount++;
            console.log(
              `[SecondLetterService] Sent to ${creditor.creditor_name} (${creditor.sender_email})`
            );
            break; // Exit retry loop on success
          } else {
            lastError = new Error(result.error || 'sendSecondRoundEmail returned success: false');
            console.warn(
              `[SecondLetterService] Attempt ${attempt}/${MAX_RETRIES} failed for ` +
              `${creditor.creditor_name}: ${lastError.message}`
            );
          }
        } catch (sendErr) {
          lastError = sendErr;
          console.warn(
            `[SecondLetterService] Attempt ${attempt}/${MAX_RETRIES} threw for ` +
            `${creditor.creditor_name}: ${sendErr.message}`
          );
        }
      }

      if (!sendSucceeded) {
        // All 3 attempts exhausted — trigger admin alert (SEND-05)
        await this._triggerAdminAlert(client, creditor, lastError);
        allSucceeded = false;
        failedCount++;
      }

      // 2-second delay between creditors (not between retries)
      if (i < eligibleCreditors.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // -------------------------------------------------------------------------
    // 4. Atomic FORM_SUBMITTED → SENT transition (SEND-04)
    // -------------------------------------------------------------------------
    if (allSucceeded) {
      const updated = await Client.findOneAndUpdate(
        { _id: client._id, second_letter_status: 'FORM_SUBMITTED' },
        {
          $set: {
            second_letter_status: 'SENT',
            second_letter_sent_at: new Date(),
            workflow_status: 'second_letter_sent',
            // Auto-trigger Insolvenzantrag data collection
            current_status: 'insolvenzantrag_data_pending',
            'insolvenzantrag_form.status': 'pending',
          },
          $push: {
            status_history: {
              id: require('uuid').v4(),
              status: 'insolvenzantrag_data_pending',
              created_at: new Date(),
              changed_by: 'system',
              metadata: { source: 'auto_trigger_after_second_letter_sent' },
            },
          },
        },
        { new: true }
      );

      if (updated) {
        console.log(`[SecondLetterService] Auto-triggered insolvenzantrag_data_pending for ${clientId}`);

        // Send notification email (non-blocking)
        try {
          const emailService = require('./emailService');
          const baseUrl = process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com';
          const portalUrl = `${baseUrl}/portal/${updated.aktenzeichen}`;
          await emailService.sendInsolvenzantragDataCollectionEmail(
            updated.email,
            `${updated.firstName} ${updated.lastName}`,
            portalUrl,
            updated.aktenzeichen
          );
        } catch (emailErr) {
          console.error(`[SecondLetterService] Insolvenzantrag email failed (non-blocking):`, emailErr.message);
        }
      } else {
        console.warn(
          `[SecondLetterService] Status guard blocked SENT transition for client ${clientId} ` +
          `— another process may have already transitioned`
        );
      }
    }
    // If allSucceeded === false: status stays FORM_SUBMITTED (per SEND-05)

    // -------------------------------------------------------------------------
    // 5. Return result
    // -------------------------------------------------------------------------
    return {
      success: allSucceeded,
      totalCreditors: allCreditors.length,
      dispatched: successCount,
      failed: failedCount,
      skipped: skippedCount,
      status: allSucceeded ? 'SENT' : 'FORM_SUBMITTED'
    };
  }

  /**
   * Trigger admin alert after 3 failed send attempts.
   * Console error + non-blocking Zendesk internal comment.
   *
   * @param {Object} client - Client document
   * @param {Object} creditor - Creditor subdocument
   * @param {Error} error - Last error encountered
   * @private
   */
  async _triggerAdminAlert(client, creditor, error) {
    const creditorName = creditor.creditor_name || creditor.sender_name || 'Unknown';
    const aktenzeichen = client.aktenzeichen || client._id.toString();

    console.error(
      `\n[ADMIN ALERT] Failed to send 2. Anschreiben to "${creditorName}" for client ` +
      `${aktenzeichen} after 3 attempts. Error: ${error?.message}\n`
    );

    // Non-blocking Zendesk internal comment
    const ticketId = client.zendesk_ticket_id || creditor.main_zendesk_ticket_id;
    if (ticketId) {
      try {
        const alertBody =
          `⚠️ **ADMIN ALERT: 2. Anschreiben nicht gesendet**\n\n` +
          `• Gläubiger: ${creditorName}\n` +
          `• Fehler: ${error?.message || 'Unbekannter Fehler'}\n` +
          `• Zeitpunkt: ${new Date().toLocaleString('de-DE')}\n\n` +
          `Manuelle Nachbearbeitung erforderlich.`;

        await this.zendesk.addTicketComment(ticketId, alertBody, false);
      } catch (zenErr) {
        console.warn(
          `[SecondLetterService] Failed to post admin alert to Zendesk for ` +
          `${creditorName}: ${zenErr.message}`
        );
      }
    }
  }
}

module.exports = SecondLetterService;
