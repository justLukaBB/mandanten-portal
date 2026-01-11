/**
 * FastAPI Client
 * 
 * Handles communication with the FastAPI document processing server.
 * Uses native fetch API (Node.js 18+).
 */
// No axios import needed - using native fetch

// Configuration
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_TIMEOUT = parseInt(process.env.FASTAPI_TIMEOUT) || 1200000; // 30 seconds
const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY || ''; // API key for authentication
const { getSignedUrl } = require("../services/gcs-service");

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
    const response = await fetch(url, {
      ...options,
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
 * Create a processing job in FastAPI
 * 
 * @param {Object} params - Job parameters
 * @param {string} params.clientId - Client ID from MongoDB
 * @param {Array} params.files - Array of file objects with gcs_path, filename, etc.
 * @param {string} params.webhookUrl - URL for FastAPI to send results
 * @param {string} [params.apiKey] - Optional Gemini API key
 * @returns {Promise<Object>} - Job creation response with job_id
 */
async function createProcessingJob({ clientId, files, webhookUrl, apiKey = null }) {
  console.log(`\n🚀 ================================`);
  console.log(`🚀 CALLING FASTAPI PROCESSING`);
  console.log(`🚀 ================================`);
  console.log(`🔗 FastAPI URL: ${FASTAPI_URL}`);
  console.log(`👤 Client ID: ${clientId}`);
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
      files: await Promise.all(files.map(async (f) => {
        const gcsPath = f.gcs_path || await getSignedUrl(f.filename); // prefer provided
        console.log("gcsPath======",gcsPath)
        console.log("mime type======",f.mime_type)
        return {
          filename: f.filename,            // blob name
          gcs_path: gcsPath,               // signed URL
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
    


    console.log("=====================requestBody========================",requestBody)

    const response = await fetchWithTimeout(
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
    console.log(`\n❌ ================================`);
    console.log(`❌ FASTAPI REQUEST FAILED`);
    console.log(`❌ ================================`);
    console.log(`💥 Error: ${error.message}`);
    
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
    if (details) {
      console.log(`📝 Response: ${JSON.stringify(details)}`);
    }
    
    console.log(`⏰ Failed at: ${new Date().toISOString()}`);
    console.log(`\n`);
    
    return {
      success: false,
      error: error.message,
      statusCode: statusCode,
      details: details
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
    
    const response = await fetchWithTimeout(
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
    return {
      success: false,
      error: error.message,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null
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
    
    const response = await fetchWithTimeout(
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
    return {
      success: false,
      error: error.message,
      statusCode: error.message.match(/returned (\d+)/)?.[1] ? parseInt(error.message.match(/returned (\d+)/)[1]) : null
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
      'User-Agent': 'NodeJS-DocumentProcessor/1.0'
    };
    
    // Health check may not require API key, but include it if available
    if (FASTAPI_API_KEY) {
      headers['X-API-Key'] = FASTAPI_API_KEY;
    }
    
    const response = await fetchWithTimeout(
      `${FASTAPI_URL}/health`,
      {
        method: 'GET',
        headers: headers
      },
      5000 // 5 second timeout for health check
    );
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.status === 'healthy';
    
  } catch (error) {
    console.error(`FastAPI health check failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  createProcessingJob,
  getJobStatus,
  getJobResults,
  checkHealth,
  FASTAPI_URL
};
