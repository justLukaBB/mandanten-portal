/**
 * AI Deduplication Scheduler
 *
 * Schedules delayed AI re-deduplication after document uploads.
 * After every upload, waits 30 minutes, then sends entire creditor list
 * to FastAPI for AI-based deduplication.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Store pending dedup jobs per client
const pendingJobs = new Map();

// Configuration
const DEDUP_DELAY_MS = 30 * 60 * 1000; // 30 minutes
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
 * If a job is already pending, cancel it and schedule a new one.
 * This ensures we wait for all uploads to finish before running dedup.
 */
function scheduleAIRededup(clientId, getClientFunction) {
  // Input validation
  if (!clientId) {
    console.error('[ai-dedup-scheduler] Cannot schedule - clientId is required');
    return;
  }
  if (typeof getClientFunction !== 'function') {
    console.error('[ai-dedup-scheduler] Cannot schedule - getClientFunction must be a function');
    return;
  }

  console.log(`[ai-dedup-scheduler] Scheduling AI re-dedup for client ${clientId} in 30 minutes...`);

  // Cancel existing pending job if any
  if (pendingJobs.has(clientId)) {
    clearTimeout(pendingJobs.get(clientId));
    console.log(`[ai-dedup-scheduler] Cancelled previous pending job for ${clientId}`);
  }

  // Schedule new job
  const timeoutId = setTimeout(async () => {
    await runAIRededup(clientId, getClientFunction);
    pendingJobs.delete(clientId);
  }, DEDUP_DELAY_MS);

  pendingJobs.set(clientId, timeoutId);

  const scheduledTime = new Date(Date.now() + DEDUP_DELAY_MS);
  console.log(`[ai-dedup-scheduler] AI re-dedup scheduled for ${clientId} at ${scheduledTime.toISOString()}`);
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

    const creditorList = client.final_creditor_list || [];

    if (creditorList.length === 0) {
      console.log(`[ai-dedup-scheduler] No creditors to deduplicate for ${clientId}`);
      return;
    }

    const beforeCount = creditorList.length;
    console.log(`[ai-dedup-scheduler] Sending ${beforeCount} creditors to FastAPI for AI deduplication...`);

    // Call FastAPI deduplication endpoint
    const response = await axios.post(
      `${FASTAPI_URL}/api/dedup/deduplicate-all`,
      { creditors: creditorList },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': FASTAPI_API_KEY
        },
        timeout: 300000 // 5 minutes timeout (increased from 2 minutes)
      }
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

    // Ensure all creditors have IDs before saving
    client.final_creditor_list = deduplicated_creditors.map(c => ({
      ...c,
      id: c.id || uuidv4(), // Preserve existing ID or generate new one
      status: c.status || 'confirmed', // Ensure status exists
      ai_confidence: c.ai_confidence || 1.0,
      created_at: c.created_at || new Date()
    }));

    // Add deduplication history entry
    if (!client.deduplication_history) {
      client.deduplication_history = [];
    }

    client.deduplication_history.push({
      timestamp: new Date(),
      method: 'periodic-ai-rededup',
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
    console.error(`[ai-dedup-scheduler] ❌ AI re-dedup failed for ${clientId}:`, error.message);

    // Log error details for debugging
    if (error.response) {
      console.error(`[ai-dedup-scheduler] FastAPI error response:`, {
        status: error.response.status,
        data: error.response.data
      });
    }

    // Return error result
    return {
      success: false,
      error: error.message
    };
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
