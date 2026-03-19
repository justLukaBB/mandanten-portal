const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const webhookVerifier = require('../utils/webhookVerifier');
const creditorDeduplication = require('../utils/creditorDeduplication');
const Client = require('../models/Client');
const { findCreditorByName } = require('../utils/creditorLookup');
const aiDedupScheduler = require('../services/aiDedupScheduler');

// Lazy load server functions to avoid circular dependency
let serverFunctions = null;
function getServerFunctions() {
  if (!serverFunctions) {
    serverFunctions = require('../server');
  }
  return serverFunctions;
}

const MANUAL_REVIEW_CONFIDENCE_THRESHOLD =
  parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8;
const createWebhookController = require('../controllers/webhookController');

/**
 * Webhook Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 * @param {Object} dependencies.webhookController - Optional pre-created controller (for worker integration)
 */
module.exports = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook, getIO, aiDedupScheduler, webhookController }) => {
  // Use provided controller or create a new one
  const controller = webhookController || createWebhookController({
    Client,
    safeClientUpdate,
    getClient,
    triggerProcessingCompleteWebhook,
    getIO,
    aiDedupScheduler,
  });

  /**
   * Webhook receiver for FastAPI AI processing results
   * POST /webhooks/ai-processing
   */
  router.post(
    '/ai-processing',
    express.raw({ type: 'application/json', limit: '10mb' }),
    webhookVerifier.middleware,
    controller.handleAiProcessing
  );

  /**
   * Webhook receiver for SCHUFA processing results
   * POST /webhooks/schufa-processing
   */
  router.post(
    '/schufa-processing',
    express.json({ limit: '10mb' }),
    async (req, res) => {
      const startTime = Date.now();
      try {
        const payload = req.body;
        const { job_id, client_id, status } = payload;

        console.log(`\n🔵 SCHUFA webhook received: job=${job_id}, client=${client_id}, status=${status}`);

        // Acknowledge immediately
        res.status(200).json({ received: true, job_id });

        // Find client
        const client = await Client.findOne({ id: client_id });
        if (!client) {
          console.error(`SCHUFA webhook: client ${client_id} not found`);
          return;
        }

        if (status === 'completed' && payload.schufa_report) {
          const report = payload.schufa_report;

          // Update schufa_report
          client.schufa_report = {
            ...client.schufa_report,
            processing_status: 'completed',
            processed_at: new Date(),

            // Score
            base_score: report.base_score,
            base_score_rating: report.base_score_rating,
            branch_scores: report.branch_scores || {},

            // Metadaten
            schufa_contract_number: report.schufa_contract_number,
            report_date: report.report_date ? new Date(report.report_date) : null,
            person_name: report.person_name,
            person_dob: report.person_dob,
            person_address: report.person_address,

            // Einträge
            entries: (report.entries || []).map(e => ({
              entry_type: e.entry_type,
              creditor_name: e.creditor_name,
              status: e.status,
              original_amount: e.original_amount,
              outstanding_amount: e.outstanding_amount,
              contract_number: e.contract_number,
              reference_number: e.reference_number,
              entry_date: e.entry_date,
              settlement_date: e.settlement_date,
              deletion_date: e.deletion_date,
              is_negative: e.is_negative || false,
              negative_feature: e.negative_feature,
              matched_creditor_id: e.matched_creditor_id,
              matched_creditor_name: e.matched_creditor_name,
              match_confidence: e.match_confidence,
              match_status: e.match_status || 'unmatched',
              amount_discrepancy: e.amount_discrepancy,
            })),

            // Zusammenfassung
            total_entries: report.total_entries || 0,
            negative_entries: report.negative_entries || 0,
            active_entries: report.active_entries || 0,
            settled_entries: report.settled_entries || 0,
            total_outstanding: report.total_outstanding || 0,

            // Löschfristen & Mapping
            deletable_entries: report.deletable_entries || [],
            deletion_analysis: payload.deletion_analysis || [],
            creditor_mapping: payload.creditor_mapping || [],
            new_creditors: (payload.new_creditors || []).map(nc => ({
              name: nc.name,
              amount: nc.amount,
              source: 'schufa',
              entry_type: nc.entry_type,
              is_negative: nc.is_negative || false,
              added_to_creditor_list: false,
            })),

            confidence: report.confidence,
            processing_notes: report.processing_notes || [],
          };

          // Extract creditors from SCHUFA entries → merge into final_creditor_list
          const schufaCreditors = (report.entries || [])
            .filter(e => e.creditor_name && e.creditor_name !== 'N/A')
            .map(e => ({
              id: uuidv4(),
              sender_name: e.creditor_name,
              glaeubiger_name: e.creditor_name,
              claim_amount: e.outstanding_amount || e.original_amount || 0,
              claim_amount_raw: e.outstanding_amount
                ? `${e.outstanding_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
                : 'N/A',
              status: 'confirmed',
              created_via: 'schufa_extraction',
              created_at: new Date(),
              source_documents: [],
              confidence: report.confidence || 0.85,
              ai_confidence: report.confidence || 0.85,
              // Flag negative entries for review
              needs_manual_review: e.is_negative || false,
              review_reasons: e.is_negative ? [`SCHUFA Negativmerkmal: ${e.negative_feature || 'unbekannt'}`] : [],
            }));

          if (schufaCreditors.length > 0) {
            const existing = client.final_creditor_list || [];
            console.log(`\n📊 [SCHUFA] CREDITOR MERGE:`);
            console.log(`  - Existing in final_creditor_list: ${existing.length}`);
            console.log(`  - From SCHUFA entries: ${schufaCreditors.length}`);

            client.final_creditor_list = creditorDeduplication.mergeCreditorLists(
              existing,
              schufaCreditors,
              'highest_amount'
            );

            console.log(`  - After merge: ${client.final_creditor_list.length}`);
            console.log(`  - SCHUFA creditor names: ${schufaCreditors.map(c => c.sender_name).join(', ')}`);
            console.log(`📊 [SCHUFA] END CREDITOR MERGE\n`);
          }

          await client.save();

          const duration = Date.now() - startTime;
          console.log(
            `✅ SCHUFA report saved for ${client_id}: ` +
            `Score ${report.base_score}%, ` +
            `${report.total_entries} entries, ` +
            `${report.negative_entries} negative, ` +
            `${schufaCreditors.length} creditors merged into final_creditor_list ` +
            `(${duration}ms)`
          );

          // Emit socket event if available
          try {
            const io = getIO();
            if (io) {
              io.emit('schufa-report-ready', {
                clientId: client_id,
                score: report.base_score,
                totalEntries: report.total_entries,
                negativeEntries: report.negative_entries,
                newCreditors: (payload.new_creditors || []).length,
              });
            }
          } catch (socketErr) {
            // Socket emission is best-effort
          }

        } else if (status === 'failed') {
          client.schufa_report = {
            ...client.schufa_report,
            processing_status: 'error',
            processing_notes: [payload.error || 'Processing failed'],
          };
          await client.save();
          console.error(`❌ SCHUFA processing failed for ${client_id}: ${payload.error}`);

        } else {
          console.warn(`⚠️ SCHUFA webhook unknown status: ${status}`);
        }

      } catch (error) {
        console.error('SCHUFA webhook handler error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal error' });
        }
      }
    }
  );

  /** Health check */
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      endpoints: ['POST /webhooks/ai-processing', 'POST /webhooks/schufa-processing'],
    });
  });

  return router;
};
