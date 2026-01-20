/**
 * Production-ready structured logger
 * Provides consistent logging format with levels and metadata
 */

const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

class Logger {
    constructor(context = 'App') {
        this.context = context;
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    _formatMessage(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            context: this.context,
            message,
            ...(Object.keys(metadata).length > 0 && { metadata }),
            ...(this.isProduction && { pid: process.pid })
        };

        return logEntry;
    }

    _log(level, message, metadata) {
        const formatted = this._formatMessage(level, message, metadata);

        // In production, use JSON format for better parsing
        if (this.isProduction) {
            console.log(JSON.stringify(formatted));
        } else {
            // In development, use more readable format
            const emoji = {
                ERROR: '❌',
                WARN: '⚠️',
                INFO: 'ℹ️',
                DEBUG: '🔍'
            }[level] || '';

            console.log(
                `${emoji} [${formatted.timestamp}] [${level}] [${this.context}] ${message}`,
                Object.keys(metadata).length > 0 ? metadata : ''
            );
        }
    }

    error(message, error, metadata = {}) {
        this._log(LOG_LEVELS.ERROR, message, {
            ...metadata,
            error: error ? {
                message: error.message,
                stack: this.isProduction ? undefined : error.stack,
                name: error.name,
                ...(error.code && { code: error.code })
            } : undefined
        });
    }

    warn(message, metadata = {}) {
        this._log(LOG_LEVELS.WARN, message, metadata);
    }

    info(message, metadata = {}) {
        this._log(LOG_LEVELS.INFO, message, metadata);
    }

    debug(message, metadata = {}) {
        // Only log debug in non-production environments
        if (!this.isProduction) {
            this._log(LOG_LEVELS.DEBUG, message, metadata);
        }
    }

    // Create child logger with extended context
    child(childContext) {
        return new Logger(`${this.context}:${childContext}`);
    }
}

module.exports = Logger;
