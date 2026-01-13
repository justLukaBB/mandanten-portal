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
 * Calculate similarity between two strings (0-1).
 * Uses longest common subsequence approach.
 */
const stringSimilarity = (str1, str2) => {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Check if shorter is contained in longer
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Count matching characters
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }

  return matches / longer.length;
};

/**
 * Calculate match score based on keyword overlap.
 * Higher score = better match
 */
const calculateMatchScore = (searchKeywords, candidateName) => {
  const candidateKeywords = extractKeywords(candidateName);

  if (searchKeywords.length === 0 || candidateKeywords.length === 0) {
    return 0;
  }

  // For each search keyword, find best matching candidate keyword
  let totalScore = 0;
  for (const searchKw of searchKeywords) {
    let bestKeywordScore = 0;

    for (const candidateKw of candidateKeywords) {
      // Exact match
      if (searchKw === candidateKw) {
        bestKeywordScore = 1.0;
        break;
      }

      // Fuzzy match (e.g., "thiel" vs "thiele")
      const similarity = stringSimilarity(searchKw, candidateKw);
      if (similarity > bestKeywordScore) {
        bestKeywordScore = similarity;
      }
    }

    totalScore += bestKeywordScore;
  }

  // Calculate percentage of search keywords that matched
  const matchPercentage = totalScore / searchKeywords.length;

  // Bonus: exact match
  const normalizedSearch = normalizeName(searchKeywords.join(' '));
  const normalizedCandidate = normalizeName(candidateName);
  const exactMatch = normalizedSearch === normalizedCandidate ? 1.0 : 0;

  // Final score: 80% keyword match + 20% exact match bonus
  return (matchPercentage * 0.8) + (exactMatch * 0.2);
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

  const searchKeywords = extractKeywords(name);

  console.log('[creditorLookup] lookup start', {
    input: name,
    normalized: normalizeName(name),
    keywords: searchKeywords,
  });

  // Get ALL potential matches
  const allMatches = await CreditorDatabase.find(query).lean();

  if (!allMatches || allMatches.length === 0) {
    console.log('[creditorLookup] lookup miss - no candidates found');
    return null;
  }

  console.log(`[creditorLookup] found ${allMatches.length} potential matches, scoring...`);

  // Score each match
  const scoredMatches = allMatches.map(match => {
    const score = calculateMatchScore(searchKeywords, match.creditor_name);
    return { match, score };
  });

  // Sort by score descending
  scoredMatches.sort((a, b) => b.score - a.score);

  // Log top 3 scores for debugging
  console.log('[creditorLookup] top matches:');
  scoredMatches.slice(0, 3).forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.match.creditor_name} (score: ${(item.score * 100).toFixed(1)}%)`);
  });

  // Return the best match only if score is above minimum threshold
  const bestMatch = scoredMatches[0].match;
  const bestScore = scoredMatches[0].score;

  // Minimum score threshold - prevents matching unrelated creditors
  // Example: "Andreas Thiel" should NOT match "Rechtsanwälte Witte Thiel"
  // Configurable via CREDITOR_MATCH_MIN_SCORE (default: 0.65 = 65%)
  const MINIMUM_SCORE_THRESHOLD = parseFloat(process.env.CREDITOR_MATCH_MIN_SCORE) || 0.65;

  if (bestScore < MINIMUM_SCORE_THRESHOLD) {
    console.log('[creditorLookup] best match REJECTED - score too low', {
      creditor_name: bestMatch.creditor_name,
      score: `${(bestScore * 100).toFixed(1)}%`,
      threshold: `${(MINIMUM_SCORE_THRESHOLD * 100).toFixed(1)}%`,
      reason: 'Likely unrelated creditor - not enough keyword overlap',
    });
    return null;
  }

  console.log('[creditorLookup] best match selected', {
    id: bestMatch._id?.toString?.() || bestMatch.id,
    creditor_name: bestMatch.creditor_name,
    email: bestMatch.email,
    address: bestMatch.address,
    score: `${(bestScore * 100).toFixed(1)}%`,
  });

  return bestMatch;
};

module.exports = {
  normalizeName,
  extractKeywords,
  findCreditorByName,
};

