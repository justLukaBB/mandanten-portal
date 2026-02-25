const { v4: uuidv4 } = require('uuid');

/**
 * Matcher Webhook Controller
 * Handles notifications from the creditor-email-matcher service
 * after it processes a creditor response and updates MongoDB.
 *
 * This enables:
 * 1. status_history entries for creditor response events
 * 2. "All creditors responded" detection for workflow progression
 * 3. (Future) Socket.IO push for real-time Canvas updates
 */
const createMatcherWebhookController = ({ Client, getIO }) => {
  return {
    /**
     * POST /api/webhooks/matcher-response
     *
     * Called by creditor-email-matcher after successful MongoDB dual-write.
     * The matcher already updated final_creditor_list — this handler
     * creates status_history and checks for workflow transitions.
     */
    handleCreditorResponse: async (req, res) => {
      try {
        const {
          event,
          email_id,
          client_aktenzeichen,
          client_name,
          creditor_name,
          creditor_email,
          new_debt_amount,
          amount_source,
          extraction_confidence,
          match_status,
          confidence_route,
          needs_review,
          reference_numbers,
          processed_at,
        } = req.body;

        // Validate required fields
        if (event !== 'creditor_response_processed') {
          return res.status(400).json({ error: `Unknown event: ${event}` });
        }

        if (!client_aktenzeichen && !client_name) {
          return res.status(400).json({ error: 'Missing client_aktenzeichen or client_name' });
        }

        console.log(`📨 Matcher webhook: ${creditor_name} responded for ${client_aktenzeichen || client_name}`);
        console.log(`   Amount: ${new_debt_amount} EUR, Confidence: ${extraction_confidence}, Route: ${confidence_route}`);

        // Find client — matcher already updated final_creditor_list via direct MongoDB write
        let client;
        if (client_aktenzeichen) {
          client = await Client.findOne({ aktenzeichen: client_aktenzeichen });
        }
        if (!client && client_name) {
          // Parse "FirstName LastName" or "LastName, FirstName"
          const parts = client_name.includes(',')
            ? client_name.split(',').map(p => p.trim()).reverse()
            : client_name.split(/\s+/);
          if (parts.length >= 2) {
            client = await Client.findOne({
              firstName: new RegExp(`^${parts[0]}$`, 'i'),
              lastName: new RegExp(`^${parts.slice(1).join(' ')}$`, 'i'),
            });
          }
        }

        if (!client) {
          console.log(`⚠️ Matcher webhook: Client not found for ${client_aktenzeichen || client_name}`);
          return res.status(404).json({ error: 'Client not found' });
        }

        // 1. Add status_history entry
        const historyEntry = {
          id: uuidv4(),
          status: 'creditor_response_received',
          changed_by: 'system',
          metadata: {
            source: 'creditor_email_matcher',
            email_id,
            creditor_name,
            creditor_email,
            new_debt_amount,
            amount_source,
            extraction_confidence,
            match_status,
            confidence_route,
            needs_review,
            reference_numbers,
          },
          created_at: new Date(processed_at || Date.now()),
        };

        client.status_history.push(historyEntry);
        client.updated_at = new Date();

        // 2. Check if all creditors have responded
        const creditors = client.final_creditor_list || [];
        const contacted = creditors.filter(c =>
          c.contact_status === 'email_sent_with_document' ||
          c.contact_status === 'responded'
        );
        const responded = creditors.filter(c => c.contact_status === 'responded');
        const allResponded = contacted.length > 0 && responded.length === contacted.length;

        if (allResponded) {
          console.log(`✅ All ${responded.length} contacted creditors have responded for ${client.aktenzeichen}`);
          client.status_history.push({
            id: uuidv4(),
            status: 'all_creditors_responded',
            changed_by: 'system',
            metadata: {
              total_creditors: creditors.length,
              contacted: contacted.length,
              responded: responded.length,
            },
            created_at: new Date(),
          });
        }

        await client.save({ validateModifiedOnly: true });

        // 3. Push Socket.IO event for real-time Canvas update
        try {
          const io = getIO?.();
          if (io) {
            io.to(`client:${client._id}`).emit('creditor_response', {
              creditor_name,
              new_debt_amount,
              extraction_confidence,
              contact_status: 'responded',
              all_responded: allResponded,
            });
          }
        } catch (socketErr) {
          // Non-critical — don't fail the webhook
          console.log(`⚠️ Socket.IO emit failed: ${socketErr.message}`);
        }

        console.log(`✅ Matcher webhook processed: ${creditor_name} → ${client.aktenzeichen}`);

        return res.json({
          success: true,
          client_id: client._id,
          aktenzeichen: client.aktenzeichen,
          history_entry_id: historyEntry.id,
          all_responded: allResponded,
          stats: {
            total: creditors.length,
            contacted: contacted.length,
            responded: responded.length,
          },
        });
      } catch (error) {
        console.error('❌ Matcher webhook error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },
  };
};

module.exports = createMatcherWebhookController;
