/**
 * Mongoose Tenant Plugin — Defense-in-Depth
 *
 * Automatically injects kanzleiId filter into find/findOne/count/countDocuments/aggregate
 * when a tenant context is set on the query via .setTenantContext(kanzleiId).
 *
 * Usage in model:
 *   schema.plugin(tenantPlugin);
 *
 * Usage in controller:
 *   Client.find({ status: 'active' }).setTenantContext(req.kanzleiId);
 *
 * If no tenant context is set, queries run without tenant filter (backwards-compatible).
 * SuperAdmin passes null/undefined to bypass filtering.
 */

function tenantPlugin(schema) {
  // Ensure kanzleiId field exists with index
  if (!schema.path('kanzleiId')) {
    schema.add({
      kanzleiId: { type: String, index: true }
    });
  }

  // Add helper to set tenant context on queries
  const queryTypes = ['find', 'findOne', 'countDocuments', 'count', 'findOneAndUpdate', 'findOneAndDelete', 'updateMany', 'deleteMany'];

  queryTypes.forEach(method => {
    schema.pre(method, function () {
      // If _tenantId was explicitly set on this query, inject it
      if (this._tenantId) {
        this.where({ kanzleiId: this._tenantId });
      }
      // If _tenantRequired flag is set but no tenantId, warn in dev
      if (this._tenantRequired && !this._tenantId) {
        console.warn(`[TenantPlugin] Query on ${this.model.modelName}.${method}() has tenantRequired but no tenantId set`);
      }
    });
  });

  // Aggregate hook
  schema.pre('aggregate', function () {
    if (this._tenantId) {
      this.pipeline().unshift({ $match: { kanzleiId: this._tenantId } });
    }
  });
}

// Monkey-patch Query prototype to add setTenantContext
const mongoose = require('mongoose');

if (!mongoose.Query.prototype.setTenantContext) {
  mongoose.Query.prototype.setTenantContext = function (kanzleiId) {
    if (kanzleiId) {
      this._tenantId = kanzleiId;
    }
    return this;
  };

  mongoose.Query.prototype.requireTenant = function () {
    this._tenantRequired = true;
    return this;
  };
}

if (!mongoose.Aggregate.prototype.setTenantContext) {
  mongoose.Aggregate.prototype.setTenantContext = function (kanzleiId) {
    if (kanzleiId) {
      this._tenantId = kanzleiId;
    }
    return this;
  };
}

module.exports = tenantPlugin;
