const express = require('express');
const Client = require('../models/Client');

const router = express.Router();

// GET /api/test/test-client?id=<clientIdOrAktenzeichen>
router.get('/test-client', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id query param' });
    }

    const client =
      (await Client.findOne({ id }).lean()) ||
      (await Client.findOne({ aktenzeichen: id }).lean());

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    return res.json({
      success: true,
      client: {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        final_creditor_list: client.final_creditor_list || [],
        deduplication_stats: client.deduplication_stats || null,
      },
    });
  } catch (err) {
    console.error('Test client fetch failed', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/test/clear-final-creditors?id=<clientIdOrAktenzeichen>
router.get('/clear-final-creditors', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id in query' });
    }

    const client =
      (await Client.findOne({ id })) ||
      (await Client.findOne({ aktenzeichen: id }));

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    client.final_creditor_list = [];
    client.deduplication_stats = null;
    await client.save();

    return res.json({
      success: true,
      message: 'final_creditor_list cleared',
      client: {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        final_creditor_list: client.final_creditor_list,
        deduplication_stats: client.deduplication_stats,
      },
    });
  } catch (err) {
    console.error('Clear final_creditors failed', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/test/client?id=<clientIdOrAktenzeichen>
router.get('/client', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id in query' });
    }

    const client =
      (await Client.findOne({ id }).lean()) ||
      (await Client.findOne({ aktenzeichen: id }).lean());

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    return res.json({
      success: true,
      client,
    });
  } catch (err) {
    console.error('Fetch full client failed', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/test/mark-first-payment?id=<clientIdOrAktenzeichen>
router.get('/mark-first-payment', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id in query' });
    }

    const client =
      (await Client.findOne({ id })) ||
      (await Client.findOne({ aktenzeichen: id }));

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    client.first_payment_received = true;
    client.payment_processed_at = client.payment_processed_at || new Date();
    await client.save();

    return res.json({
      success: true,
      message: 'first_payment_received set to true',
      client: {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        first_payment_received: client.first_payment_received,
        payment_processed_at: client.payment_processed_at,
      },
    });
  } catch (err) {
    console.error('Mark first payment failed', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

module.exports = router;

