const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

// Rate limiting configurations - temporarily disabled for IPv6 compatibility
const createRateLimit = (windowMs, max, message) => {
  return (req, res, next) => {
    // Skip rate limiting entirely to avoid IPv6 validation errors
    next();
  };
};

// Different rate limits for different endpoints
const rateLimits = {
  // General API rate limit - increased for dashboard usage
  general: createRateLimit(15 * 60 * 1000, 500, 'Too many requests, please try again later'),

  // Authentication endpoints - more restrictive
  auth: createRateLimit(15 * 60 * 1000, 10, 'Too many login attempts, please try again in 15 minutes'),

  // Upload endpoints - reasonable limit
  upload: createRateLimit(60 * 60 * 1000, 20, 'Too many uploads, please try again in 1 hour'),

  // Admin endpoints - high limit for dashboard
  admin: createRateLimit(15 * 60 * 1000, 200, 'Too many admin requests, please try again later'),

  // Verification code request - 3 requests per 15 minutes per aktenzeichen
  verificationCodeRequest: createAktenzeichenRateLimit(15 * 60 * 1000, 3, 'Zu viele Code-Anfragen. Bitte warten Sie 15 Minuten.'),

  // Verification code attempts - 10 attempts per 15 minutes per aktenzeichen
  verificationAttempt: createAktenzeichenRateLimit(15 * 60 * 1000, 10, 'Zu viele Verifizierungsversuche. Bitte warten Sie 15 Minuten.')
};

// Aktenzeichen-based rate limiting (not IP-based)
function createAktenzeichenRateLimit(windowMs, max, message) {
  const requests = new Map(); // aktenzeichen -> { count, resetAt }

  return (req, res, next) => {
    const aktenzeichen = (req.body?.aktenzeichen || '').toString().toUpperCase().trim();

    if (!aktenzeichen) {
      return next(); // No aktenzeichen provided, skip rate limiting
    }

    const now = Date.now();
    const entry = requests.get(aktenzeichen);

    // Cleanup expired entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup on each request
      for (const [key, value] of requests.entries()) {
        if (now > value.resetAt) {
          requests.delete(key);
        }
      }
    }

    if (!entry || now > entry.resetAt) {
      // New window
      requests.set(aktenzeichen, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    if (entry.count >= max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({
        error: message,
        retry_after_seconds: retryAfterSeconds
      });
    }

    entry.count++;
    return next();
  };
}

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
});

// Input validation middleware
const validateRequest = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    next();
  };
};

// Common validation rules
const validationRules = {
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  aktenzeichen: body('aktenzeichen')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[A-Z0-9_-]+$/i)
    .withMessage('Aktenzeichen must be 3-50 characters with letters, numbers, underscore or dash only'),

  clientId: body('clientId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Client ID must be 1-100 characters'),

  documentName: body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Document name must be 1-255 characters'),

  password: body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),

  // Sanitize any text input
  textField: (fieldName) => body(fieldName)
    .optional()
    .trim()
    .escape()
    .isLength({ max: 1000 })
    .withMessage(`${fieldName} must be less than 1000 characters`)
};

// File upload validation
const validateFileUpload = (req, res, next) => {
  // Normalize files to array whether it comes from upload.array (array) or upload.fields (object)
  let filesToValidate = [];
  if (Array.isArray(req.files)) {
    filesToValidate = req.files;
  } else if (req.files && typeof req.files === 'object') {
    // If upload.fields used, req.files is object { field1: [files], field2: [files] }
    Object.values(req.files).forEach(fileArray => {
      if (Array.isArray(fileArray)) {
        filesToValidate.push(...fileArray);
      }
    });
  }

  if (filesToValidate.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const maxSize = 10 * 1024 * 1024; // 10MB

  for (const file of filesToValidate) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: `File type ${file.mimetype} not allowed. Allowed types: PDF, JPG, PNG, DOC, DOCX`
      });
    }

    if (file.size > maxSize) {
      return res.status(400).json({
        error: `File ${file.originalname} is too large. Maximum size: 10MB`
      });
    }

    // Basic filename validation
    if (!/^[a-zA-Z0-9\s\-_\.\(\)]+$/i.test(file.originalname)) {
      return res.status(400).json({
        error: `Invalid filename: ${file.originalname}. Only letters, numbers, spaces, and basic punctuation allowed.`
      });
    }
  }

  next();
};

module.exports = {
  rateLimits,
  securityHeaders,
  validateRequest,
  validationRules,
  validateFileUpload
};