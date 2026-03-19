const express = require('express');
const router = express.Router();
const createAdminSecondLetterController = require('../controllers/adminSecondLetterController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const { calculateSecondLetterFinancials } = require('../services/secondLetterCalculationService');
const SecondLetterService = require('../services/secondLetterService');
const SecondLetterDocumentGenerator = require('../services/secondLetterDocumentGenerator');
const ZendeskManager = require('../services/zendeskManager');
const creditorEmailService = require('../services/creditorEmailService');

/**
 * Factory function — receives secondLetterTriggerService and Client model from server.js.
 *
 * creditorEmailService is required locally (NOT injected via factory) — consistent with
 * how creditorContactService.js and secondRoundEmailSender.js require it at the top of
 * their own files (it is not in server.js scope).
 *
 * @param {{ secondLetterTriggerService: import('../services/secondLetterTriggerService'), Client: Object }} param0
 * @returns {express.Router}
 */
module.exports = ({ secondLetterTriggerService, Client }) => {
  const controller = createAdminSecondLetterController({ secondLetterTriggerService });

  // Instantiate dispatch service with local deps (not injected via server.js)
  const secondLetterService = new SecondLetterService({
    Client,
    creditorEmailService,
    ZendeskManager
  });

  // POST /api/admin/clients/:clientId/trigger-second-letter
  router.post(
    '/clients/:clientId/trigger-second-letter',
    rateLimits.admin,
    authenticateAdmin,
    controller.triggerSecondLetter
  );

  // Phase 31: POST /api/admin/clients/:clientId/recalculate-second-letter
  // Retriggers financial calculation from current snapshot + final_creditor_list.
  // Use case: admin corrects a creditor's claim_amount then retrieves fresh calculation results.
  router.post('/clients/:clientId/recalculate-second-letter', authenticateAdmin, async (req, res) => {
    try {
      const { clientId } = req.params;
      const client = await Client.findOne({ _id: clientId, ...req.tenantFilter });

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const snapshot = client.second_letter_financial_snapshot;
      if (!snapshot) {
        return res.status(400).json({ error: 'No snapshot found — client must submit form first' });
      }

      // Guard: do not allow recalculation after letters have been sent
      if (client.second_letter_status === 'SENT') {
        return res.status(400).json({ error: 'Cannot recalculate — letters already sent' });
      }

      const calcResult = calculateSecondLetterFinancials(snapshot, client.final_creditor_list || []);

      const calcUpdate = {};
      if (calcResult.success) {
        calcUpdate['second_letter_financial_snapshot.garnishable_amount'] = calcResult.garnishableAmount;
        calcUpdate['second_letter_financial_snapshot.plan_type'] = calcResult.planType;
        calcUpdate['second_letter_financial_snapshot.total_debt'] = calcResult.totalDebt;
        calcUpdate['second_letter_financial_snapshot.creditor_calculations'] = calcResult.creditorCalculations;
        calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'completed';
        calcUpdate['second_letter_financial_snapshot.calculation_error'] = null;
        calcUpdate['second_letter_financial_snapshot.calculated_at'] = new Date();
      } else {
        calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'failed';
        calcUpdate['second_letter_financial_snapshot.calculation_error'] = calcResult.error;
      }

      await Client.findOneAndUpdate({ _id: client._id, ...req.tenantFilter }, { $set: calcUpdate });

      res.json({
        success: calcResult.success,
        error: calcResult.error || null,
        garnishable_amount: calcResult.garnishableAmount || null,
        plan_type: calcResult.planType || null,
        total_debt: calcResult.totalDebt || null,
        creditor_count: calcResult.creditorCalculations?.length || 0,
        skipped_creditors: calcResult.skippedCreditors || null,
      });

    } catch (error) {
      console.error('[SecondLetter] Recalculation error:', error);
      res.status(500).json({ error: 'Internal server error during recalculation' });
    }
  });

  // Phase 36: POST /api/admin/clients/:clientId/send-second-letter
  // Generates DOCX documents for all creditors, then dispatches emails.
  // Returns 404 for missing client, 409 for invalid status, 400 for missing snapshot,
  // 500 if all document generations fail, 422 for no eligible creditors,
  // 207 for partial failure, 200 for full success.
  router.post('/clients/:clientId/send-second-letter',
    authenticateAdmin,
    async (req, res) => {
      try {
        const { clientId } = req.params;

        // a. Load client from DB
        const client = await Client.findOne({ _id: clientId, ...req.tenantFilter });
        if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

        // b. Status guard BEFORE generation (fail fast — don't generate for wrong status)
        if (client.second_letter_status !== 'FORM_SUBMITTED') {
          return res.status(409).json({
            success: false,
            error: 'INVALID_STATUS',
            message: `Status is ${client.second_letter_status}, expected FORM_SUBMITTED`
          });
        }

        // c. Snapshot guard (check calculation_status is completed)
        const snapshot = client.second_letter_financial_snapshot;
        if (!snapshot || snapshot.calculation_status !== 'completed') {
          return res.status(400).json({
            success: false,
            error: 'Snapshot not ready — run recalculate-second-letter first'
          });
        }

        // d. Generate DOCX for all creditors
        const generator = new SecondLetterDocumentGenerator();
        const genResult = await generator.generateForAllCreditors(client, snapshot);
        console.log(`[SecondLetter] Generation: ${genResult.total_generated} generated, ${genResult.total_failed} failed`);
        if (genResult.total_generated === 0 && genResult.total_failed > 0) {
          return res.status(500).json({
            success: false,
            error: 'Document generation failed for all creditors',
            details: genResult.errors
          });
        }

        // e. Dispatch emails — dispatchSecondLetterEmails re-loads client from DB internally,
        //    picking up second_letter_document_filename values persisted by generateForAllCreditors.
        const result = await secondLetterService.dispatchSecondLetterEmails(clientId);

        if (!result.success && result.error === 'INVALID_STATUS') {
          return res.status(409).json({ success: false, error: result.message });
        }
        if (!result.success && result.error === 'NO_ELIGIBLE_CREDITORS') {
          return res.status(422).json({ success: false, error: result.error, message: result.message });
        }

        // 207 Multi-Status for partial failure; 200 when all succeeded
        const statusCode = result.success ? 200 : 207;
        return res.status(statusCode).json({
          success: result.success,
          dispatched: result.dispatched,
          failed: result.failed,
          skipped: result.skipped,
          totalCreditors: result.totalCreditors,
          status: result.status
        });
      } catch (error) {
        console.error('[SecondLetter] Error dispatching second letter emails:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Phase 34: PATCH /api/admin/clients/:clientId/second-letter-plan-type
  // Override plan_type in snapshot before sending (admin correction).
  // Guard: return 400 if status is SENT (immutable after dispatch) or no snapshot exists.
  router.patch('/clients/:clientId/second-letter-plan-type', authenticateAdmin, async (req, res) => {
    try {
      const { clientId } = req.params;
      const { plan_type } = req.body;

      if (!['RATENPLAN', 'NULLPLAN'].includes(plan_type)) {
        return res.status(400).json({ error: 'plan_type must be RATENPLAN or NULLPLAN' });
      }

      const client = await Client.findOne({ _id: clientId, ...req.tenantFilter });
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (client.second_letter_status === 'SENT') {
        return res.status(400).json({ error: 'Cannot override plan_type after letters are sent' });
      }
      if (!client.second_letter_financial_snapshot) {
        return res.status(400).json({ error: 'No snapshot exists — client must submit form first' });
      }

      await Client.findOneAndUpdate({ _id: client._id, ...req.tenantFilter }, {
        $set: { 'second_letter_financial_snapshot.plan_type': plan_type }
      });

      res.json({ success: true, plan_type });
    } catch (error) {
      console.error('[SecondLetter] Plan type override error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
