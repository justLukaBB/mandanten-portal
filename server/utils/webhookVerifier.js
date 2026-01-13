/**
 * Webhook Signature Verifier
 * 
 * Verifies HMAC-SHA256 signatures from FastAPI webhooks.
 */
const crypto = require('crypto');

// Webhook secret - should match WEBHOOK_SECRET in FastAPI
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-key';

// Maximum age of webhook in seconds (5 minutes)
const MAX_WEBHOOK_AGE_SECONDS = 300;

/**
 * Verify webhook signature from FastAPI
 * 
 * @param {string} payload - Raw JSON payload as string
 * @param {string} signature - X-Signature header value
 * @param {string} timestamp - X-Timestamp header value
 * @returns {Object} - { valid: boolean, error?: string }
 */
function verifyWebhookSignature(payload, signature, timestamp) {
  try {
    // Check if required headers are present
    if (!signature) {
      return { valid: false, error: 'Missing X-Signature header' };
    }
    
    if (!timestamp) {
      return { valid: false, error: 'Missing X-Timestamp header' };
    }
    
    // Check timestamp to prevent replay attacks
    const webhookTime = Number(timestamp);

   
    
    if (Number.isNaN(webhookTime)) {
      return { valid: false, error: 'Invalid timestamp format' };
    }

    const now = Date.now();
    const ageSeconds = (now - webhookTime) / 1000;
    
    if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) {
      return { 
        valid: false, 
        error: `Webhook too old: ${ageSeconds.toFixed(0)} seconds (max: ${MAX_WEBHOOK_AGE_SECONDS})` 
      };
    }
    
    if (ageSeconds < -60) {
      // Allow 60 seconds clock skew into the future
      return { valid: false, error: 'Webhook timestamp is in the future' };
    }
    
    // Compute expected signature
    // FastAPI signs: timestamp + payload
    const signaturePayload = timestamp + payload;
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signaturePayload)
      .digest('hex');
    
    // Compare signatures using timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Invalid signature length' };
    }
    
    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      return { valid: false, error: 'Signature mismatch' };
    }
    
    return { valid: true };
    
  } catch (error) {
    console.error('Webhook verification error:', error);
    return { valid: false, error: `Verification error: ${error.message}` };
  }
}

/**
 * Express middleware for webhook signature verification
 * 
 * Usage:
 * app.post('/webhooks/ai-processing', webhookVerifier.middleware, (req, res) => { ... });
 */
function middleware(req, res, next) {
  // Get raw body (requires express.raw() or similar)
  const payload = req.body.toString('utf8');
  
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  
  console.log(`\n🔐 ================================`);
  console.log(`🔐 WEBHOOK SIGNATURE VERIFICATION`);
  console.log(`🔐 ================================`);
  console.log(`📍 Path: ${req.path}`);
  console.log(`⏰ Timestamp: ${timestamp}`);
  console.log(`🔑 Signature: ${signature ? signature.substring(0, 20) + '...' : 'MISSING'}`);
  console.log(`📦 Payload size: ${payload.length} bytes`);
  
  const result = verifyWebhookSignature(payload, signature, timestamp);
  
  if (!result.valid) {
    console.log(`❌ Verification FAILED: ${result.error}`);
    console.log(`🔐 ================================\n`);
    
    return res.status(401).json({
      error: 'Webhook signature verification failed',
      details: result.error
    });
  }
  
  console.log(`✅ Verification PASSED`);
  console.log(`🔐 ================================\n`);
  
  // Parse body if it's a string
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }
  
  next();
}

/**
 * Optional middleware - verifies signature if present, logs warning if not
 * Use this during development when you might not have signatures configured
 * IMPORTANT: This middleware ALWAYS calls next(), even if signature verification fails
 */
function optionalMiddleware(req, res, next) {
  const payload = req.body.toString('utf8');
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !timestamp) {
    console.log(`⚠️ Webhook received WITHOUT signature (development mode)`);
    console.log(`   Path: ${req.path}`);
    console.log(`   Source: ${req.headers['x-webhook-source'] || 'unknown'}`);
    console.log(`   ⚠️ ALLOWING webhook to proceed without verification\n`);
    return next();
  }

  // If headers are present, verify them but DON'T reject on failure
  console.log(`\n🔐 ================================`);
  console.log(`🔐 WEBHOOK SIGNATURE VERIFICATION (OPTIONAL MODE)`);
  console.log(`🔐 ================================`);
  console.log(`📍 Path: ${req.path}`);
  console.log(`⏰ Timestamp: ${timestamp}`);
  console.log(`🔑 Signature: ${signature ? signature.substring(0, 20) + '...' : 'MISSING'}`);
  console.log(`📦 Payload size: ${payload.length} bytes`);

  const result = verifyWebhookSignature(payload, signature, timestamp);

  if (!result.valid) {
    console.log(`⚠️ Verification FAILED: ${result.error}`);
    console.log(`⚠️ ALLOWING webhook to proceed anyway (optional mode)`);
    console.log(`🔐 ================================\n`);
    // DON'T return - let it continue
  } else {
    console.log(`✅ Verification PASSED`);
    console.log(`🔐 ================================\n`);
  }

  // Always continue to the next middleware
  next();
}

module.exports = {
  verifyWebhookSignature,
  middleware,
  optionalMiddleware,
  WEBHOOK_SECRET
};

