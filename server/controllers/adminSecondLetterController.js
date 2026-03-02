/**
 * Admin Second Letter Controller Factory
 * Handles the admin-triggered 2. Anschreiben endpoint.
 *
 * @param {Object} dependencies
 * @param {import('../services/secondLetterTriggerService')} dependencies.secondLetterTriggerService
 */
const createAdminSecondLetterController = ({ secondLetterTriggerService }) => {

  /**
   * Trigger the 2. Anschreiben workflow for a single client.
   * POST /api/admin/clients/:clientId/trigger-second-letter
   *
   * Returns 200 in all non-error cases (idempotent endpoint).
   * Already-triggered clients get { success: false, alreadyTriggered: true } — NOT a 409.
   */
  const triggerSecondLetter = async (req, res) => {
    try {
      const { clientId } = req.params;
      const actor = req.adminId || 'admin';

      const result = await secondLetterTriggerService.triggerForClient(clientId, actor);

      if (result.alreadyTriggered) {
        // Return 200 (NOT 409) — idempotent endpoint per research pitfall #5
        return res.json({
          success: false,
          alreadyTriggered: true,
          currentStatus: result.currentStatus,
          message: 'Client ist bereits im Status ' + result.currentStatus
        });
      }

      return res.json({
        success: true,
        clientId: result.clientId,
        aktenzeichen: result.aktenzeichen,
        emailSent: result.emailSent
      });
    } catch (error) {
      console.error('❌ Error triggering second letter:', error);
      return res.status(500).json({
        error: 'Failed to trigger second letter',
        details: error.message
      });
    }
  };

  return { triggerSecondLetter };
};

module.exports = createAdminSecondLetterController;
