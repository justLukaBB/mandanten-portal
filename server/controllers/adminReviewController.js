/**
 * Admin Review Controller Factory
 * Handles business logic for the Admin Review Queue Management
 * @param {Object} dependencies - Dependencies injected from route
 * @param {Object} dependencies.Client - Client model
 */

/**
 * Calculate a numeric priority score for a client's review urgency.
 * Higher score = more urgent.
 * Weights: 40% days since payment, 40% inverse confidence, 20% creditor count.
 *
 * @param {Object} client - Mongoose client document
 * @returns {number} Numeric priority score
 */
function calculatePriorityScore(client) {
  const creditors = client.final_creditor_list || [];
  const reviewCreditors = creditors.filter(c => c.needs_manual_review);

  // Days since payment (0 if no payment date)
  const daysSincePayment = client.payment_processed_at
    ? (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  // Average confidence of creditors needing review (lower = more urgent)
  const avgConfidence = reviewCreditors.length > 0
    ? reviewCreditors.reduce((sum, c) => sum + (c.confidence || c.ai_confidence || 0), 0) / reviewCreditors.length
    : 1; // No review creditors = lowest priority

  // Creditor count factor (more creditors = more urgent)
  const creditorCount = reviewCreditors.length;

  // Priority score formula: higher = more urgent
  // Weight: 40% days, 40% inverse confidence, 20% creditor count
  const score = Math.round(
    (daysSincePayment * 4) +          // 4 points per day waiting
    ((1 - avgConfidence) * 100 * 4) + // Up to 400 points for low confidence
    (creditorCount * 10)              // 10 points per creditor needing review
  );

  return score;
}

const createAdminReviewController = ({ Client }) => {

  /**
   * Assign a review case to an agent
   * POST /api/admin/review/:clientId/assign
   */
  const assignReview = async (req, res) => {
    try {
      const { clientId } = req.params;
      const { assigned_to } = req.body;

      if (!assigned_to) {
        return res.status(400).json({ error: 'assigned_to is required' });
      }

      const client = await Client.findOneAndUpdate(
        { id: clientId },
        {
          $set: {
            review_assignment: {
              assigned_to,
              assigned_by: req.adminId || 'admin',
              assigned_at: new Date(),
              assignment_type: 'manual'
            }
          }
        },
        { new: true }
      );

      if (!client) {
        return res.status(404).json({ error: 'Client not found', client_id: clientId });
      }

      console.log(`✅ Admin Review: Assigned client ${clientId} to agent ${assigned_to}`);

      return res.json({
        success: true,
        client_id: clientId,
        assigned_to
      });
    } catch (error) {
      console.error('❌ Error assigning review:', error);
      return res.status(500).json({ error: 'Failed to assign review', details: error.message });
    }
  };

  /**
   * Unassign a review case
   * DELETE /api/admin/review/:clientId/assign
   */
  const unassignReview = async (req, res) => {
    try {
      const { clientId } = req.params;

      const client = await Client.findOneAndUpdate(
        { id: clientId },
        { $unset: { review_assignment: 1 } },
        { new: true }
      );

      if (!client) {
        return res.status(404).json({ error: 'Client not found', client_id: clientId });
      }

      console.log(`✅ Admin Review: Unassigned client ${clientId}`);

      return res.json({ success: true, client_id: clientId });
    } catch (error) {
      console.error('❌ Error unassigning review:', error);
      return res.status(500).json({ error: 'Failed to unassign review', details: error.message });
    }
  };

  /**
   * Batch assign multiple clients to an agent
   * POST /api/admin/review/batch/assign
   */
  const batchAssign = async (req, res) => {
    try {
      const { client_ids, assigned_to } = req.body;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        return res.status(400).json({ error: 'client_ids array is required and must not be empty' });
      }

      if (!assigned_to) {
        return res.status(400).json({ error: 'assigned_to is required' });
      }

      const result = await Client.updateMany(
        { id: { $in: client_ids } },
        {
          $set: {
            review_assignment: {
              assigned_to,
              assigned_by: req.adminId || 'admin',
              assigned_at: new Date(),
              assignment_type: 'batch'
            }
          }
        }
      );

      console.log(`✅ Admin Review: Batch assigned ${result.modifiedCount} clients to ${assigned_to}`);

      return res.json({ success: true, updated_count: result.modifiedCount });
    } catch (error) {
      console.error('❌ Error batch assigning reviews:', error);
      return res.status(500).json({ error: 'Failed to batch assign reviews', details: error.message });
    }
  };

  /**
   * Batch update priority for multiple clients
   * POST /api/admin/review/batch/priority
   */
  const batchUpdatePriority = async (req, res) => {
    try {
      const { client_ids, priority } = req.body;

      const allowedPriorities = ['high', 'medium', 'low'];

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        return res.status(400).json({ error: 'client_ids array is required and must not be empty' });
      }

      if (!priority || !allowedPriorities.includes(priority)) {
        return res.status(400).json({
          error: `priority must be one of: ${allowedPriorities.join(', ')}`
        });
      }

      const result = await Client.updateMany(
        { id: { $in: client_ids } },
        { $set: { manual_priority_override: priority } }
      );

      console.log(`✅ Admin Review: Batch updated priority to ${priority} for ${result.modifiedCount} clients`);

      return res.json({ success: true, updated_count: result.modifiedCount });
    } catch (error) {
      console.error('❌ Error batch updating priority:', error);
      return res.status(500).json({ error: 'Failed to batch update priority', details: error.message });
    }
  };

  /**
   * Batch confirm all creditors needing manual review for multiple clients
   * POST /api/admin/review/batch/confirm
   */
  const batchConfirm = async (req, res) => {
    try {
      const { client_ids } = req.body;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        return res.status(400).json({ error: 'client_ids array is required and must not be empty' });
      }

      let confirmed_count = 0;

      for (const clientId of client_ids) {
        const client = await Client.findOne({ id: clientId });
        if (!client) continue;

        let changed = false;
        for (const creditor of client.final_creditor_list) {
          if (creditor.needs_manual_review) {
            creditor.needs_manual_review = false;
            creditor.manually_reviewed = true;
            creditor.reviewed_at = new Date();
            creditor.reviewed_by = req.adminId || 'admin';
            creditor.review_action = 'confirmed';
            changed = true;
          }
        }

        if (changed) {
          await client.save();
          confirmed_count++;
        }
      }

      console.log(`✅ Admin Review: Batch confirmed creditors for ${confirmed_count} clients`);

      return res.json({ success: true, confirmed_count });
    } catch (error) {
      console.error('❌ Error batch confirming reviews:', error);
      return res.status(500).json({ error: 'Failed to batch confirm reviews', details: error.message });
    }
  };

  /**
   * Get the review queue with priority scores
   * GET /api/admin/review/queue
   */
  const getQueueWithPriority = async (req, res) => {
    try {
      console.log(`🔍 Admin Review: Getting queue with priority scores`);

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const perPage = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const priorityFilter = req.query.priority; // 'high', 'medium', 'low', 'all', or undefined
      const searchFilter = req.query.search ? req.query.search.toLowerCase().trim() : '';

      // Same query as agentReviewController.getAvailableClients
      const clients = await Client.find({
        $or: [
          {
            final_creditor_list: {
              $elemMatch: { needs_manual_review: true }
            }
          },
          { current_status: 'creditor_review' },
          {
            $and: [
              { current_status: 'awaiting_client_confirmation' },
              {
                final_creditor_list: {
                  $elemMatch: { needs_manual_review: true }
                }
              }
            ]
          }
        ]
      });

      const queueClients = [];

      for (const client of clients) {
        const creditors = client.final_creditor_list || [];
        const reviewCreditors = creditors.filter(c => c.needs_manual_review);

        // Compute days since payment
        const daysSincePayment = client.payment_processed_at
          ? (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
          : 0;

        // Average confidence
        const avgConfidence = reviewCreditors.length > 0
          ? reviewCreditors.reduce((sum, c) => sum + (c.confidence || c.ai_confidence || 0), 0) / reviewCreditors.length
          : 1;

        // Derive priority string
        let priority = client.manual_priority_override || null;
        if (!priority) {
          if (daysSincePayment > 3 || avgConfidence < 0.4) {
            priority = 'high';
          } else if (daysSincePayment > 1 || avgConfidence < 0.6) {
            priority = 'medium';
          } else {
            priority = 'low';
          }
        }

        // Compute numeric priority score
        const priority_score = calculatePriorityScore(client);

        queueClients.push({
          id: client.id,
          name: `${client.firstName} ${client.lastName}`,
          aktenzeichen: client.aktenzeichen,
          creditor_count: creditors.length,
          review_creditor_count: reviewCreditors.length,
          priority,
          priority_score,
          avg_confidence: reviewCreditors.length > 0 ? Math.round((avgConfidence || 0) * 100) : 0,
          days_since_payment: Math.round(daysSincePayment),
          payment_received_at: client.payment_processed_at,
          review_assignment: client.review_assignment || null
        });
      }

      // Sort by priority_score descending (most urgent first)
      queueClients.sort((a, b) => b.priority_score - a.priority_score);

      // Filter by priority string if specified
      const filteredByPriority = priorityFilter && priorityFilter !== 'all'
        ? queueClients.filter(c => c.priority === priorityFilter)
        : queueClients;

      // Filter by search term
      const filteredBySearch = searchFilter
        ? filteredByPriority.filter(c =>
            c.name.toLowerCase().includes(searchFilter) ||
            (c.aktenzeichen && c.aktenzeichen.toLowerCase().includes(searchFilter))
          )
        : filteredByPriority;

      // Paginate
      const total = filteredBySearch.length;
      const pages = Math.max(Math.ceil(total / perPage), 1);
      const safePage = Math.min(page, pages);
      const start = (safePage - 1) * perPage;
      const end = start + perPage;
      const pagedClients = filteredBySearch.slice(start, end);

      console.log(`📊 Admin Review Queue: ${total} clients total, page ${safePage}/${pages}`);

      return res.json({
        success: true,
        clients: pagedClients,
        total,
        page: safePage,
        per_page: perPage,
        pages
      });
    } catch (error) {
      console.error('❌ Error getting review queue:', error);
      return res.status(500).json({ error: 'Failed to get review queue', details: error.message });
    }
  };

  /**
   * Get analytics data for the review dashboard
   * GET /api/admin/review/analytics
   */
  const getAnalytics = async (req, res) => {
    try {
      const dateRangeParam = req.query.dateRange || '30';
      console.log(`🔍 Admin Review Analytics: dateRange=${dateRangeParam}`);

      // Compute date filter
      let dateFilter = null;
      if (dateRangeParam !== 'all') {
        const days = parseInt(dateRangeParam, 10) || 30;
        dateFilter = new Date(Date.now() - days * 86400000);
      }

      // ── KPI: pending (uses same filter as getAvailableClients) ──────────────
      const pendingQuery = {
        $or: [
          { final_creditor_list: { $elemMatch: { needs_manual_review: true } } },
          { current_status: 'creditor_review' },
          {
            $and: [
              { current_status: 'awaiting_client_confirmation' },
              { final_creditor_list: { $elemMatch: { needs_manual_review: true } } }
            ]
          }
        ]
      };
      const pending = await Client.countDocuments(pendingQuery);

      // ── Build date-range filter for reviewed creditors ───────────────────────
      // We need clients that have at least one creditor with review_action set
      const reviewedClientsQuery = {
        final_creditor_list: {
          $elemMatch: {
            review_action: { $exists: true, $ne: null },
            ...(dateFilter ? { reviewed_at: { $gte: dateFilter } } : {})
          }
        }
      };

      // Fetch all reviewed clients for aggregation (JS-side for flexibility)
      const reviewedClients = await Client.find(reviewedClientsQuery).lean();

      // ── KPI: totalReviews ──────────────────────────────────────────────────
      const totalReviews = reviewedClients.length;

      // ── Flatten reviewed creditors (within date range) ─────────────────────
      const reviewedCreditors = [];
      for (const client of reviewedClients) {
        for (const creditor of (client.final_creditor_list || [])) {
          if (!creditor.review_action) continue;
          if (dateFilter && creditor.reviewed_at && new Date(creditor.reviewed_at) < dateFilter) continue;
          if (dateFilter && !creditor.reviewed_at) continue;
          reviewedCreditors.push({ client, creditor });
        }
      }

      // ── KPI: avgProcessingTime ─────────────────────────────────────────────
      const processingTimes = [];
      for (const { client, creditor } of reviewedCreditors) {
        if (creditor.reviewed_at && client.created_at) {
          const diffHours = (new Date(creditor.reviewed_at).getTime() - new Date(client.created_at).getTime()) / (1000 * 60 * 60);
          if (diffHours > 0) processingTimes.push(diffHours);
        }
      }
      const avgProcessingTime = processingTimes.length > 0
        ? `${(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length).toFixed(1)}h`
        : '0h';

      // ── KPI: autoApprovedPercent ───────────────────────────────────────────
      const confirmedCount = reviewedCreditors.filter(({ creditor }) => creditor.review_action === 'confirm').length;
      const autoApprovedPercent = reviewedCreditors.length > 0
        ? parseFloat(((confirmedCount / reviewedCreditors.length) * 100).toFixed(1))
        : 0;

      // ── Chart: reviewsPerDay ───────────────────────────────────────────────
      const reviewsByDay = {};
      for (const { creditor } of reviewedCreditors) {
        if (!creditor.reviewed_at) continue;
        const dateStr = new Date(creditor.reviewed_at).toISOString().split('T')[0];
        reviewsByDay[dateStr] = (reviewsByDay[dateStr] || 0) + 1;
      }
      const reviewsPerDay = Object.entries(reviewsByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      // ── Chart: confidenceDistribution ──────────────────────────────────────
      const confBuckets = { '0-50%': 0, '50-80%': 0, '80-100%': 0 };
      for (const { creditor } of reviewedCreditors) {
        const conf = (creditor.confidence || creditor.ai_confidence || 0) * 100;
        if (conf < 50) confBuckets['0-50%']++;
        else if (conf < 80) confBuckets['50-80%']++;
        else confBuckets['80-100%']++;
      }
      const confidenceDistribution = [
        { range: '0-50%', count: confBuckets['0-50%'] },
        { range: '50-80%', count: confBuckets['50-80%'] },
        { range: '80-100%', count: confBuckets['80-100%'] },
      ];

      // ── Chart: outcomeBreakdown ────────────────────────────────────────────
      const outcomes = { confirm: 0, correct: 0, skip: 0 };
      for (const { creditor } of reviewedCreditors) {
        const action = creditor.review_action;
        if (action === 'confirm' || action === 'confirmed') outcomes.confirm++;
        else if (action === 'correct' || action === 'corrected') outcomes.correct++;
        else if (action === 'skip' || action === 'skipped') outcomes.skip++;
      }
      const outcomeBreakdown = [
        { name: 'Bestätigt', value: outcomes.confirm },
        { name: 'Korrigiert', value: outcomes.correct },
        { name: 'Übersprungen', value: outcomes.skip },
      ];

      // ── Chart: agentPerformance ────────────────────────────────────────────
      const agentMap = {};
      for (const { client, creditor } of reviewedCreditors) {
        const agent = creditor.reviewed_by || 'Unbekannt';
        if (!agentMap[agent]) {
          agentMap[agent] = { total: 0, confirmCount: 0, timings: [] };
        }
        agentMap[agent].total++;
        if (creditor.review_action === 'confirm' || creditor.review_action === 'confirmed') {
          agentMap[agent].confirmCount++;
        }
        if (creditor.reviewed_at && client.created_at) {
          const diffHours = (new Date(creditor.reviewed_at).getTime() - new Date(client.created_at).getTime()) / (1000 * 60 * 60);
          if (diffHours > 0) agentMap[agent].timings.push(diffHours);
        }
      }
      const agentPerformance = Object.entries(agentMap).map(([agent, stats]) => {
        const avgTime = stats.timings.length > 0
          ? `${(stats.timings.reduce((a, b) => a + b, 0) / stats.timings.length).toFixed(1)}h`
          : '0h';
        const accuracy = stats.total > 0
          ? parseFloat(((stats.confirmCount / stats.total) * 100).toFixed(1))
          : 0;
        return { agent, reviewsHandled: stats.total, avgTime, accuracy };
      }).sort((a, b) => b.reviewsHandled - a.reviewsHandled);

      console.log(`📊 Admin Review Analytics: totalReviews=${totalReviews}, pending=${pending}`);

      return res.json({
        success: true,
        data: {
          kpi: {
            totalReviews,
            pending,
            avgProcessingTime,
            autoApprovedPercent
          },
          charts: {
            reviewsPerDay,
            confidenceDistribution,
            outcomeBreakdown,
            agentPerformance
          }
        }
      });
    } catch (error) {
      console.error('❌ Error getting review analytics:', error);
      return res.status(500).json({ error: 'Failed to get review analytics', details: error.message });
    }
  };

  return {
    assignReview,
    unassignReview,
    batchAssign,
    batchUpdatePriority,
    batchConfirm,
    getQueueWithPriority,
    getAnalytics
  };
};

module.exports = createAdminReviewController;
module.exports.calculatePriorityScore = calculatePriorityScore;
