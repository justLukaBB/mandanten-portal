const { v4: uuidv4 } = require('uuid');

/**
 * Deduplicate creditors based on business rules
 * @param {Array} creditors
 * @param {string} strategy - 'latest' or 'highest_amount'
 */
function deduplicateCreditors(creditors, strategy = 'highest_amount') {
  if (!Array.isArray(creditors) || creditors.length === 0) return [];

  const groupedByRef = creditors.reduce((groups, creditor) => {
    const refNumber = creditor.reference_number || 'no_ref';
    (groups[refNumber] = groups[refNumber] || []).push(creditor);
    return groups;
  }, {});

  const deduplicatedCreditors = [];

  Object.entries(groupedByRef).forEach(([refNumber, creditorsInGroup]) => {
    if (creditorsInGroup.length === 1) {
      deduplicatedCreditors.push(creditorsInGroup[0]);
      return;
    }

    const groupedByName = creditorsInGroup.reduce((groups, creditor) => {
      const senderName = creditor.sender_name || 'no_name';
      (groups[senderName] = groups[senderName] || []).push(creditor);
      return groups;
    }, {});

    Object.entries(groupedByName).forEach(([senderName, creditorsWithSameName]) => {
      if (creditorsWithSameName.length === 1) {
        deduplicatedCreditors.push(creditorsWithSameName[0]);
        return;
      }

      let selectedCreditor;
      if (strategy === 'highest_amount') {
        selectedCreditor = creditorsWithSameName.reduce((highest, current) => {
          const currentAmount = parseFloat(current.claim_amount) || 0;
          const highestAmount = parseFloat(highest.claim_amount) || 0;
          return currentAmount > highestAmount ? current : highest;
        });
      } else if (strategy === 'latest') {
        selectedCreditor = creditorsWithSameName.reduce((latest, current) => {
          const currentDate = new Date(current.created_at || current.confirmed_at || 0);
          const latestDate = new Date(latest.created_at || latest.confirmed_at || 0);
          return currentDate > latestDate ? current : latest;
        });
      } else {
        selectedCreditor = creditorsWithSameName[0];
      }

      selectedCreditor.deduplication_info = {
        original_count: creditorsWithSameName.length,
        strategy_used: strategy,
        deduplicated_at: new Date().toISOString(),
        duplicate_ids: creditorsWithSameName.map((c) => c.id).filter((id) => id !== selectedCreditor.id),
      };

      deduplicatedCreditors.push(selectedCreditor);
    });
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