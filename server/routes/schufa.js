const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { upload, uploadTimeout } = require('../middleware/upload');
const { uploadToGCS, getSignedUrl } = require('../services/gcs-service');
const { createSchufaScanJob } = require('../utils/fastApiClient');

/**
 * SCHUFA Routes Factory (Admin only)
 *
 * Dedicated SCHUFA upload + report endpoints.
 * The normal client upload flow uses auto-detection instead.
 */
module.exports = ({ Client, safeClientUpdate, getClient }) => {

  /**
   * POST /api/admin/schufa/:clientId/upload
   * Upload a SCHUFA document and trigger processing.
   * Admin-only endpoint with explicit creditor matching.
   */
  router.post('/:clientId/upload',
    uploadTimeout(300000),
    upload.single('document'),
    async (req, res) => {
      try {
        const { clientId } = req.params;

        const client = await Client.findOne({ id: clientId });
        if (!client) {
          return res.status(404).json({ success: false, error: 'Client not found' });
        }

        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // Upload to GCS
        const gcsFilename = `clients/${clientId}/schufa/${Date.now()}_${req.file.originalname}`;
        const gcsResult = await uploadToGCS(req.file.buffer, gcsFilename, req.file.mimetype);

        // Create document record in client
        const documentId = uuidv4();
        const signedUrl = await getSignedUrl(gcsFilename);

        const docRecord = {
          id: documentId,
          name: req.file.originalname,
          filename: gcsFilename,
          type: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date(),
          url: signedUrl,
          processing_status: 'processing',
          document_status: 'pending',
        };

        // Add to documents array
        client.documents.push(docRecord);

        // Initialize schufa_report
        client.schufa_report = {
          document_id: documentId,
          uploaded_at: new Date(),
          processing_status: 'processing',
        };

        await client.save();

        // Build existing creditors for matching
        const existingCreditors = (client.final_creditor_list || [])
          .filter(c => c.status !== 'rejected')
          .map(c => ({
            id: c.id,
            name: c.sender_name || c.glaeubiger_name || '',
            claim_amount: c.claim_amount || 0,
          }));

        // Get signed URL for FastAPI to download
        const downloadUrl = await getSignedUrl(gcsFilename);

        // Trigger FastAPI SCHUFA scan
        const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:10000'}/api/webhooks/schufa-processing`;

        const scanResult = await createSchufaScanJob({
          clientId,
          file: {
            filename: req.file.originalname,
            gcs_path: downloadUrl,
            mime_type: req.file.mimetype,
          },
          webhookUrl,
          existingCreditors,
        });

        if (!scanResult.success) {
          // Update status to error
          client.schufa_report.processing_status = 'error';
          await client.save();

          return res.status(502).json({
            success: false,
            error: `SCHUFA scan failed: ${scanResult.error}`,
          });
        }

        // Save job ID
        client.schufa_report.job_id = scanResult.job_id;
        await client.save();

        res.json({
          success: true,
          message: 'SCHUFA-Dokument hochgeladen. Verarbeitung laeuft.',
          document_id: documentId,
          job_id: scanResult.job_id,
          existing_creditors_for_matching: existingCreditors.length,
        });

      } catch (error) {
        console.error('SCHUFA upload error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * GET /api/admin/schufa/:clientId/report
   * Get the SCHUFA report for a client.
   */
  router.get('/:clientId/report', async (req, res) => {
    try {
      const { clientId } = req.params;

      const client = await Client.findOne({ id: clientId });
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      if (!client.schufa_report || !client.schufa_report.processed_at) {
        return res.status(404).json({
          success: false,
          error: 'Kein SCHUFA-Report vorhanden',
          processing_status: client.schufa_report?.processing_status || null,
        });
      }

      res.json({
        success: true,
        report: client.schufa_report,
      });

    } catch (error) {
      console.error('SCHUFA report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/schufa/:clientId/apply-new-creditors
   * Add selected new creditors from SCHUFA to the final_creditor_list.
   */
  router.post('/:clientId/apply-new-creditors', async (req, res) => {
    try {
      const { clientId } = req.params;
      const { creditor_indices } = req.body; // Array of indices into new_creditors

      if (!Array.isArray(creditor_indices) || creditor_indices.length === 0) {
        return res.status(400).json({ success: false, error: 'creditor_indices required' });
      }

      const client = await Client.findOne({ id: clientId });
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      const newCreditors = client.schufa_report?.new_creditors || [];
      const added = [];

      for (const idx of creditor_indices) {
        if (idx < 0 || idx >= newCreditors.length) continue;
        const nc = newCreditors[idx];
        if (nc.added_to_creditor_list) continue; // Already added

        const creditorEntry = {
          id: uuidv4(),
          sender_name: nc.name,
          glaeubiger_name: nc.name,
          claim_amount: nc.amount || 0,
          status: 'confirmed',
          created_via: 'schufa_import',
          created_at: new Date(),
          source_documents: [],
        };

        client.final_creditor_list.push(creditorEntry);
        nc.added_to_creditor_list = true;
        nc.added_at = new Date();
        added.push(creditorEntry);
      }

      if (added.length > 0) {
        await client.save();
      }

      res.json({
        success: true,
        message: `${added.length} Glaeubiger aus SCHUFA hinzugefuegt`,
        added_creditors: added,
      });

    } catch (error) {
      console.error('SCHUFA apply creditors error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/schufa/:clientId/deletion-check
   * Get deletion analysis for SCHUFA entries.
   */
  router.get('/:clientId/deletion-check', async (req, res) => {
    try {
      const { clientId } = req.params;

      const client = await Client.findOne({ id: clientId });
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      const analysis = client.schufa_report?.deletion_analysis || [];
      const deletableNow = analysis.filter(a => a.is_deletable_now);

      res.json({
        success: true,
        total_entries: analysis.length,
        deletable_now: deletableNow.length,
        deletion_analysis: analysis,
      });

    } catch (error) {
      console.error('SCHUFA deletion check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
