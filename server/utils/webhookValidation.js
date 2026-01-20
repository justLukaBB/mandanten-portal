/**
 * Production-ready webhook validation utilities
 */

const Logger = require('./logger');
const logger = new Logger('WebhookValidation');

/**
 * Validation error class
 */
class ValidationError extends Error {
    constructor(message, field, value) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
        this.statusCode = 400;
    }
}

/**
 * Validates email format
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        throw new ValidationError('Email is required and must be a string', 'email', email);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format', 'email', email);
    }

    // Additional security: check for max length
    if (email.length > 254) {
        throw new ValidationError('Email exceeds maximum length', 'email', email);
    }

    return email.trim().toLowerCase();
}

/**
 * Validates required string field
 */
function validateRequiredString(value, fieldName, minLength = 1, maxLength = 1000) {
    if (!value || typeof value !== 'string') {
        throw new ValidationError(
            `${fieldName} is required and must be a string`,
            fieldName,
            value
        );
    }

    const trimmed = value.trim();

    if (trimmed.length < minLength) {
        throw new ValidationError(
            `${fieldName} must be at least ${minLength} characters`,
            fieldName,
            value
        );
    }

    if (trimmed.length > maxLength) {
        throw new ValidationError(
            `${fieldName} exceeds maximum length of ${maxLength}`,
            fieldName,
            value
        );
    }

    return trimmed;
}

/**
 * Validates optional string field
 */
function validateOptionalString(value, fieldName, maxLength = 1000) {
    if (!value) {
        return '';
    }

    if (typeof value !== 'string') {
        throw new ValidationError(
            `${fieldName} must be a string`,
            fieldName,
            value
        );
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
        throw new ValidationError(
            `${fieldName} exceeds maximum length of ${maxLength}`,
            fieldName,
            value
        );
    }

    return trimmed;
}

/**
 * Validates Zendesk ID (should be numeric or numeric string)
 */
function validateZendeskId(value, fieldName) {
    if (!value) {
        return null;
    }

    // Convert to number if string
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

    if (isNaN(numValue) || numValue <= 0) {
        throw new ValidationError(
            `${fieldName} must be a positive number`,
            fieldName,
            value
        );
    }

    return numValue;
}

/**
 * Validates portal link sent payload
 */
function validatePortalLinkSentPayload(payload) {
    const errors = [];
    const validated = {};

    try {
        // Handle both Zendesk webhook format and direct format
        if (payload.ticket && payload.ticket.requester) {
            const requester = payload.ticket.requester;
            const ticket = payload.ticket;

            try {
                validated.email = validateEmail(requester.email);
            } catch (e) {
                errors.push(e);
            }

            try {
                validated.aktenzeichen = validateRequiredString(
                    requester.aktenzeichen,
                    'aktenzeichen',
                    1,
                    100
                );
            } catch (e) {
                errors.push(e);
            }

            // Parse name
            const nameParts = (requester.name || '').split(' ');
            validated.firstName = nameParts[0] || '';
            validated.lastName = nameParts.slice(1).join(' ') || '';

            validated.zendesk_ticket_id = validateZendeskId(ticket.id, 'zendesk_ticket_id');
            validated.zendesk_user_id = validateZendeskId(requester.id, 'zendesk_user_id');
            validated.phone = validateOptionalString(requester.phone, 'phone', 50);
            validated.address = validateOptionalString(requester.adresse, 'address', 500);
            validated.geburtstag = validateOptionalString(requester.geburtstag, 'geburtstag', 20);

        } else {
            // Direct format
            try {
                validated.email = validateEmail(payload.email);
            } catch (e) {
                errors.push(e);
            }

            try {
                validated.aktenzeichen = validateRequiredString(
                    payload.aktenzeichen,
                    'aktenzeichen',
                    1,
                    100
                );
            } catch (e) {
                errors.push(e);
            }

            try {
                validated.firstName = validateRequiredString(
                    payload.firstName,
                    'firstName',
                    1,
                    100
                );
            } catch (e) {
                errors.push(e);
            }

            try {
                validated.lastName = validateRequiredString(
                    payload.lastName,
                    'lastName',
                    1,
                    100
                );
            } catch (e) {
                errors.push(e);
            }

            validated.zendesk_ticket_id = validateZendeskId(
                payload.zendesk_ticket_id,
                'zendesk_ticket_id'
            );
            validated.zendesk_user_id = validateZendeskId(
                payload.zendesk_user_id,
                'zendesk_user_id'
            );
            validated.phone = validateOptionalString(payload.phone, 'phone', 50);
            validated.address = validateOptionalString(payload.address, 'address', 500);
            validated.geburtstag = validateOptionalString(payload.geburtstag, 'geburtstag', 20);
        }

    } catch (error) {
        logger.error('Unexpected error during validation', error);
        errors.push(error);
    }

    // Check for validation errors
    if (errors.length > 0) {
        const validationError = new Error('Validation failed');
        validationError.name = 'ValidationError';
        validationError.statusCode = 400;
        validationError.errors = errors.map(e => ({
            field: e.field,
            message: e.message,
            value: e.value
        }));
        throw validationError;
    }

    // Final check for required fields
    const requiredFields = ['email', 'aktenzeichen', 'firstName', 'lastName'];
    const missingFields = requiredFields.filter(field => !validated[field]);

    if (missingFields.length > 0) {
        const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
        error.name = 'ValidationError';
        error.statusCode = 400;
        error.missingFields = missingFields;
        throw error;
    }

    return validated;
}

/**
 * Validates payment confirmed payload
 */
function validatePaymentConfirmedPayload(payload) {
    const validated = {};

    // Either external_id (aktenzeichen) or email is required
    if (!payload.external_id && !payload.email) {
        const error = new Error('Either external_id (aktenzeichen) or email is required');
        error.name = 'ValidationError';
        error.statusCode = 400;
        throw error;
    }

    if (payload.external_id) {
        validated.external_id = validateOptionalString(payload.external_id, 'external_id', 100);
    }

    if (payload.email) {
        validated.email = validateEmail(payload.email);
    }

    validated.user_id = validateZendeskId(payload.user_id, 'user_id');
    validated.name = validateOptionalString(payload.name, 'name', 200);
    validated.agent_email = validateOptionalString(payload.agent_email, 'agent_email', 254);

    return validated;
}

/**
 * Validates creditor confirmation payload
 */
function validateCreditorConfirmationPayload(payload) {
    const validated = {};

    validated.aktenzeichen = validateRequiredString(
        payload.aktenzeichen,
        'aktenzeichen',
        1,
        100
    );
    validated.zendesk_ticket_id = validateZendeskId(
        payload.zendesk_ticket_id,
        'zendesk_ticket_id'
    );
    validated.agent_email = validateOptionalString(payload.agent_email, 'agent_email', 254);

    return validated;
}

module.exports = {
    ValidationError,
    validateEmail,
    validateRequiredString,
    validateOptionalString,
    validateZendeskId,
    validatePortalLinkSentPayload,
    validatePaymentConfirmedPayload,
    validateCreditorConfirmationPayload
};
