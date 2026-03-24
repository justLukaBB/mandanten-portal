/**
 * Standardized API response helpers.
 * Use these in route handlers for consistent error/success format.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {Object} data - Response payload
 * @param {number} [status=200]
 */
function sendSuccess(res, data, status = 200) {
  res.status(status).json({ success: true, ...data });
}

/**
 * Send an error response with consistent format.
 * @param {import('express').Response} res
 * @param {number} status - HTTP status code
 * @param {string} error - Human-readable error message
 * @param {Object} [options]
 * @param {string} [options.code] - Machine-readable error code (e.g. 'TENANT_MISMATCH')
 * @param {string} [options.details] - Extra detail (only in non-production)
 */
function sendError(res, status, error, options = {}) {
  const body = { success: false, error };
  if (options.code) body.code = options.code;
  if (options.details && process.env.NODE_ENV !== 'production') {
    body.details = options.details;
  }
  res.status(status).json(body);
}

/**
 * Express error-handling middleware.
 * Mount AFTER all routes: app.use(errorHandler)
 */
function errorHandler(err, req, res, _next) {
  const Logger = require('./logger');
  const log = new Logger('ErrorHandler');

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 413, 'Datei zu groß', { code: 'FILE_TOO_LARGE' });
  }

  // Multer file type error
  if (err.message && err.message.includes('Dateityp nicht unterstützt')) {
    return sendError(res, 415, err.message, { code: 'UNSUPPORTED_FILE_TYPE' });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return sendError(res, 400, 'Validierungsfehler', {
      code: 'VALIDATION_ERROR',
      details: err.message,
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return sendError(res, 409, 'Eintrag existiert bereits', { code: 'DUPLICATE_KEY' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 401, 'Ungültiges Token', { code: 'INVALID_TOKEN' });
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 401, 'Token abgelaufen', { code: 'TOKEN_EXPIRED' });
  }

  // Default: internal server error
  log.error('Unhandled error', err, {
    method: req.method,
    url: req.originalUrl,
  });

  sendError(res, 500, 'Interner Serverfehler', {
    code: 'INTERNAL_ERROR',
    details: err.message,
  });
}

module.exports = { sendSuccess, sendError, errorHandler };
