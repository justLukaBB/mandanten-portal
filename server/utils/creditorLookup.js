const CreditorDatabase = require('../models/CreditorDatabase');

const normalizeName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(gmbh|ag|kg|ohg|ug|e\.?v\.?|mbh|co|inkasso|bank)\b/g, '')
    .trim();
};

const extractKeywords = (name) => {
  const normalized = normalizeName(name);
  const stopwords = ['der', 'die', 'das', 'und', 'für', 'von', 'zu'];
  return normalized
    .split(' ')
    .filter((w) => w.length > 2 && !stopwords.includes(w));
};

const escapeRegex = (value = '') =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchQuery = (name) => {
  const normalized = normalizeName(name);
  const keywords = extractKeywords(name);
  const escapedName = escapeRegex(name || '');
  const escapedNormalized = escapeRegex(normalized || '');
  const nameRegex = escapedName ? new RegExp(escapedName, 'i') : null;
  const normalizedRegex = escapedNormalized ? new RegExp(escapedNormalized, 'i') : null;

  const orConditions = [];

  if (nameRegex) {
    // Raw name (with umlauts if present)
    orConditions.push({ creditor_name: nameRegex });
    orConditions.push({
      alternative_names: { $elemMatch: { $regex: nameRegex } },
    });
  }

  if (normalizedRegex) {
    // Normalized name (ae/oe/ue)
    orConditions.push({ creditor_name: normalizedRegex });
    orConditions.push({
      alternative_names: { $elemMatch: { $regex: normalizedRegex } },
    });
    // If the document has a name_normalized field, prefer that too
    orConditions.push({ name_normalized: normalizedRegex });
  }

  if (keywords.length > 0) {
    orConditions.push({ name_keywords: { $in: keywords } });
  }

  if (orConditions.length === 0) return null;

  return { $or: orConditions };
};

/**
 * Find a creditor in the local database by name using the same logic
 * as the admin creditor database search.
 * @param {string} name
 * @returns {Promise<object|null>} Creditor document or null
 */
const findCreditorByName = async (name) => {
  const query = buildSearchQuery(name);
  if (!query) {
    console.log('[creditorLookup] skip lookup - empty name');
    return null;
  }

  console.log('[creditorLookup] lookup start', {
    input: name,
    normalized: normalizeName(name),
    keywords: extractKeywords(name),
    query,
  });

  const match = await CreditorDatabase.findOne(query).lean();

  if (match) {
    console.log('[creditorLookup] lookup hit', {
      id: match._id?.toString?.() || match.id,
      creditor_name: match.creditor_name,
      email: match.email,
      address: match.address,
    });
  } else {
    console.log('[creditorLookup] lookup miss', { input: name });
  }

  return match;
};

module.exports = {
  normalizeName,
  extractKeywords,
  findCreditorByName,
};

