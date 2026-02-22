const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits: securityRateLimits } = require('../middleware/security');
const SystemSettings = require('../models/SystemSettings');

module.exports = () => {
  // GET /api/admin/settings/email-test-mode
  router.get('/settings/email-test-mode',
    securityRateLimits.admin,
    authenticateAdmin,
    async (req, res) => {
      try {
        const enabled = await SystemSettings.getValue('creditor_email_test_mode', false);
        const testAddress = await SystemSettings.getValue('creditor_email_test_address', 'justlukax@gmail.com');

        res.json({ enabled, testAddress });
      } catch (error) {
        console.error('Error loading email test mode settings:', error.message);
        res.status(500).json({ error: 'Failed to load settings' });
      }
    }
  );

  // PUT /api/admin/settings/email-test-mode
  router.put('/settings/email-test-mode',
    securityRateLimits.admin,
    authenticateAdmin,
    async (req, res) => {
      try {
        const { enabled, testAddress } = req.body;

        if (typeof enabled !== 'boolean') {
          return res.status(400).json({ error: 'enabled must be a boolean' });
        }

        await SystemSettings.setValue('creditor_email_test_mode', enabled);

        if (testAddress && typeof testAddress === 'string') {
          await SystemSettings.setValue('creditor_email_test_address', testAddress);
        }

        const currentEnabled = await SystemSettings.getValue('creditor_email_test_mode', false);
        const currentAddress = await SystemSettings.getValue('creditor_email_test_address', 'justlukax@gmail.com');

        console.log(`📧 Email test mode ${currentEnabled ? 'ENABLED' : 'DISABLED'} (address: ${currentAddress})`);

        res.json({ enabled: currentEnabled, testAddress: currentAddress });
      } catch (error) {
        console.error('Error updating email test mode settings:', error.message);
        res.status(500).json({ error: 'Failed to update settings' });
      }
    }
  );

  return router;
};
