/**
 * AI Deduplication Scheduler
 *
 * Schedules delayed AI re-deduplication after document uploads.
 * After every upload, waits 30 minutes, then sends entire creditor list
 * to FastAPI for AI-based deduplication.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { findCreditorByName } = require('../utils/creditorLookup');
const Client = require('../models/Client');

/**
 * Merge review reasons from existing and new creditor data.
 * Preserves all existing reasons and adds any new ones without duplicates.
 */
function mergeReviewReasons(existingReasons, newReasons) {
  const existing = Array.isArray(existingReasons) ? existingReasons : [];
  const incoming = Array.isArray(newReasons) ? newReasons : [];
  const merged = [...existing];
  for (const reason of incoming) {
    if (reason && !merged.includes(reason)) {
      merged.push(reason);
    }
  }
  return merged;
}

/**
 * Retry an async function with delay between attempts.
 * Logs each attempt per FAIL-03 requirement.
 *
 * @param {Function} fn - Async function to retry. Receives (attemptNumber) as argument.
 * @param {Object} options - { maxAttempts: 2, delayMs: 2000 }
 * @returns {Promise<*>} Result of fn on success
 * @throws Last error if all attempts fail
 */
async function retryWithDelay(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 2;
  const delayMs = options.delayMs || 2000;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      console.error(`[ai-dedup-scheduler] Attempt ${attempt}/${maxAttempts} failed:`, {
        error_message: error.message,
        attempt_number: attempt,
        max_attempts: maxAttempts,
        status: error.response?.status || 'no_response',
        will_retry: attempt < maxAttempts
      });

      if (attempt < maxAttempts) {
        console.log(`[ai-dedup-scheduler] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// Store pending dedup jobs per client
const pendingJobs = new Map();

// Configuration
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY;

// Validate configuration on startup
if (process.env.NODE_ENV === 'production' && !process.env.FASTAPI_URL) {
  console.warn('[ai-dedup-scheduler] ⚠️  FASTAPI_URL not set in production - using localhost:8000');
}
if (process.env.NODE_ENV === 'production' && !FASTAPI_API_KEY) {
  console.warn('[ai-dedup-scheduler] ⚠️  FASTAPI_API_KEY not set in production - API calls may fail');
}

/**
 * Schedule AI re-deduplication for a client
 *
 * Runs dedup IMMEDIATELY instead of scheduling a delay.
 * Cancels any pending delayed job (legacy cleanup).
 */
async function scheduleAIRededup(clientId, getClientFunction) {
  if (!clientId) {
    console.error('[ai-dedup-scheduler] Cannot schedule - clientId is required');
    return;
  }
  if (typeof getClientFunction !== 'function') {
    console.error('[ai-dedup-scheduler] Cannot schedule - getClientFunction must be a function');
    return;
  }

  console.log(`[ai-dedup-scheduler] Running immediate dedup for client ${clientId}...`);

  // Cancel any pending delayed job (legacy cleanup)
  if (pendingJobs.has(clientId)) {
    clearTimeout(pendingJobs.get(clientId));
    pendingJobs.delete(clientId);
    console.log(`[ai-dedup-scheduler] Cancelled pending delayed job for ${clientId}`);
  }

  // Run dedup IMMEDIATELY (no 30-minute delay)
  return runAIRededup(clientId, getClientFunction);
}

/**
 * Execute AI re-deduplication for a client
 *
 * @returns {Promise<Object|null>} Result object with before/after counts, or null on error
 */
async function runAIRededup(clientId, getClientFunction) {
  const startTime = Date.now();

  try {
    console.log(`[ai-dedup-scheduler] Starting AI re-dedup for client ${clientId}...`);

    // Get latest client data
    const client = await getClientFunction(clientId);

    if (!client) {
      console.error(`[ai-dedup-scheduler] Client ${clientId} not found, skipping AI re-dedup`);
      return;
    }

    // Atomic guard: prevent double-execution via MongoDB atomic update
    const guardResult = await Client.updateOne(
      { _id: client._id, dedup_in_progress: { $ne: true } },
      { $set: { dedup_in_progress: true, dedup_started_at: new Date() } }
    );

    if (guardResult.modifiedCount === 0) {
      console.log(`[ai-dedup-scheduler] Dedup already in progress for ${clientId}, skipping`);
      return { success: false, reason: 'dedup_already_in_progress' };
    }

    const creditorList = client.final_creditor_list || [];

    if (creditorList.length === 0) {
      console.log(`[ai-dedup-scheduler] No creditors to deduplicate for ${clientId}`);
      return;
    }

    const beforeCount = creditorList.length;
    console.log(`[ai-dedup-scheduler] Sending ${beforeCount} creditors to FastAPI for AI deduplication...`);

    // Call FastAPI deduplication endpoint with retry wrapper
    const response = await retryWithDelay(
      async (attempt) => {
        console.log(`[ai-dedup-scheduler] Dedup attempt ${attempt} for ${clientId} (${creditorList.length} creditors)...`);
        return await axios.post(
          `${FASTAPI_URL}/api/dedup/deduplicate-all`,
          { creditors: creditorList },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': FASTAPI_API_KEY
            },
            timeout: 60000 // 60 seconds timeout
          }
        );
      },
      { maxAttempts: 2, delayMs: 2000 }
    );

    const { deduplicated_creditors, stats } = response.data;

    // Validate response data
    if (!Array.isArray(deduplicated_creditors)) {
      throw new Error('Invalid response from FastAPI: deduplicated_creditors is not an array');
    }
    if (!stats || typeof stats.unique_count !== 'number') {
      throw new Error('Invalid response from FastAPI: missing or invalid stats');
    }

    console.log(`[ai-dedup-scheduler] AI deduplication complete for ${clientId}:`, {
      original_count: stats.original_count,
      unique_count: stats.unique_count,
      duplicates_removed: stats.duplicates_removed,
      processing_time_ms: Date.now() - startTime
    });

    // Helper function to check if value is missing
    const isMissing = (val) => {
      if (val === undefined || val === null) return true;
      if (typeof val === 'string') {
        const t = val.trim();
        if (!t) return true;
        const lower = t.toLowerCase();
        if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
      }
      return false;
    };

    // Enrich missing addresses/emails from local DB
    try {
      console.log(`[ai-dedup-scheduler] 🔍 Enriching ${deduplicated_creditors.length} creditors from local DB...`);
      const credCache = new Map();

      const ensureMatch = async (name) => {
        if (!name) return null;
        const key = name.toLowerCase().trim();
        if (credCache.has(key)) return credCache.get(key);
        const m = await findCreditorByName(name);
        credCache.set(key, m || null);
        return m;
      };

      // Enrich each creditor
      for (const creditor of deduplicated_creditors) {
        // Creditor - support BOTH German (glaeubiger_name) AND English (sender_name) field names
        const creditorName = creditor.glaeubiger_name || creditor.sender_name;
        if (creditorName) {
          // Check if address is missing in either field format
          const needAddrGerman = isMissing(creditor.glaeubiger_adresse);
          const needAddrEnglish = isMissing(creditor.sender_address);
          const needAddr = needAddrGerman && needAddrEnglish;

          // Check if email is missing in either field format
          const needEmailGerman = isMissing(creditor.email_glaeubiger);
          const needEmailEnglish = isMissing(creditor.sender_email);
          const needEmail = needEmailGerman && needEmailEnglish;

          if (needAddr || needEmail) {
            const match = await ensureMatch(creditorName);
            if (match) {
              if (needAddr && match.address) {
                // Set BOTH field formats for compatibility
                creditor.glaeubiger_adresse = match.address;
                creditor.sender_address = match.address;
              }
              if (needEmail && match.email) {
                // Set BOTH field formats for compatibility
                creditor.email_glaeubiger = match.email;
                creditor.sender_email = match.email;
              }
            }
          }
        }

        // Representative - support BOTH German (glaeubigervertreter_name) AND English (actual_creditor for representatives)
        const repName = creditor.glaeubigervertreter_name || (creditor.is_representative ? creditor.actual_creditor : null);
        if (repName) {
          const needAddrGerman = isMissing(creditor.glaeubigervertreter_adresse);
          const needEmailGerman = isMissing(creditor.email_glaeubiger_vertreter);
          if (needAddrGerman || needEmailGerman) {
            const match = await ensureMatch(repName);
            if (match) {
              if (needAddrGerman && match.address) creditor.glaeubigervertreter_adresse = match.address;
              if (needEmailGerman && match.email) creditor.email_glaeubiger_vertreter = match.email;
            }
          }
        }
      }

      console.log(`[ai-dedup-scheduler] ✅ Enrichment complete. Cache hits: ${credCache.size}`);
    } catch (enrichError) {
      console.error('[ai-dedup-scheduler] ⚠️ Enrichment failed, continuing without enrichment:', enrichError);
      // Continue processing even if enrichment fails
    }

    // ✅ NEW RULE: Check if email/address still missing AFTER DB enrichment

    for (const creditor of deduplicated_creditors) {
      // Prüfe beide Feldnamen-Formate (deutsch und englisch)
      const hasEmail = !isMissing(creditor.email_glaeubiger) || !isMissing(creditor.sender_email);
      const hasAddress = !isMissing(creditor.glaeubiger_adresse) || !isMissing(creditor.sender_address);
      
      if (!hasEmail || !hasAddress) {
        creditor.needs_manual_review = true;
        if (!creditor.review_reasons) {
          creditor.review_reasons = [];
        }
        if (!hasEmail && !creditor.review_reasons.includes('Fehlende Gläubiger-E-Mail')) {
          creditor.review_reasons.push('Fehlende Gläubiger-E-Mail');
        }
        if (!hasAddress && !creditor.review_reasons.includes('Fehlende Gläubiger-Adresse')) {
          creditor.review_reasons.push('Fehlende Gläubiger-Adresse');
        }
        
        console.log(`[ai-dedup-scheduler] Manual review triggered for creditor: ${creditor.sender_name || creditor.glaeubiger_name}`, {
          missing_email: !hasEmail,
          missing_address: !hasAddress
        });
      }
    }

    // Build lookup map of existing creditors for O(1) field preservation
    const existingMap = new Map();
    for (const existing of (client.final_creditor_list || [])) {
      if (existing.id) {
        existingMap.set(existing.id, existing);
      }
      // Also index by normalized name for creditors whose IDs changed during dedup
      const name = (existing.sender_name || existing.glaeubiger_name || '').toLowerCase().trim();
      if (name && !existingMap.has(`name:${name}`)) {
        existingMap.set(`name:${name}`, existing);
      }
    }

    client.final_creditor_list = deduplicated_creditors.map(c => {
      // Find existing creditor by ID first, then by name
      const existingById = existingMap.get(c.id);
      const name = (c.sender_name || c.glaeubiger_name || '').toLowerCase().trim();
      const existingByName = name ? existingMap.get(`name:${name}`) : null;
      const existing = existingById || existingByName;

      return {
        ...c,
        id: c.id || uuidv4(),
        status: c.status || 'confirmed',
        ai_confidence: c.ai_confidence || 1.0,
        created_at: existing?.created_at || c.created_at || new Date(),

        // PRESERVE document links from existing creditor (FastAPI response may return empty arrays)
        source_documents: (c.source_documents?.length ? c.source_documents : null) || existing?.source_documents || [],
        source_document_id: c.source_document_id || existing?.source_document_id,
        primary_document_id: c.primary_document_id || existing?.primary_document_id,
        document_id: c.document_id || existing?.document_id,
        document_links: (c.document_links?.length ? c.document_links : null) || existing?.document_links || [],

        // PRESERVE manual review state from existing creditor
        // Use existing values if they indicate review is needed, otherwise use dedup values
        needs_manual_review: existing?.needs_manual_review || c.needs_manual_review || false,
        review_reasons: mergeReviewReasons(existing?.review_reasons, c.review_reasons),
        manually_reviewed: existing?.manually_reviewed || false,
        reviewed_at: existing?.reviewed_at,
        reviewed_by: existing?.reviewed_by,
        review_action: existing?.review_action,
        original_ai_data: existing?.original_ai_data,
        correction_notes: existing?.correction_notes,
      };
    });

    // Add deduplication history entry
    if (!client.deduplication_history) {
      client.deduplication_history = [];
    }

    client.deduplication_history.push({
      timestamp: new Date(),
      method: 'immediate-ai-rededup',
      before_count: beforeCount,
      after_count: deduplicated_creditors.length,
      duplicates_removed: stats.duplicates_removed,
      processing_time_ms: Date.now() - startTime
    });

    await client.save();

    console.log(`[ai-dedup-scheduler] ✅ AI re-dedup completed for ${clientId}: ${beforeCount} → ${deduplicated_creditors.length} creditors`);

    // Return result for manual triggers
    return {
      success: true,
      before_count: beforeCount,
      after_count: deduplicated_creditors.length,
      duplicates_removed: stats.duplicates_removed,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    // FAIL-03: Log failure with creditor count, error, and attempt number
    console.error(`[ai-dedup-scheduler] AI re-dedup failed for ${clientId} after all retry attempts:`, {
      creditor_count: creditorList.length,
      error_message: error.message,
      attempts_exhausted: 2,
      status: error.response?.status || 'no_response',
      timestamp: new Date().toISOString()
    });

    if (error.response) {
      console.error(`[ai-dedup-scheduler] FastAPI error response:`, {
        status: error.response.status,
        data: error.response.data
      });
    }

    // FAIL-02: Flag case for manual review — no silent duplicate pass-through
    // Creditors pass through UNMERGED (final_creditor_list unchanged)
    // Use atomic update to avoid race conditions with other operations
    const failureReason = `AI deduplication failed after 2 attempts: ${error.message}`;
    if (client && client._id) {
      try {
        await Client.updateOne(
          { _id: client._id },
          {
            $set: {
              dedup_failure_reason: failureReason
            }
          }
        );
        console.log(`[ai-dedup-scheduler] Flagged ${clientId} for manual review: ${failureReason}`);
      } catch (flagError) {
        console.error(`[ai-dedup-scheduler] Failed to flag ${clientId} for manual review:`, flagError.message);
      }
    }

    // Return error result — pipeline continues with unmerged creditors
    return {
      success: false,
      error: error.message,
      manual_review_flagged: true,
      failure_reason: failureReason
    };
  } finally {
    // ALWAYS clear dedup_in_progress flag
    try {
      await Client.updateOne(
        { _id: client._id },
        { $set: { dedup_in_progress: false, dedup_completed_at: new Date() } }
      );
    } catch (clearError) {
      console.error(`[ai-dedup-scheduler] Failed to clear dedup_in_progress for ${clientId}:`, clearError.message);
    }
  }
}

/**
 * Cancel pending AI re-dedup job for a client
 */
function cancelAIRededup(clientId) {
  if (pendingJobs.has(clientId)) {
    clearTimeout(pendingJobs.get(clientId));
    pendingJobs.delete(clientId);
    console.log(`[ai-dedup-scheduler] Cancelled AI re-dedup job for ${clientId}`);
    return true;
  }
  return false;
}

/**
 * Get status of pending AI re-dedup jobs
 */
function getSchedulerStatus() {
  const pending = Array.from(pendingJobs.keys());
  return {
    pending_jobs: pending.length,
    client_ids: pending
  };
}

module.exports = {
  scheduleAIRededup,
  cancelAIRededup,
  getSchedulerStatus,
  runAIRededup
};
