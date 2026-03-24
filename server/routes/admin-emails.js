const express = require('express');
const router = express.Router();
const createAdminEmailController = require('../controllers/adminEmailController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits: securityRateLimits } = require('../middleware/security');

module.exports = ({ CreditorEmail, Client }) => {
  const controller = createAdminEmailController({ CreditorEmail, Client });

  router.get('/emails',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.list
  );

  router.get('/emails/stats',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.stats
  );

  router.get('/emails/:id',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.detail
  );

  router.patch('/emails/:id/review',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.review
  );

  router.patch('/emails/:id/assign',
    securityRateLimits.admin,
    authenticateAdmin,
    controller.assign
  );

  // Proxy download for email attachments (Resend URLs may need auth or expire)
  router.get('/emails/:id/attachments/:index',
    securityRateLimits.admin,
    authenticateAdmin,
    async (req, res) => {
      try {
        const email = await CreditorEmail.findById(req.params.id).lean();
        if (!email) {
          return res.status(404).json({ error: 'Email not found' });
        }

        const index = parseInt(req.params.index);
        if (!email.attachments || !email.attachments[index]) {
          return res.status(404).json({ error: 'Attachment not found' });
        }

        const attachment = email.attachments[index];
        if (!attachment.url) {
          return res.status(404).json({ error: 'Attachment URL not available' });
        }

        // Proxy the download from Resend
        const axios = require('axios');
        const response = await axios.get(attachment.url, {
          responseType: 'stream',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          timeout: 30000,
        });

        res.setHeader('Content-Type', attachment.content_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${(attachment.filename || 'document').replace(/"/g, '_')}"`);
        if (attachment.size) {
          res.setHeader('Content-Length', attachment.size);
        }

        response.data.pipe(res);
      } catch (error) {
        console.error('Attachment download error:', error.message);
        res.status(500).json({ error: 'Failed to download attachment' });
      }
    }
  );

  return router;
};
