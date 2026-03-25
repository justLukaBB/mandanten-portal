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

  // Proxy download for email attachments (Resend URLs or base64 content)
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
        const safeFilename = (attachment.filename || 'document').replace(/"/g, '_');
        const contentType = attachment.content_type || 'application/octet-stream';

        // Case 1: Attachment has base64 content (from Resend inbound webhook)
        if (attachment.content && !attachment.url) {
          const buffer = Buffer.from(attachment.content, 'base64');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
          res.setHeader('Content-Length', buffer.length);
          return res.send(buffer);
        }

        if (!attachment.url) {
          return res.status(404).json({ error: 'Attachment URL not available' });
        }

        // Case 2: Proxy download from URL
        const axios = require('axios');
        const isResendApi = attachment.url.includes('api.resend.com');

        // Only send Resend auth for Resend API URLs
        const headers = {};
        if (isResendApi && process.env.RESEND_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.RESEND_API_KEY}`;
        }

        const response = await axios.get(attachment.url, {
          responseType: 'arraybuffer',
          headers,
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 300,
        });

        // Verify we got actual file data, not an error page
        const upstreamType = response.headers['content-type'] || '';
        if (upstreamType.includes('text/html') || upstreamType.includes('application/json')) {
          console.error('Attachment proxy got non-file response:', upstreamType, 'from:', attachment.url);
          return res.status(502).json({ error: 'Upstream returned non-file response, attachment may have expired' });
        }

        // Use upstream content-type if available, fall back to stored metadata
        const finalContentType = upstreamType || contentType;
        res.setHeader('Content-Type', finalContentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Length', response.data.byteLength);
        res.send(Buffer.from(response.data));
      } catch (error) {
        console.error('Attachment download error:', error.message);
        if (error.response) {
          console.error('Upstream status:', error.response.status, 'URL:', error.config?.url);
        }
        if (!res.headersSent) {
          res.status(502).json({ error: 'Failed to download attachment — source may be unavailable or expired' });
        }
      }
    }
  );

  return router;
};
