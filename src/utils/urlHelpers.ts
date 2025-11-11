/**
 * URL Helpers for safe API calls with Aktenzeichen
 *
 * Handles proper encoding of client IDs and Aktenzeichen in URLs
 */

/**
 * Safely encodes a clientId/aktenzeichen for use in URLs
 * UUIDs are passed through, other values are URL-encoded
 *
 * @param clientId - Client UUID or Aktenzeichen
 * @returns URL-safe string
 */
export function encodeClientId(clientId: string): string {
  if (!clientId) {
    throw new Error('clientId is required');
  }

  // UUID pattern: 8-4-4-4-12 hex digits
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // UUIDs don't need encoding
  if (uuidRegex.test(clientId)) {
    return clientId;
  }

  // Aktenzeichen need encoding
  return encodeURIComponent(clientId);
}

/**
 * Creates a safe client API URL
 *
 * @param baseUrl - API base URL (e.g., 'http://localhost:3001')
 * @param clientId - Client UUID or Aktenzeichen
 * @param path - Optional path to append (e.g., '/documents', '/financial-data')
 * @returns Complete API URL with properly encoded clientId
 *
 * @example
 * ```typescript
 * // With UUID
 * getClientUrl(API_BASE_URL, '653442b8-...', '/documents')
 * // Returns: http://localhost:3001/api/clients/653442b8-.../documents
 *
 * // With Aktenzeichen
 * getClientUrl(API_BASE_URL, '537/000', '/financial-data')
 * // Returns: http://localhost:3001/api/clients/537%2F000/financial-data
 * ```
 */
export function getClientUrl(baseUrl: string, clientId: string, path: string = ''): string {
  const encodedId = encodeClientId(clientId);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}/api/clients/${encodedId}${cleanPath}`;
}

/**
 * Creates a safe client documents URL
 *
 * @param baseUrl - API base URL
 * @param clientId - Client UUID or Aktenzeichen
 * @param documentId - Document ID
 * @param action - Optional action (e.g., 'download', 'reprocess')
 * @returns Complete API URL for document operations
 */
export function getClientDocumentUrl(
  baseUrl: string,
  clientId: string,
  documentId: string,
  action?: string
): string {
  const encodedClientId = encodeClientId(clientId);
  const encodedDocId = encodeURIComponent(documentId);
  const actionPath = action ? `/${action}` : '';
  return `${baseUrl}/api/clients/${encodedClientId}/documents/${encodedDocId}${actionPath}`;
}

/**
 * Validates if a string is a valid UUID
 *
 * @param value - String to validate
 * @returns true if valid UUID, false otherwise
 */
export function isUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates if a string is a valid Aktenzeichen format
 * Valid: Letters, numbers, underscore, dash (3-50 chars)
 *
 * @param value - String to validate
 * @returns true if valid aktenzeichen, false otherwise
 */
export function isValidAktenzeichen(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.length < 3 || trimmed.length > 50) {
    return false;
  }

  const aktenzeichenRegex = /^[A-Z0-9_-]+$/i;
  return aktenzeichenRegex.test(trimmed);
}

/**
 * Determines if a clientId needs URL encoding
 *
 * @param clientId - Client ID to check
 * @returns true if encoding is needed, false otherwise
 */
export function needsEncoding(clientId: string): boolean {
  // UUIDs don't need encoding
  if (isUUID(clientId)) {
    return false;
  }

  // Check if it contains characters that need encoding
  const needsEncodingRegex = /[^A-Z0-9_-]/i;
  return needsEncodingRegex.test(clientId);
}
