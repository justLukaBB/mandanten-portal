const Kanzlei = require('../models/Kanzlei');

/**
 * Look up the Kanzlei for a client document.
 * Returns null if client has no kanzleiId or Kanzlei not found.
 */
async function getKanzleiForClient(client) {
  if (!client.kanzleiId) return null;
  return Kanzlei.findOne({ id: client.kanzleiId }).lean();
}

/**
 * Check whether a client's Kanzlei has Zendesk integration enabled.
 */
async function hasZendeskForClient(client) {
  const kanzlei = await getKanzleiForClient(client);
  return kanzlei?.integrations?.zendesk?.enabled === true;
}

module.exports = { getKanzleiForClient, hasZendeskForClient };
