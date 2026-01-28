const { v4: uuidv4 } = require('uuid');

/**
 * Check if a document requires manual review based on its flags
 * @param {Object} doc - The document object
 * @returns {boolean} True if the document needs manual review
 */
function documentNeedsManualReview(doc) {
  if (!doc) return false;
  return doc.manual_review_required === true ||
         doc.validation?.requires_manual_review === true ||
         doc.extracted_data?.manual_review_required === true;
}

/**
 * Get review reasons from a document
 * @param {Object} doc - The document object
 * @returns {Array<string>} Array of review reasons
 */
function getDocumentReviewReasons(doc) {
  if (!doc) return [];
  const reasons = [];
  if (doc.validation?.review_reasons && Array.isArray(doc.validation.review_reasons)) {
    reasons.push(...doc.validation.review_reasons);
  }
  if (reasons.length === 0 && documentNeedsManualReview(doc)) {
    reasons.push('Dokument benötigt manuelle Prüfung');
  }
  return reasons;
}

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
  let mergeLog = [];

  // Helper to check if a creditor matches a group
  const matchesGroup = (creditor, group) => {
    // Check against all members of the group
    for (const member of group) {
      // 1. Strong Match: Reference Number
      if (
        creditor.reference_number &&
        member.reference_number &&
        creditor.reference_number !== 'N/A' &&
        member.reference_number !== 'N/A' &&
        creditor.reference_number.trim() === member.reference_number.trim()
      ) {
        mergeLog.push({
          type: 'reference_match',
          creditor: creditor.sender_name || creditor.glaeubiger_name,
          mergedWith: member.sender_name || member.glaeubiger_name,
          reference: creditor.reference_number
        });
        return true;
      }

      // 2. Name Match (Fuzzy)
      const creditorName = creditor.sender_name || creditor.glaeubiger_name || '';
      const memberName = member.sender_name || member.glaeubiger_name || '';
      const similarity = calculateSimilarity(creditorName, memberName);
      if (similarity >= 0.85) {
        mergeLog.push({
          type: 'name_match',
          creditor: creditorName,
          mergedWith: memberName,
          similarity: Math.round(similarity * 100) + '%'
        });
        return true;
      }
    }
    return false;
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

  // Log merge details if any merges happened
  if (mergeLog.length > 0) {
    console.log(`[deduplicateCreditors] Merge decisions (${mergeLog.length} merges):`);
    mergeLog.forEach((m, i) => {
      if (m.type === 'reference_match') {
        console.log(`  ${i+1}. "${m.creditor}" merged with "${m.mergedWith}" (same reference: ${m.reference})`);
      } else {
        console.log(`  ${i+1}. "${m.creditor}" merged with "${m.mergedWith}" (name similarity: ${m.similarity})`);
      }
    });
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

    // Merge needs_manual_review: if ANY creditor in the group needs review, the result needs review
    const anyNeedsReview = group.some(c => c.needs_manual_review === true);
    if (anyNeedsReview) {
      selectedCreditor.needs_manual_review = true;
      // Merge all unique review_reasons from the group
      const allReasons = new Set(selectedCreditor.review_reasons || []);
      group.forEach(c => {
        if (Array.isArray(c.review_reasons)) {
          c.review_reasons.forEach(r => allReasons.add(r));
        }
      });
      selectedCreditor.review_reasons = Array.from(allReasons);
    }

    return selectedCreditor;
  });

  return deduplicatedCreditors;
}

/**
 * Strict deduplication - only merges EXACT duplicates (same reference AND similar name >= 95%)
 * Used when merging FastAPI results with existing creditors to preserve AI-based deduplication
 * @param {Array} creditors
 * @param {string} strategy - 'latest' or 'highest_amount'
 */
function deduplicateCreditorsStrict(creditors, strategy = 'highest_amount') {
  if (!Array.isArray(creditors) || creditors.length === 0) return [];

  const groups = [];
  let mergeLog = [];

  // Helper to check if a creditor matches a group - STRICT version
  const matchesGroupStrict = (creditor, group) => {
    for (const member of group) {
      const creditorName = (creditor.sender_name || creditor.glaeubiger_name || '').toLowerCase().trim();
      const memberName = (member.sender_name || member.glaeubiger_name || '').toLowerCase().trim();
      const creditorRef = (creditor.reference_number || '').trim();
      const memberRef = (member.reference_number || '').trim();

      // Option 1: EXACT same reference number AND high name similarity (95%+)
      if (
        creditorRef &&
        memberRef &&
        creditorRef !== 'N/A' &&
        memberRef !== 'N/A' &&
        creditorRef === memberRef
      ) {
        const similarity = calculateSimilarity(creditorName, memberName);
        if (similarity >= 0.95) {
          mergeLog.push({
            type: 'strict_ref_and_name',
            creditor: creditor.sender_name || creditor.glaeubiger_name,
            mergedWith: member.sender_name || member.glaeubiger_name,
            reference: creditorRef,
            similarity: Math.round(similarity * 100) + '%'
          });
          return true;
        }
      }

      // Option 2: EXACT same name (100% match after normalization)
      if (creditorName && memberName && creditorName === memberName) {
        // Only merge exact names if they also have same or no reference
        const refsMatch = !creditorRef || !memberRef ||
                          creditorRef === 'N/A' || memberRef === 'N/A' ||
                          creditorRef === memberRef;
        if (refsMatch) {
          mergeLog.push({
            type: 'strict_exact_name',
            creditor: creditor.sender_name || creditor.glaeubiger_name,
            mergedWith: member.sender_name || member.glaeubiger_name
          });
          return true;
        }
      }
    }
    return false;
  };

  // Grouping Pass
  for (const creditor of creditors) {
    let matchedGroup = null;

    for (const group of groups) {
      if (matchesGroupStrict(creditor, group)) {
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

  // Log merge details if any merges happened
  if (mergeLog.length > 0) {
    console.log(`[deduplicateCreditorsStrict] Strict merge decisions (${mergeLog.length} merges):`);
    mergeLog.forEach((m, i) => {
      if (m.type === 'strict_ref_and_name') {
        console.log(`  ${i+1}. "${m.creditor}" merged with "${m.mergedWith}" (same ref: ${m.reference}, similarity: ${m.similarity})`);
      } else {
        console.log(`  ${i+1}. "${m.creditor}" merged with "${m.mergedWith}" (exact name match)`);
      }
    });
  } else {
    console.log(`[deduplicateCreditorsStrict] No merges - all ${creditors.length} creditors are unique`);
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
      selectedCreditor = group[0];
    }

    // Merge metadata
    const duplicates = group.filter(c => c.id !== selectedCreditor.id);

    selectedCreditor.deduplication_info = {
      original_count: group.length,
      strategy_used: strategy,
      deduplicated_at: new Date().toISOString(),
      duplicate_ids: duplicates.map((c) => c.id),
      merged_names: duplicates.map(c => c.sender_name || c.glaeubiger_name)
    };

    // Merge needs_manual_review
    const anyNeedsReview = group.some(c => c.needs_manual_review === true);
    if (anyNeedsReview) {
      selectedCreditor.needs_manual_review = true;
      const allReasons = new Set(selectedCreditor.review_reasons || []);
      group.forEach(c => {
        if (Array.isArray(c.review_reasons)) {
          c.review_reasons.forEach(r => allReasons.add(r));
        }
      });
      selectedCreditor.review_reasons = Array.from(allReasons);
    }

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
      const docNeedsReview = documentNeedsManualReview(doc);
      const reviewReasons = docNeedsReview ? getDocumentReviewReasons(doc) : [];

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
        needs_manual_review: docNeedsReview,
        review_reasons: reviewReasons,
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
  console.log(`[mergeCreditorLists] Starting merge:`);
  console.log(`  - Existing creditors: ${existingCreditors.length}`);
  console.log(`  - New creditors: ${newCreditors.length}`);

  // Log existing creditor names for debugging
  if (existingCreditors.length > 0) {
    console.log(`  - Existing names: ${existingCreditors.map(c => c.sender_name || c.glaeubiger_name || 'N/A').join(', ')}`);
  }

  // Log new creditor names for debugging
  if (newCreditors.length > 0) {
    console.log(`  - New names: ${newCreditors.map(c => c.sender_name || c.glaeubiger_name || 'N/A').join(', ')}`);
  }

  // Ensure all new creditors have fresh unique IDs to prevent ID collisions
  // This is critical for the frontend selection logic which relies on unique IDs
  const newWithFreshIds = newCreditors.map(c => ({
    ...c,
    id: uuidv4(),
    _original_id: c.id,  // Keep original ID for reference
    _from_fastapi: true  // Mark as coming from FastAPI to distinguish from existing
  }));

  const allCreditors = [...existingCreditors, ...newWithFreshIds];
  console.log(`  - Combined total before dedup: ${allCreditors.length}`);

  // Use strict deduplication for merge to preserve FastAPI's AI-based deduplication
  // FastAPI already did intelligent deduplication, we only remove exact duplicates here
  const result = deduplicateCreditorsStrict(allCreditors, strategy);
  console.log(`  - After deduplication: ${result.length}`);

  // Log which new creditors survived the deduplication
  const survivedFromFastapi = result.filter(c => c._from_fastapi === true);
  console.log(`  - New creditors that survived: ${survivedFromFastapi.length}`);

  if (survivedFromFastapi.length < newCreditors.length) {
    console.log(`  ⚠️ WARNING: ${newCreditors.length - survivedFromFastapi.length} new creditors were merged/removed!`);
    // Log which ones were removed
    const survivedNames = new Set(survivedFromFastapi.map(c => (c.sender_name || c.glaeubiger_name || '').toLowerCase()));
    const removedCreditors = newCreditors.filter(c => {
      const name = (c.sender_name || c.glaeubiger_name || '').toLowerCase();
      return !survivedNames.has(name);
    });
    console.log(`  - Removed/merged new creditors: ${removedCreditors.map(c => c.sender_name || c.glaeubiger_name || 'N/A').join(', ')}`);
  }

  return result;
}

module.exports = {
  deduplicateCreditors,
  deduplicateCreditorsFromDocuments,
  mergeCreditorLists,
  documentNeedsManualReview,
  getDocumentReviewReasons,
};