/**
 * FastAPI Client
 *
 * Handles communication with the FastAPI document processing server.
 * Uses native fetch API (Node.js 18+).
 *
 * Features:
 * - Retry logic with exponential backoff for connection errors
 * - Health check integration with caching
 * - Improved error handling and classification
 * - Keep-alive connections
 */
// No axios import needed - using native fetch

// Configuration
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_TIMEOUT = parseInt(process.env.FASTAPI_TIMEOUT) || 1200000; // 20 minutes
const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY || ''; // API key for authentication
const { getSignedUrl } = require("../services/gcs-service");

// Retry configuration
const FASTAPI_RETRY_ATTEMPTS = parseInt(process.env.FASTAPI_RETRY_ATTEMPTS) || 3;
const FASTAPI_RETRY_DELAY_MS = parseInt(process.env.FASTAPI_RETRY_DELAY_MS) || 1000;
const FASTAPI_CONNECTION_TIMEOUT = parseInt(process.env.FASTAPI_CONNECTION_TIMEOUT) || 10000;
const FASTAPI_ENABLE_HEALTH_CHECK = process.env.FASTAPI_ENABLE_HEALTH_CHECK === 'true';
const FASTAPI_HEALTH_CHECK_CACHE_MS = parseInt(process.env.FASTAPI_HEALTH_CHECK_CACHE_MS) || 30000;

// Health check cache
let healthCheckCache = {
  healthy: null,
  lastCheck: 0
};

// Production warning
if (process.env.NODE_ENV === 'production' && FASTAPI_URL.includes('localhost')) {
  console.warn('⚠️  WARNING: FASTAPI_URL not set in production environment - using localhost:8000');
  console.warn('⚠️  Please set FASTAPI_URL environment variable to your production FastAPI service URL');
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (connection-level errors)
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is retryable
 */
function isRetryableError(error) {
  const retryableMessages = [
    'fetch failed',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'socket hang up',
    'network',
    'Connection timeout'
  ];

  const errorMessage = error.message || String(error);
  return retryableMessages.some(msg =>
    errorMessage.toLowerCase().includes(msg.toLowerCase())
  );
}

/**
 * Classify error type for better logging
 * @param {Error} error - The error to classify
 * @returns {string} - Error type classification
 */
function classifyError(error) {
  const message = error.message || String(error);

  if (message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
  if (message.includes('ETIMEDOUT')) return 'CONNECTION_TIMEOUT';
  if (message.includes('ENOTFOUND')) return 'DNS_ERROR';
  if (message.includes('ECONNRESET')) return 'CONNECTION_RESET';
  if (message.includes('fetch failed')) return 'FETCH_FAILED';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('abort')) return 'ABORTED';
  if (message.match(/returned \d+/)) return 'HTTP_ERROR';

  return 'UNKNOWN_ERROR';
}

/**
 * Check if health check should be performed
 * @returns {boolean}
 */
function shouldCheckHealth() {
  if (!FASTAPI_ENABLE_HEALTH_CHECK) return false;

  const now = Date.now();
  const cacheExpired = (now - healthCheckCache.lastCheck) > FASTAPI_HEALTH_CHECK_CACHE_MS;

  return cacheExpired || healthCheckCache.healthy === null;
}

/**
 * Check if FastAPI is healthy (with caching)
 * @returns {Promise<boolean>}
 */
async function isFastApiHealthy() {
  if (!shouldCheckHealth() && healthCheckCache.healthy !== null) {
    return healthCheckCache.healthy;
  }

  const healthy = await checkHealth();
  healthCheckCache = {
    healthy,
    lastCheck: Date.now()
  };

  return healthy;
}

/**
 * Helper function to create a fetch request with timeout
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(url, options = {}, timeout = FASTAPI_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Add keep-alive header for connection reuse
    const headers = {
      ...options.headers,
      'Connection': 'keep-alive'
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic and exponential backoff
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} retryAttempt - Current retry attempt (internal use)
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url, options = {}, timeout = FASTAPI_TIMEOUT, retryAttempt = 0) {
  const maxRetries = FASTAPI_RETRY_ATTEMPTS;
  const baseDelay = FASTAPI_RETRY_DELAY_MS;
  const maxDelay = 30000; // Cap at 30 seconds

  try {
    // Optional health check before making request
    if (FASTAPI_ENABLE_HEALTH_CHECK && retryAttempt === 0) {
      const healthy = await isFastApiHealthy();
      if (!healthy) {
        console.warn('⚠️  FastAPI server health check failed - attempting request anyway');
      }
    }

    // Attempt fetch with timeout
    const response = await fetchWithTimeout(url, options, timeout);
    return response;

  } catch (error) {
    const errorType = classifyError(error);

    // Check if error is retryable and we haven't exceeded max retries
    if (isRetryableError(error) && retryAttempt < maxRetries) {
      const delay = Math.min(baseDelay * Math.pow(2, retryAttempt), maxDelay);

      console.log(`\n🔄 ================================`);
      console.log(`🔄 RETRY ATTEMPT ${retryAttempt + 1}/${maxRetries}`);
      console.log(`🔄 ================================`);
      console.log(`💥 Error Type: ${errorType}`);
      console.log(`💥 Error Message: ${error.message}`);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      console.log(`🔗 URL: ${url}`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

      await sleep(delay);

      console.log(`🔄 Retrying request now...`);
      return fetchWithRetry(url, options, timeout, retryAttempt + 1);
    }

    // Not retryable or max retries exceeded
    if (retryAttempt >= maxRetries) {
      console.log(`\n❌ ================================`);
      console.log(`❌ MAX RETRIES EXCEEDED (${maxRetries})`);
      console.log(`❌ ================================`);
      console.log(`💥 Error Type: ${errorType}`);
      console.log(`💥 Final Error: ${error.message}`);
      console.log(`🔗 URL: ${url}`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    }

    throw error;
  }
}

/**
 * Create a processing job in FastAPI
 * 
 * @param {Object} params - Job parameters
 * @param {string} params.clientId - Client ID from MongoDB
 * @param {Array} params.files - Array of file objects with gcs_path, filename, etc.
 * @param {string} params.webhookUrl - URL for FastAPI to send results
 * @param {string} [params.apiKey] - Optional Gemini API key
 * @returns {Promise<Object>} - Job creation response with job_id
 */
async function createProcessingJob({ clientId, clientName, files, webhookUrl, apiKey = null }) {
  console.log(`\n🚀 ================================`);
  console.log(`🚀 CALLING FASTAPI PROCESSING`);
  console.log(`🚀 ================================`);
  console.log(`🔗 FastAPI URL: ${FASTAPI_URL}`);
  console.log(`👤 Client ID: ${clientId}`);
  console.log(`👤 Client Name: ${clientName || 'N/A'}`);
  console.log(`📄 Files: ${files.length}`);
  console.log(`🔔 Webhook URL: ${webhookUrl}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

  // Log files being sent
  console.log(`\n📋 FILES TO PROCESS:`);
  files.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.filename} (${file.document_id || 'NO_DOC_ID'})`);
    console.log(`      GCS: ${file.gcs_path}`);
    console.log(`      Type: ${file.mime_type}`);
  });

  try {

    const requestBody = {
      client_id: clientId,
      client_name: clientName || null,
      files: await Promise.all(files.map(async (f) => {
        let gcsPath = f.gcs_path;
        // Only attempt to get signed URL if no local path is provided and no gcs path exists
        if (!f.local_path && !gcsPath) {
          try {
            gcsPath = await getSignedUrl(f.filename);
          } catch (e) {
            console.warn("⚠️ Failed to get signed URL for", f.filename, e.message);
          }
        }

        return {
          filename: f.filename,            // blob name
          gcs_path: gcsPath,               // signed URL
          local_path: f.local_path,        // local path for testing/local-dev
          mime_type: f.mime_type || 'image/png',
          size: f.size || 0,
          document_id: f.document_id || f.id,
        };
      })),
      webhook_url: webhookUrl,
    };

    // Add API key if provided
    if (apiKey) {
      requestBody.api_key = apiKey;
    }

    console.log(`\n📤 Sending request to FastAPI...`);

    // Prepare headers with API key authentication
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    // Add API key if configured
    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    } else {
      console.warn(`⚠️  WARNING: FASTAPI_API_KEY not set - request may be rejected`);
    }



    console.log("=====================requestBody========================", requestBody)

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs`,
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      },
      FASTAPI_TIMEOUT
    );

    // Try to parse as JSON, but handle HTML error pages
    let data;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Not JSON - likely HTML error page
      const text = await response.text();
      console.error(`❌ FastAPI returned non-JSON response (${response.status}):`);
      console.error(`📄 Content-Type: ${contentType}`);
      console.error(`📄 Response preview: ${text.substring(0, 500)}`);
      throw new Error(`FastAPI returned ${response.status} with HTML instead of JSON. Server may be down or endpoint doesn't exist.`);
    }

    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}: ${data.detail || JSON.stringify(data)}`);
    }

    console.log(`\n✅ ================================`);
    console.log(`✅ FASTAPI JOB CREATED`);
    console.log(`✅ ================================`);
    console.log(`🔑 Job ID: ${data.job_id}`);
    console.log(`📊 Status: ${data.status}`);
    console.log(`💬 Message: ${data.message}`);
    console.log(`⏰ Created at: ${new Date().toISOString()}`);
    console.log(`\n`);

    return {
      success: true,
      jobId: data.job_id,
      status: data.status,
      message: data.message
    };

  } catch (error) {
    const errorType = classifyError(error);

    console.log(`\n❌ ================================`);
    console.log(`❌ FASTAPI REQUEST FAILED`);
    console.log(`❌ ================================`);
    console.log(`💥 Error Type: ${errorType}`);
    console.log(`💥 Error Message: ${error.message}`);

    // Try to extract status code and details from error
    let statusCode = null;
    let details = null;

    if (error.message.includes('returned')) {
      const match = error.message.match(/returned (\d+)/);
      if (match) {
        statusCode = parseInt(match[1]);
      }
    }

    console.log(`📊 Status Code: ${statusCode || 'N/A'}`);
    console.log(`🔄 Retryable: ${isRetryableError(error)}`);
    if (details) {
      console.log(`📝 Response: ${JSON.stringify(details)}`);
    }

    console.log(`⏰ Failed at: ${new Date().toISOString()}`);
    console.log(`\n`);

    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: statusCode,
      details: details,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Get job status from FastAPI (fallback/debug)
 *
 * @param {string} jobId - Job ID to check
 * @returns {Promise<Object>} - Job status
 */
async function getJobStatus(jobId) {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs/${jobId}/status`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_TIMEOUT
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`FastAPI returned ${response.status}: ${errorData.detail || 'Unknown error'}`);
    }

    const data = await response.json();

    return {
      success: true,
      ...data
    };

  } catch (error) {
    const errorType = classifyError(error);
    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Get job results from FastAPI (fallback/debug)
 *
 * @param {string} jobId - Job ID to get results for
 * @returns {Promise<Object>} - Full job results
 */
async function getJobResults(jobId) {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };

    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    const response = await fetchWithRetry(
      `${FASTAPI_URL}/processing/jobs/${jobId}/results`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_TIMEOUT
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`FastAPI returned ${response.status}: ${errorData.detail || 'Unknown error'}`);
    }

    const data = await response.json();

    return {
      success: true,
      ...data
    };

  } catch (error) {
    const errorType = classifyError(error);
    return {
      success: false,
      error: error.message,
      errorType: errorType,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null,
      retryable: isRetryableError(error)
    };
  }
}

/**
 * Health check for FastAPI server
 *
 * @returns {Promise<boolean>} - True if FastAPI is healthy
 */
async function checkHealth() {
  try {
    const headers = {
      'User-Agent': 'NodeJS-DocumentProcessor/1.0',
      'Connection': 'keep-alive'
    };

    // Health check may not require API key, but include it if available
    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }

    // Use shorter timeout for health check (no retry)
    const response = await fetchWithTimeout(
      `${FASTAPI_URL}/health`,
      {
        method: 'GET',
        headers: headers
      },
      FASTAPI_CONNECTION_TIMEOUT // Use connection timeout for health check
    );

    if (!response.ok) {
      console.warn(`⚠️  FastAPI health check returned status ${response.status}`);
      return false;
    }

    const data = await response.json();
    const isHealthy = data.status === 'healthy';

    if (isHealthy) {
      console.log(`✅ FastAPI health check passed`);
    } else {
      console.warn(`⚠️  FastAPI health check failed: status = ${data.status}`);
    }

    return isHealthy;

  } catch (error) {
    const errorType = classifyError(error);
    console.error(`❌ FastAPI health check failed: ${errorType} - ${error.message}`);
    return false;
  }
}

/**
 * Reset health check cache (useful for testing or manual refresh)
 */
function resetHealthCheckCache() {
  healthCheckCache = {
    healthy: null,
    lastCheck: 0
  };
  console.log('🔄 Health check cache reset');
}

/**
 * Get current retry configuration (for debugging/monitoring)
 * @returns {Object} - Current retry configuration
 */
function getRetryConfig() {
  return {
    maxRetries: FASTAPI_RETRY_ATTEMPTS,
    baseDelayMs: FASTAPI_RETRY_DELAY_MS,
    connectionTimeoutMs: FASTAPI_CONNECTION_TIMEOUT,
    healthCheckEnabled: FASTAPI_ENABLE_HEALTH_CHECK,
    healthCheckCacheMs: FASTAPI_HEALTH_CHECK_CACHE_MS,
    requestTimeoutMs: FASTAPI_TIMEOUT
  };
}

module.exports = {
  createProcessingJob,
  getJobStatus,
  getJobResults,
  checkHealth,
  resetHealthCheckCache,
  getRetryConfig,
  FASTAPI_URL
};
