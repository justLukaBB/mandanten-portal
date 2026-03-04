const createAdminEmailController = ({ CreditorEmail, Client }) => {
  return {
    /**
     * GET /api/admin/emails
     * Paginated list with filters
     */
    list: async (req, res) => {
      try {
        const {
          page = 1,
          limit = 25,
          letter_type,
          match_status,
          review_status,
          search,
          sort_by = 'created_at',
          sort_order = 'desc',
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const filter = {};

        if (letter_type && letter_type !== 'all') {
          filter.letter_type = letter_type;
        }
        if (match_status && match_status !== 'all') {
          filter.match_status = match_status;
        }
        if (review_status && review_status !== 'all') {
          filter.review_status = review_status;
        }

        if (search) {
          const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          filter.$or = [
            { creditor_name: searchRegex },
            { creditor_email: searchRegex },
            { client_name: searchRegex },
            { client_aktenzeichen: searchRegex },
          ];
        }

        const sortObj = {};
        sortObj[sort_by] = sort_order === 'asc' ? 1 : -1;

        const [emails, total] = await Promise.all([
          CreditorEmail.find(filter)
            .sort(sortObj)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
          CreditorEmail.countDocuments(filter),
        ]);

        return res.json({
          success: true,
          emails,
          total,
          page: pageNum,
          per_page: limitNum,
          pages: Math.ceil(total / limitNum),
        });
      } catch (error) {
        console.error('Email list error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET /api/admin/emails/stats
     * Dashboard header stats
     */
    stats: async (req, res) => {
      try {
        const [
          total,
          pending,
          needsReview,
          autoMatched,
          noMatch,
          reviewed,
          dismissed,
        ] = await Promise.all([
          CreditorEmail.countDocuments(),
          CreditorEmail.countDocuments({ review_status: 'pending' }),
          CreditorEmail.countDocuments({ match_status: 'needs_review' }),
          CreditorEmail.countDocuments({ match_status: 'auto_matched' }),
          CreditorEmail.countDocuments({ match_status: 'no_match' }),
          CreditorEmail.countDocuments({ review_status: 'reviewed' }),
          CreditorEmail.countDocuments({ review_status: 'dismissed' }),
        ]);

        // Average confidence
        const avgResult = await CreditorEmail.aggregate([
          { $match: { match_confidence: { $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$match_confidence' } } },
        ]);
        const avgConfidence = avgResult[0]?.avg ? Math.round(avgResult[0].avg) : 0;

        return res.json({
          success: true,
          stats: {
            total,
            pending,
            needs_review: needsReview,
            auto_matched: autoMatched,
            no_match: noMatch,
            reviewed,
            dismissed,
            avg_confidence: avgConfidence,
          },
        });
      } catch (error) {
        console.error('Email stats error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET /api/admin/emails/:id
     * Single email detail
     */
    detail: async (req, res) => {
      try {
        const email = await CreditorEmail.findById(req.params.id).lean();
        if (!email) {
          return res.status(404).json({ error: 'Email not found' });
        }
        return res.json({ success: true, email });
      } catch (error) {
        console.error('Email detail error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },

    /**
     * PATCH /api/admin/emails/:id/review
     * Update review status + notes
     */
    review: async (req, res) => {
      try {
        const { review_status, review_notes } = req.body;

        if (!['pending', 'reviewed', 'dismissed'].includes(review_status)) {
          return res.status(400).json({ error: 'Invalid review_status' });
        }

        const update = {
          review_status,
          reviewed_at: new Date(),
          reviewed_by: req.admin?.username || 'admin',
        };
        if (review_notes !== undefined) {
          update.review_notes = review_notes;
        }

        const email = await CreditorEmail.findByIdAndUpdate(
          req.params.id,
          { $set: update },
          { new: true }
        ).lean();

        if (!email) {
          return res.status(404).json({ error: 'Email not found' });
        }

        return res.json({ success: true, email });
      } catch (error) {
        console.error('Email review error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },

    /**
     * PATCH /api/admin/emails/:id/assign
     * Manually assign a no_match email to a client
     */
    assign: async (req, res) => {
      try {
        const { client_id } = req.body;

        if (!client_id) {
          return res.status(400).json({ error: 'client_id required' });
        }

        const client = await Client.findById(client_id).lean();
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }

        const email = await CreditorEmail.findByIdAndUpdate(
          req.params.id,
          {
            $set: {
              client_id: client._id,
              client_aktenzeichen: client.aktenzeichen,
              client_name: `${client.firstName} ${client.lastName}`,
              match_status: 'auto_matched',
              review_status: 'reviewed',
              reviewed_at: new Date(),
              reviewed_by: req.admin?.username || 'admin',
            },
          },
          { new: true }
        ).lean();

        if (!email) {
          return res.status(404).json({ error: 'Email not found' });
        }

        return res.json({ success: true, email });
      } catch (error) {
        console.error('Email assign error:', error.message);
        return res.status(500).json({ error: error.message });
      }
    },
  };
};

module.exports = createAdminEmailController;
