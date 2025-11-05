/**
 * Sanitizes and validates Aktenzeichen (case numbers) to prevent:
 * - Path traversal attacks (../, ..\)
 * - Directory separator injection (/, \)
 * - URL routing issues
 * - File system security issues
 *
 * Only allows: Letters (A-Z, a-z), Numbers (0-9), Underscore (_), Dash (-)
 */

const AKTENZEICHEN_REGEX = /^[A-Z0-9_-]+$/i;

/**
 * Validates if an aktenzeichen is safe
 * @param {string} aktenzeichen - The aktenzeichen to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidAktenzeichen(aktenzeichen) {
  if (!aktenzeichen || typeof aktenzeichen !== 'string') {
    return false;
  }

  const trimmed = aktenzeichen.trim();

  // Check length (3-50 characters)
  if (trimmed.length < 3 || trimmed.length > 50) {
    return false;
  }

  // Check against regex pattern
  return AKTENZEICHEN_REGEX.test(trimmed);
}

/**
 * Sanitizes an aktenzeichen by:
 * 1. Trimming whitespace
 * 2. Replacing invalid characters with underscores
 * 3. Removing path traversal attempts
 * 4. Ensuring it matches the safe pattern
 *
 * @param {string} aktenzeichen - The aktenzeichen to sanitize
 * @returns {string} - Sanitized aktenzeichen
 * @throws {Error} - If aktenzeichen is invalid or cannot be sanitized
 */
function sanitizeAktenzeichen(aktenzeichen) {
  if (!aktenzeichen || typeof aktenzeichen !== 'string') {
    throw new Error('Aktenzeichen must be a non-empty string');
  }

  let sanitized = aktenzeichen.trim();

  // Replace slashes and backslashes with underscores
  sanitized = sanitized.replace(/[\/\\]/g, '_');

  // Remove any path traversal attempts (dots)
  sanitized = sanitized.replace(/\.\./g, '');

  // Replace any other invalid characters with underscores
  sanitized = sanitized.replace(/[^A-Z0-9_-]/gi, '_');

  // Clean up multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove leading and trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // Check length after sanitization
  if (sanitized.length < 3 || sanitized.length > 50) {
    throw new Error(`Aktenzeichen must be 3-50 characters (got: ${sanitized.length})`);
  }

  // Final validation
  if (!AKTENZEICHEN_REGEX.test(sanitized)) {
    throw new Error(`Invalid aktenzeichen format: ${sanitized}`);
  }

  return sanitized;
}

/**
 * Safely sanitizes an aktenzeichen without throwing errors
 * Returns null if sanitization fails
 *
 * @param {string} aktenzeichen - The aktenzeichen to sanitize
 * @returns {string|null} - Sanitized aktenzeichen or null if invalid
 */
function sanitizeAktenzeichenSafe(aktenzeichen) {
  try {
    return sanitizeAktenzeichen(aktenzeichen);
  } catch (error) {
    console.error('Failed to sanitize aktenzeichen:', error.message);
    return null;
  }
}

/**
 * Express middleware to validate aktenzeichen URL parameters
 * Usage: router.get('/route/:aktenzeichen', validateAktenzeichenParam, handler)
 */
function validateAktenzeichenParam(req, res, next) {
  const aktenzeichen = req.params.aktenzeichen;

  if (!aktenzeichen) {
    return res.status(400).json({
      error: 'Aktenzeichen parameter is required'
    });
  }

  if (!isValidAktenzeichen(aktenzeichen)) {
    console.warn(`⚠️ Invalid aktenzeichen in URL parameter: ${aktenzeichen}`);
    return res.status(400).json({
      error: 'Invalid aktenzeichen format',
      message: 'Aktenzeichen must be 3-50 characters with letters, numbers, underscore or dash only'
    });
  }

  // Sanitize and store in req for safety
  try {
    req.sanitizedAktenzeichen = sanitizeAktenzeichen(aktenzeichen);
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to process aktenzeichen',
      message: error.message
    });
  }
}

module.exports = {
  isValidAktenzeichen,
  sanitizeAktenzeichen,
  sanitizeAktenzeichenSafe,
  validateAktenzeichenParam,
  AKTENZEICHEN_REGEX
};
