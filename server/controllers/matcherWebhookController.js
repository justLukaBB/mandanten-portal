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
const createMatcherWebhookController = ({ Client, CreditorEmail, getIO }) => {
  return {
    /**
     * POST /api/webhooks/settlement-response
     *
     * Called by creditor-email-matcher after processing a settlement response
     * (response to 2. Anschreiben). Updates the creditor's settlement_response_*
     * fields and creates a status_history entry.
     */
    handleSettlementResponse: async (req, res) => {
      try {
        const body = req.body;
        const event = body.event;
        const client_aktenzeichen = body.client_aktenzeichen;
        const client_name = body.client_name;
        const creditor_name = body.creditor_name;
        const creditor_email = body.creditor_email;
        // Accept both field names (matcher sends settlement_decision, original spec used settlement_status)
        const settlement_status = body.settlement_status || body.settlement_decision;
        const response_text = body.response_text || body.email_body_preview;
        const confidence = body.confidence || body.extraction_confidence;
        const processed_at = body.processed_at;
        const email_subject = body.email_subject;
        const email_body_preview = body.email_body_preview;
        const email_body_full = body.email_body_full;
        // Build metadata from explicit fields or use provided metadata object
        const metadata = body.metadata || {
          counter_offer_amount: body.counter_offer_amount,
          conditions: body.conditions,
          needs_review: body.needs_review,
          match_status: body.match_status,
        };

        if (event !== 'settlement_response_processed') {
          return res.status(400).json({ error: `Unknown event: ${event}` });
        }

        if (!client_aktenzeichen && !client_name) {
          return res.status(400).json({ error: 'Missing client_aktenzeichen or client_name' });
        }

        console.log(`📨 Settlement webhook: ${creditor_name} responded (${settlement_status}) for ${client_aktenzeichen || client_name}`);

        // Find client
        let client;
        if (client_aktenzeichen) {
          client = await Client.findOne({ aktenzeichen: client_aktenzeichen });
        }
        if (!client && client_name) {
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
          console.log(`⚠️ Settlement webhook: Client not found for ${client_aktenzeichen || client_name}`);
          // Still save to CreditorEmail as no_match
          try {
            await CreditorEmail.create({
              kanzleiId: '',
              letter_type: 'second',
              creditor_name,
              creditor_email,
              client_aktenzeichen,
              client_name,
              match_status: 'no_match',
              settlement_status,
              settlement_response_text: response_text,
              email_subject,
              email_body_preview,
              email_body_full,
              attachments: body.attachments || [],
              resend_email_id: body.resend_email_id,
              review_status: 'pending',
              needs_review: true,
              matcher_metadata: metadata,
              processed_at: new Date(processed_at || Date.now()),
            });
          } catch (emailErr) {
            console.log(`⚠️ CreditorEmail save failed: ${emailErr.message}`);
          }
          return res.status(404).json({ error: 'Client not found' });
        }

        // Find matching creditor in final_creditor_list
        const creditors = client.final_creditor_list || [];
        const matchedCreditor = creditors.find(c => {
          if (creditor_email && c.sender_email) {
            return c.sender_email.toLowerCase() === creditor_email.toLowerCase();
          }
          if (creditor_name && (c.sender_name || c.glaeubiger_name)) {
            const name = (c.sender_name || c.glaeubiger_name || '').toLowerCase();
            return name === creditor_name.toLowerCase();
          }
          return false;
        });

        if (!matchedCreditor) {
          console.log(`⚠️ Settlement webhook: Creditor "${creditor_name}" not found in ${client.aktenzeichen}`);
          return res.status(404).json({ error: 'Creditor not found in client' });
        }

        // Update settlement fields
        matchedCreditor.settlement_response_status = settlement_status;
        matchedCreditor.settlement_response_received_at = new Date(processed_at || Date.now());
        if (response_text) matchedCreditor.settlement_response_text = response_text;
        if (confidence != null) matchedCreditor.settlement_acceptance_confidence = confidence;
        if (metadata) matchedCreditor.settlement_response_metadata = metadata;

        // Add status_history entry
        const historyEntry = {
          id: uuidv4(),
          status: 'settlement_response_received',
          changed_by: 'system',
          metadata: {
            source: 'creditor_email_matcher',
            creditor_name,
            creditor_email,
            settlement_status,
            confidence,
          },
          created_at: new Date(processed_at || Date.now()),
        };
        client.status_history.push(historyEntry);
        client.updated_at = new Date();

        await client.save({ validateModifiedOnly: true });

        // Save to CreditorEmail collection for inbox dashboard
        try {
          await CreditorEmail.create({
            kanzleiId: client.kanzleiId,
            letter_type: 'second',
            creditor_name,
            creditor_email,
            client_id: client._id,
            client_aktenzeichen: client.aktenzeichen,
            client_name: `${client.firstName} ${client.lastName}`,
            match_status: 'auto_matched',
            match_confidence: confidence != null ? Math.round(confidence * 100) : null,
            settlement_status,
            settlement_response_text: response_text,
            settlement_counter_offer_amount: metadata?.counter_offer_amount,
            settlement_conditions: metadata?.conditions,
            email_subject,
            email_body_preview,
            email_body_full,
            attachments: body.attachments || [],
            resend_email_id: body.resend_email_id,
            review_status: metadata?.needs_review ? 'pending' : 'reviewed',
            needs_review: !!metadata?.needs_review,
            matcher_metadata: metadata,
            processed_at: new Date(processed_at || Date.now()),
          });
        } catch (emailErr) {
          console.log(`⚠️ CreditorEmail save failed (non-blocking): ${emailErr.message}`);
        }

        // Push Socket.IO event
        try {
          const io = getIO?.();
          if (io) {
            io.to(`client:${client._id}`).emit('settlement_response', {
              creditor_name,
              settlement_status,
              confidence,
            });
          }
        } catch (socketErr) {
          console.log(`⚠️ Socket.IO emit failed: ${socketErr.message}`);
        }

        console.log(`✅ Settlement webhook processed: ${creditor_name} → ${settlement_status} for ${client.aktenzeichen}`);

        return res.json({
          success: true,
          client_id: client._id,
          aktenzeichen: client.aktenzeichen,
          history_entry_id: historyEntry.id,
          settlement_status,
        });
      } catch (error) {
        console.error('❌ Settlement webhook error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },

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
          email_subject,
          email_body_preview,
          email_body_full,
          intent,
          attachments,
          resend_email_id,
        } = req.body;

        // Validate required fields
        if (event !== 'creditor_response_processed') {
          return res.status(400).json({ error: `Unknown event: ${event}` });
        }

        console.log(`📨 Matcher webhook: ${creditor_name} responded for ${client_aktenzeichen || client_name || '(no client)'}`);
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
          console.log(`⚠️ Matcher webhook: Client not found for ${client_aktenzeichen || client_name || creditor_name}`);
          // Still save to CreditorEmail as no_match so it appears in admin inbox
          // Auto-dismiss auto_reply/spam — no human review needed
          const autoDismissIntents = ['auto_reply', 'spam'];
          const isAutoDismiss = autoDismissIntents.includes(intent);
          try {
            await CreditorEmail.create({
              kanzleiId: '',
              email_id,
              letter_type: 'first',
              creditor_name: creditor_name || creditor_email || 'unknown',
              creditor_email,
              client_aktenzeichen,
              client_name,
              match_status: 'no_match',
              match_confidence: extraction_confidence != null ? Math.round(extraction_confidence * 100) : null,
              new_debt_amount,
              extraction_confidence: extraction_confidence != null ? Math.round(extraction_confidence * 100) : null,
              confidence_route,
              reference_numbers: reference_numbers || [],
              email_subject,
              email_body_preview,
              email_body_full,
              intent,
              attachments: attachments || [],
              resend_email_id,
              review_status: isAutoDismiss ? 'dismissed' : 'pending',
              needs_review: isAutoDismiss ? false : !!(client_aktenzeichen || client_name),
              processed_at: new Date(processed_at || Date.now()),
            });
          } catch (emailErr) {
            console.log(`⚠️ CreditorEmail save failed: ${emailErr.message}`);
          }
          return res.json({ success: true, match_status: 'no_match' });
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

        // Save to CreditorEmail collection for inbox dashboard
        try {
          await CreditorEmail.create({
            kanzleiId: client.kanzleiId,
            email_id,
            letter_type: 'first',
            creditor_name,
            creditor_email,
            client_id: client._id,
            client_aktenzeichen: client.aktenzeichen,
            client_name: `${client.firstName} ${client.lastName}`,
            match_status: match_status || (client ? 'auto_matched' : 'no_match'),
            match_confidence: extraction_confidence != null ? Math.round(extraction_confidence * 100) : null,
            new_debt_amount,
            amount_source,
            extraction_confidence: extraction_confidence != null ? Math.round(extraction_confidence * 100) : null,
            confidence_route,
            reference_numbers: reference_numbers || [],
            email_subject,
            email_body_preview,
            email_body_full,
            intent,
            attachments: attachments || [],
            resend_email_id,
            review_status: needs_review ? 'pending' : 'reviewed',
            needs_review: !!needs_review,
            processed_at: new Date(processed_at || Date.now()),
          });
        } catch (emailErr) {
          console.log(`⚠️ CreditorEmail save failed (non-blocking): ${emailErr.message}`);
        }

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
