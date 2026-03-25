const ActivityLog = require('../models/ActivityLog');

const activityLogService = {
  async log(kanzleiId, clientReference, type, details = {}, createdBy = 'system') {
    return ActivityLog.create({
      kanzleiId,
      clientReference,
      type,
      details,
      created_by: createdBy,
    });
  },

  async getForClient(clientReference, limit = 50) {
    return ActivityLog.find({ clientReference })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
  },

  async getForKanzlei(kanzleiId, { limit = 50, offset = 0, type } = {}) {
    const query = { kanzleiId };
    if (type) query.type = type;
    return ActivityLog.find(query)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
  },
};

module.exports = activityLogService;
