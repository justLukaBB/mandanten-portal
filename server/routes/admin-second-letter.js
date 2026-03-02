const express = require('express');
const router = express.Router();
const createAdminSecondLetterController = require('../controllers/adminSecondLetterController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');
const { calculateSecondLetterFinancials } = require('../services/secondLetterCalculationService');
const SecondLetterService = require('../services/secondLetterService');
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
      const client = await Client.findById(clientId);

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

      await Client.findByIdAndUpdate(client._id, { $set: calcUpdate });

      res.json({
        success: calcResult.success,
        error: calcResult.error || null,
        garnishable_amount: calcResult.garnishableAmount || null,
        plan_type: calcResult.planType || null,
        total_debt: calcResult.totalDebt || null,
        creditor_count: calcResult.creditorCalculations?.length || 0
      });

    } catch (error) {
      console.error('[SecondLetter] Recalculation error:', error);
      res.status(500).json({ error: 'Internal server error during recalculation' });
    }
  });

  // Phase 33: POST /api/admin/clients/:clientId/send-second-letter
  // Dispatches pre-generated DOCX emails to all eligible creditors.
  // Returns 409 for invalid status, 422 for no eligible creditors,
  // 207 for partial failure, 200 for full success.
  router.post('/clients/:clientId/send-second-letter',
    authenticateAdmin,
    async (req, res) => {
      try {
        const { clientId } = req.params;
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

      const client = await Client.findById(clientId);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (client.second_letter_status === 'SENT') {
        return res.status(400).json({ error: 'Cannot override plan_type after letters are sent' });
      }
      if (!client.second_letter_financial_snapshot) {
        return res.status(400).json({ error: 'No snapshot exists — client must submit form first' });
      }

      await Client.findByIdAndUpdate(client._id, {
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
