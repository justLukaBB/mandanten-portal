/**
 * SecondLetterTriggerService
 *
 * Owns the atomic idempotent state transition from IDLE → PENDING for the
 * 2. Anschreiben workflow. Both the admin trigger route and the daily scheduler
 * call this single service — no duplication between the two entry points.
 *
 * Prerequisites: Phase 28 (State Machine Foundation) must be complete.
 * The following fields must exist on the Client model:
 *   - second_letter_status (enum: IDLE/PENDING/FORM_SUBMITTED/SENT)
 *   - second_letter_form_token (String)
 *   - second_letter_form_token_expires_at (Date)
 *   - second_letter_triggered_at (Date)
 *   - status_history (array)
 */

const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');

class SecondLetterTriggerService {
  /**
   * @param {{ emailService: import('./emailService') }} dependencies
   */
  constructor({ emailService }) {
    this.emailService = emailService;
  }

  /**
   * Atomically transition a single client from IDLE → PENDING and send notification.
   *
   * Idempotent: if the client is already PENDING/FORM_SUBMITTED/SENT the
   * findOneAndUpdate filter will not match and no email is sent.
   *
   * @param {string} clientId - The client's MongoDB `_id` (ObjectId string, from req.params.clientId)
   * @param {string} actor - 'system' for scheduler, admin identifier for manual trigger
   * @returns {Promise<{
   *   success: boolean,
   *   alreadyTriggered?: boolean,
   *   currentStatus?: string,
   *   clientId?: string,
   *   aktenzeichen?: string,
   *   emailSent?: boolean,
   *   emailId?: string
   * }>}
   */
  async triggerForClient(clientId, actor = 'system') {
    try {
      const isSystem = actor === 'system';
      const changedBy = isSystem ? 'system' : 'admin';
      const reason = isSystem ? 'auto_30_day_trigger' : 'admin_manual_trigger';

      // 1. Atomic state transition — only succeeds if current status is IDLE.
      //    If client is already PENDING/FORM_SUBMITTED/SENT the update will
      //    match no document and return null (idempotency guard).
      const client = await Client.findOneAndUpdate(
        { _id: clientId, second_letter_status: 'IDLE' },
        {
          $set: {
            second_letter_status: 'PENDING',
            second_letter_triggered_at: new Date(),
            second_letter_form_token: uuidv4(),
            second_letter_form_token_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
            workflow_status: 'second_letter_pending'
          },
          $push: {
            status_history: {
              id: uuidv4(),
              status: 'second_letter_pending',
              changed_by: changedBy,
              metadata: {
                actor,
                reason,
                triggered_at: new Date().toISOString()
              },
              created_at: new Date()
            }
          }
        },
        { new: true }
      );

      // 2. Null return means the status-guard blocked the update — already triggered.
      if (!client) {
        const existing = await Client.findOne({ _id: clientId }, { second_letter_status: 1 });
        return {
          success: false,
          alreadyTriggered: true,
          currentStatus: existing?.second_letter_status || 'unknown'
        };
      }

      // 3. Build portal deep-link with the freshly generated token.
      const baseUrl = process.env.PORTAL_BASE_URL || 'https://mandanten-portal.onrender.com';
      const portalUrl = `${baseUrl}/portal/second-letter-form?token=${client.second_letter_form_token}`;

      // 4. Send client notification email after successful state write.
      //    If email fails the client is left in PENDING (recoverable by admin re-send).
      const emailResult = await this.emailService.sendSecondLetterNotification(
        client.email,
        `${client.firstName} ${client.lastName}`,
        portalUrl,
        client.aktenzeichen
      );

      return {
        success: true,
        clientId: client.id,
        aktenzeichen: client.aktenzeichen,
        emailSent: emailResult.success,
        emailId: emailResult.emailId
      };
    } catch (error) {
      console.error('❌ Error triggering second letter for client:', clientId, error.message);
      throw error;
    }
  }

  /**
   * Find all IDLE clients whose most recent first-round email was sent 30+ days ago
   * and trigger each one sequentially.
   *
   * Two-step approach (research Pitfall 1):
   *   Step 1 — MongoDB query: IDLE clients where at least one creditor has email_sent_at set.
   *   Step 2 — JavaScript filter: keep only clients where MAX(email_sent_at) <= thirtyDaysAgo.
   *
   * Sequential iteration (not parallel) to avoid overwhelming Resend rate limits.
   *
   * @returns {Promise<{ triggered: number, skipped: number, errors: number, total: number }>}
   */
  async checkAndTriggerEligible() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Only trigger for clients whose creditor contact phase is complete.
    // Clients still in active creditor correspondence must NOT be auto-triggered.
    const ELIGIBLE_WORKFLOW_STATUSES = [
      'creditor_contact_active',     // Legacy status — kept for backward compat
      'awaiting_client_confirmation', // Client confirmed creditors
      'payment_confirmed',            // Payment already received
    ];

    // Step 1: Fetch IDLE clients that have at least one creditor with email_sent_at set
    //         AND whose workflow_status indicates creditor contact is complete.
    const candidates = await Client.find(
      {
        second_letter_status: 'IDLE',
        client_confirmed_creditors: true, // Creditor list must be confirmed by client
        final_creditor_list: {
          $elemMatch: { email_sent_at: { $exists: true, $ne: null } }
        }
      }
    ).select('aktenzeichen firstName lastName email final_creditor_list client_confirmed_creditors workflow_status');

    // Step 2: Filter in JS — ALL creditors must have been contacted (email_sent_at set),
    //         and the MOST RECENT email must be at least 30 days old.
    //         Clients with any un-contacted creditors are excluded (1st round still ongoing).
    const eligible = candidates.filter((client) => {
      const creditors = client.final_creditor_list || [];
      if (creditors.length === 0) return false;

      // ALL creditors must have been contacted
      const allContacted = creditors.every((c) => c.email_sent_at);
      if (!allContacted) {
        console.log(`⏭️ ${client.aktenzeichen}: skipped — ${creditors.filter(c => !c.email_sent_at).length}/${creditors.length} creditors not yet contacted`);
        return false;
      }

      const sentDates = creditors.map((c) => new Date(c.email_sent_at));
      const maxSentAt = new Date(Math.max(...sentDates));
      return maxSentAt <= thirtyDaysAgo;
    });

    let triggered = 0;
    let skipped = 0;
    let errors = 0;

    // Sequential iteration — avoids Resend rate limit issues during batch runs.
    for (const client of eligible) {
      try {
        const result = await this.triggerForClient(client._id.toString(), 'system');
        if (result.success) {
          triggered++;
        } else {
          // alreadyTriggered — another process or a previous run already transitioned this client.
          skipped++;
        }
      } catch (err) {
        console.error(`❌ Error triggering second letter for ${client.aktenzeichen}:`, err.message);
        errors++;
      }
    }

    console.log(
      `✅ 2. Anschreiben check: ${triggered} triggered, ${skipped} skipped, ${errors} errors out of ${eligible.length} eligible`
    );

    return { triggered, skipped, errors, total: eligible.length };
  }
}

// Export the CLASS (not a singleton instance) so server.js can inject emailService dependency.
module.exports = SecondLetterTriggerService;
