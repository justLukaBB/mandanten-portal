const { v4: uuidv4 } = require('uuid');

/**
 * Deduplicate creditors based on business rules
 * @param {Array} creditors
 * @param {string} strategy - 'latest' or 'highest_amount'
 */
/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a
 * @param {string} b
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,   // insertion
            matrix[i - 1][j] + 1    // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage (0-1)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const normalized1 = str1.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
  const normalized2 = str2.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');

  if (normalized1 === normalized2) return 1;
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return 0.95;

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  return 1 - (distance / maxLength);
}

/**
 * Deduplicate creditors based on fuzzy matching logic (References & Names)
 * @param {Array} creditors
 * @param {string} strategy - 'latest' or 'highest_amount'
 */
function deduplicateCreditors(creditors, strategy = 'highest_amount') {
  if (!Array.isArray(creditors) || creditors.length === 0) return [];

  const groups = [];

  // Helper to check if a creditor matches a group
  const matchesGroup = (creditor, group) => {
    // Check against all members of the group
    return group.some(member => {
      // 1. Strong Match: Reference Number
      if (
        creditor.reference_number &&
        member.reference_number &&
        creditor.reference_number !== 'N/A' &&
        member.reference_number !== 'N/A' &&
        creditor.reference_number.trim() === member.reference_number.trim()
      ) {
        return true;
      }

      // 2. Name Match (Fuzzy)
      const similarity = calculateSimilarity(creditor.sender_name, member.sender_name);
      return similarity >= 0.85;
    });
  };

  // Grouping Pass
  for (const creditor of creditors) {
    let matchedGroup = null;

    // Try to find a matching group
    for (const group of groups) {
      if (matchesGroup(creditor, group)) {
        matchedGroup = group;
        break;
      }
    }

    if (matchedGroup) {
      matchedGroup.push(creditor);
    } else {
      groups.push([creditor]);
    }
  }

  // Selection Pass (Reduce groups to single entries)
  const deduplicatedCreditors = groups.map(group => {
    if (group.length === 1) return group[0];

    // Select based on strategy
    let selectedCreditor;
    if (strategy === 'highest_amount') {
      selectedCreditor = group.reduce((best, current) => {
        const currentAmount = parseFloat(current.claim_amount) || 0;
        const bestAmount = parseFloat(best.claim_amount) || 0;
        return currentAmount > bestAmount ? current : best;
      });
    } else if (strategy === 'latest') {
      selectedCreditor = group.reduce((latest, current) => {
        const currentDate = new Date(current.created_at || current.confirmed_at || 0);
        const latestDate = new Date(latest.created_at || latest.confirmed_at || 0);
        return currentDate > latestDate ? current : latest;
      });
    } else {
      selectedCreditor = group[0]; // default
    }

    // Merge metadata
    const duplicates = group.filter(c => c.id !== selectedCreditor.id);

    // Prefer the one with a standard reference number if selected has 'N/A'
    if ((!selectedCreditor.reference_number || selectedCreditor.reference_number === 'N/A') && duplicates.length > 0) {
      const betterRef = duplicates.find(d => d.reference_number && d.reference_number !== 'N/A');
      if (betterRef) {
        selectedCreditor.reference_number = betterRef.reference_number;
      }
    }

    selectedCreditor.deduplication_info = {
      original_count: group.length,
      strategy_used: strategy,
      deduplicated_at: new Date().toISOString(),
      duplicate_ids: duplicates.map((c) => c.id),
      merged_names: duplicates.map(c => c.sender_name)
    };

    return selectedCreditor;
  });

  return deduplicatedCreditors;
}

/**
 * Deduplicate creditors from documents
 * @param {Array} documents
 * @param {string} strategy
 */
function deduplicateCreditorsFromDocuments(documents, strategy = 'highest_amount') {
  if (!Array.isArray(documents) || documents.length === 0) return [];

  const extractedCreditors = [];
  documents.forEach((doc) => {
    if (doc.is_creditor_document && doc.extracted_data?.creditor_data) {
      const cd = doc.extracted_data.creditor_data;
      extractedCreditors.push({
        id: doc.id || uuidv4(),
        sender_name: cd.sender_name,
        sender_address: cd.sender_address,
        sender_email: cd.sender_email,
        reference_number: cd.reference_number,
        claim_amount: cd.claim_amount || 0,
        is_representative: cd.is_representative || false,
        actual_creditor: cd.actual_creditor,
        source_document: doc.name,
        source_document_id: doc.id,
        ai_confidence: doc.confidence || doc.extracted_data?.confidence || 0,
        status: 'confirmed',
        created_at: doc.uploadedAt || new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        extraction_method: 'document_upload',
      });
    }
  });

  return deduplicateCreditors(extractedCreditors, strategy);
}

/**
 * Merge new creditors with existing final_creditor_list
 * @param {Array} existingCreditors
 * @param {Array} newCreditors
 * @param {string} strategy
 */
function mergeCreditorLists(existingCreditors = [], newCreditors = [], strategy = 'highest_amount') {
  const allCreditors = [...existingCreditors, ...newCreditors];
  return deduplicateCreditors(allCreditors, strategy);
}

module.exports = {
  deduplicateCreditors,
  deduplicateCreditorsFromDocuments,
  mergeCreditorLists,
};