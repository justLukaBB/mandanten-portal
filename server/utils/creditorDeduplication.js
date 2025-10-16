/**
 * Creditor Deduplication Utility
 * 
 * Handles duplicate creditor logic based on business rules:
 * 1. Same reference_number + Same sender_name: Keep latest or highest amount
 * 2. Same reference_number + Different sender_name: Keep both (different creditors)
 * 3. Different reference_number: Keep all (different cases)
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Deduplicate creditors based on business rules
 * @param {Array} creditors - Array of creditor objects
 * @param {string} strategy - 'latest' or 'highest_amount' for same ref+name duplicates
 * @returns {Array} Deduplicated array of creditors
 */
function deduplicateCreditors(creditors, strategy = 'highest_amount') {
  if (!Array.isArray(creditors) || creditors.length === 0) {
    console.log(`📋 No creditors to deduplicate (empty array)`);
    return [];
  }

  console.log(`\n🔄 ================================`);
  console.log(`🔄 CREDITOR DEDUPLICATION STARTED`);
  console.log(`🔄 ================================`);
  console.log(`📊 Input: ${creditors.length} creditors`);
  console.log(`🎯 Strategy: ${strategy}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  // Log all input creditors for monitoring
  console.log(`\n📋 INPUT CREDITORS:`);
  creditors.forEach((creditor, index) => {
    console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0} [${creditor.id}]`);
  });

  // Group creditors by reference_number
  const groupedByRef = creditors.reduce((groups, creditor) => {
    const refNumber = creditor.reference_number || 'no_ref';
    if (!groups[refNumber]) {
      groups[refNumber] = [];
    }
    groups[refNumber].push(creditor);
    return groups;
  }, {});

  const deduplicatedCreditors = [];

  // Process each reference number group
  Object.entries(groupedByRef).forEach(([refNumber, creditorsInGroup]) => {
    console.log(`📋 Processing reference number: ${refNumber} (${creditorsInGroup.length} creditors)`);

    if (creditorsInGroup.length === 1) {
      // No duplicates for this reference number
      deduplicatedCreditors.push(creditorsInGroup[0]);
      console.log(`✅ Single creditor for ref ${refNumber}: ${creditorsInGroup[0].sender_name}`);
      return;
    }

    // Group by sender_name within this reference number
    const groupedByName = creditorsInGroup.reduce((groups, creditor) => {
      const senderName = creditor.sender_name || 'no_name';
      if (!groups[senderName]) {
        groups[senderName] = [];
      }
      groups[senderName].push(creditor);
      return groups;
    }, {});

    // Process each sender name group
    Object.entries(groupedByName).forEach(([senderName, creditorsWithSameName]) => {
      console.log(`👤 Processing sender: ${senderName} (${creditorsWithSameName.length} entries)`);

      if (creditorsWithSameName.length === 1) {
        // No duplicates for this sender name
        deduplicatedCreditors.push(creditorsWithSameName[0]);
        console.log(`✅ Single entry for ${senderName}: keeping`);
        return;
      }

      // Multiple entries with same reference_number + sender_name
      console.log(`🔄 Found ${creditorsWithSameName.length} duplicates for ${senderName} (ref: ${refNumber})`);
      
      let selectedCreditor;
      
      if (strategy === 'highest_amount') {
        // Keep the one with highest claim_amount
        selectedCreditor = creditorsWithSameName.reduce((highest, current) => {
          const currentAmount = parseFloat(current.claim_amount) || 0;
          const highestAmount = parseFloat(highest.claim_amount) || 0;
          return currentAmount > highestAmount ? current : highest;
        });
        console.log(`💰 Selected highest amount: €${selectedCreditor.claim_amount} for ${senderName}`);
      } else if (strategy === 'latest') {
        // Keep the latest one based on created_at or confirmed_at
        selectedCreditor = creditorsWithSameName.reduce((latest, current) => {
          const currentDate = new Date(current.created_at || current.confirmed_at || 0);
          const latestDate = new Date(latest.created_at || latest.confirmed_at || 0);
          return currentDate > latestDate ? current : latest;
        });
        console.log(`📅 Selected latest: ${selectedCreditor.created_at || selectedCreditor.confirmed_at} for ${senderName}`);
      } else {
        // Default to first one if strategy is unknown
        selectedCreditor = creditorsWithSameName[0];
        console.log(`⚠️ Unknown strategy, keeping first entry for ${senderName}`);
      }

      // Add metadata about deduplication
      selectedCreditor.deduplication_info = {
        original_count: creditorsWithSameName.length,
        strategy_used: strategy,
        deduplicated_at: new Date().toISOString(),
        duplicate_ids: creditorsWithSameName.map(c => c.id).filter(id => id !== selectedCreditor.id)
      };

      deduplicatedCreditors.push(selectedCreditor);
      console.log(`✅ Kept creditor: ${selectedCreditor.sender_name} (ref: ${refNumber})`);
    });
  });

  console.log(`\n✅ ================================`);
  console.log(`✅ CREDITOR DEDUPLICATION COMPLETE`);
  console.log(`✅ ================================`);
  console.log(`📊 Result: ${creditors.length} → ${deduplicatedCreditors.length} creditors`);
  console.log(`🗑️ Removed: ${creditors.length - deduplicatedCreditors.length} duplicates`);
  console.log(`⏰ Completed: ${new Date().toISOString()}`);
  
  // Log all output creditors for monitoring
  console.log(`\n📋 FINAL CREDITORS:`);
  deduplicatedCreditors.forEach((creditor, index) => {
    console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0} [${creditor.id}]`);
    if (creditor.deduplication_info) {
      console.log(`      📝 Deduplication: ${creditor.deduplication_info.original_count} → 1, removed IDs: [${creditor.deduplication_info.duplicate_ids.join(', ')}]`);
    }
  });
  console.log(`\n`);
  
  return deduplicatedCreditors;
}

/**
 * Deduplicate creditors from document extraction data
 * @param {Array} documents - Array of documents with extracted creditor data
 * @param {string} strategy - Deduplication strategy
 * @returns {Array} Array of deduplicated creditor objects
 */
function deduplicateCreditorsFromDocuments(documents, strategy = 'highest_amount') {
  if (!Array.isArray(documents) || documents.length === 0) {
    return [];
  }

  // Extract creditors from documents
  const extractedCreditors = [];
  
  documents.forEach(doc => {
    if (doc.is_creditor_document && doc.extracted_data?.creditor_data) {
      const creditorData = doc.extracted_data.creditor_data;
      
      // Create creditor object
      const creditor = {
        id: doc.id || uuidv4(), // Use document ID as creditor ID
        sender_name: creditorData.sender_name,
        sender_address: creditorData.sender_address,
        sender_email: creditorData.sender_email,
        reference_number: creditorData.reference_number,
        claim_amount: creditorData.claim_amount || 0,
        is_representative: creditorData.is_representative || false,
        actual_creditor: creditorData.actual_creditor,
        source_document: doc.name,
        source_document_id: doc.id,
        ai_confidence: doc.confidence || doc.extracted_data?.confidence || 0,
        status: 'confirmed',
        created_at: doc.uploadedAt || new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        extraction_method: 'document_upload'
      };
      
      extractedCreditors.push(creditor);
    }
  });

  console.log(`\n📄 ================================`);
  console.log(`📄 DOCUMENT EXTRACTION COMPLETE`);
  console.log(`📄 ================================`);
  console.log(`📊 Extracted ${extractedCreditors.length} creditors from ${documents.length} documents`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  // Log extracted creditors before deduplication
  console.log(`\n📋 EXTRACTED CREDITORS (before deduplication):`);
  extractedCreditors.forEach((creditor, index) => {
    console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0} from ${creditor.source_document}`);
  });
  
  return deduplicateCreditors(extractedCreditors, strategy);
}

/**
 * Merge new creditors with existing final_creditor_list
 * @param {Array} existingCreditors - Current final_creditor_list
 * @param {Array} newCreditors - New creditors to merge
 * @param {string} strategy - Deduplication strategy
 * @returns {Array} Merged and deduplicated creditor list
 */
function mergeCreditorLists(existingCreditors = [], newCreditors = [], strategy = 'highest_amount') {
  console.log(`\n🔄 ================================`);
  console.log(`🔄 CREDITOR LIST MERGE STARTED`);
  console.log(`🔄 ================================`);
  console.log(`📊 Existing creditors: ${existingCreditors.length}`);
  console.log(`📊 New creditors: ${newCreditors.length}`);
  console.log(`🎯 Strategy: ${strategy}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  // Log existing creditors
  if (existingCreditors.length > 0) {
    console.log(`\n📋 EXISTING CREDITORS:`);
    existingCreditors.forEach((creditor, index) => {
      console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0} [${creditor.id}]`);
    });
  }
  
  // Log new creditors
  if (newCreditors.length > 0) {
    console.log(`\n📋 NEW CREDITORS:`);
    newCreditors.forEach((creditor, index) => {
      console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0} [${creditor.id}]`);
    });
  }
  
  // Combine all creditors
  const allCreditors = [...existingCreditors, ...newCreditors];
  console.log(`\n📊 Total combined: ${allCreditors.length} creditors`);
  
  // Deduplicate the combined list
  const mergedCreditors = deduplicateCreditors(allCreditors, strategy);
  
  console.log(`\n✅ ================================`);
  console.log(`✅ CREDITOR LIST MERGE COMPLETE`);
  console.log(`✅ ================================`);
  console.log(`📊 Final result: ${allCreditors.length} → ${mergedCreditors.length} creditors`);
  console.log(`🗑️ Removed duplicates: ${allCreditors.length - mergedCreditors.length}`);
  console.log(`⏰ Completed: ${new Date().toISOString()}`);
  console.log(`\n`);
  
  return mergedCreditors;
}

module.exports = {
  deduplicateCreditors,
  deduplicateCreditorsFromDocuments,
  mergeCreditorLists
};
