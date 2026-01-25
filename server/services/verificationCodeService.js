const crypto = require('crypto');

/**
 * VerificationCodeService
 * Manages 6-digit verification codes for login flow
 * - In-memory storage with 5-minute TTL
 * - Max 3 verification attempts per code
 * - Auto-cleanup every 60 seconds
 */
class VerificationCodeService {
  constructor() {
    // Map: aktenzeichen -> { code, expiresAt, attempts, email }
    this.codes = new Map();

    // Configuration
    this.CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    this.MAX_ATTEMPTS = 3;
    this.CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

    // Start auto-cleanup
    this.startCleanupInterval();
  }

  /**
   * Generate a secure 6-digit code
   * @returns {string} 6-digit numeric code
   */
  generateCode() {
    // crypto.randomInt generates a cryptographically secure random integer
    const code = crypto.randomInt(100000, 999999);
    return code.toString();
  }

  /**
   * Create and store a new verification code for an aktenzeichen
   * @param {string} aktenzeichen - The client's file number
   * @param {string} email - The client's email address
   * @returns {{ code: string, expiresAt: Date, expiresInSeconds: number }}
   */
  createCode(aktenzeichen, email) {
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.CODE_TTL_MS);

    this.codes.set(aktenzeichen.toUpperCase(), {
      code,
      expiresAt,
      attempts: 0,
      email: email.toLowerCase(),
      createdAt: new Date()
    });

    console.log(`🔐 Verification code created for ${aktenzeichen} (expires: ${expiresAt.toISOString()})`);

    return {
      code,
      expiresAt,
      expiresInSeconds: Math.floor(this.CODE_TTL_MS / 1000)
    };
  }

  /**
   * Verify a code for an aktenzeichen
   * @param {string} aktenzeichen - The client's file number
   * @param {string} code - The code to verify
   * @returns {{ valid: boolean, error?: string, attemptsRemaining?: number }}
   */
  verifyCode(aktenzeichen, code) {
    const normalizedAktenzeichen = aktenzeichen.toUpperCase();
    const entry = this.codes.get(normalizedAktenzeichen);

    // Check if code exists
    if (!entry) {
      return {
        valid: false,
        error: 'Kein aktiver Code gefunden. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Check if code is expired
    if (new Date() > entry.expiresAt) {
      this.codes.delete(normalizedAktenzeichen);
      return {
        valid: false,
        error: 'Der Code ist abgelaufen. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Check max attempts
    if (entry.attempts >= this.MAX_ATTEMPTS) {
      this.codes.delete(normalizedAktenzeichen);
      return {
        valid: false,
        error: 'Maximale Anzahl an Versuchen erreicht. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Increment attempts
    entry.attempts += 1;

    // Verify code
    if (entry.code !== code) {
      const attemptsRemaining = this.MAX_ATTEMPTS - entry.attempts;

      if (attemptsRemaining <= 0) {
        this.codes.delete(normalizedAktenzeichen);
        return {
          valid: false,
          error: 'Maximale Anzahl an Versuchen erreicht. Bitte fordern Sie einen neuen Code an.',
          attemptsRemaining: 0
        };
      }

      return {
        valid: false,
        error: `Ungültiger Code. ${attemptsRemaining} Versuch(e) verbleibend.`,
        attemptsRemaining
      };
    }

    // Code is valid - remove it (one-time use)
    this.codes.delete(normalizedAktenzeichen);
    console.log(`✅ Verification code verified successfully for ${aktenzeichen}`);

    return {
      valid: true
    };
  }

  /**
   * Check if there's an active (non-expired) code for an aktenzeichen
   * @param {string} aktenzeichen - The client's file number
   * @returns {boolean}
   */
  hasActiveCode(aktenzeichen) {
    const entry = this.codes.get(aktenzeichen.toUpperCase());
    if (!entry) return false;

    if (new Date() > entry.expiresAt) {
      this.codes.delete(aktenzeichen.toUpperCase());
      return false;
    }

    return true;
  }

  /**
   * Get time until code expires (for rate limiting)
   * @param {string} aktenzeichen - The client's file number
   * @returns {number|null} Seconds until expiration, or null if no active code
   */
  getTimeUntilExpiration(aktenzeichen) {
    const entry = this.codes.get(aktenzeichen.toUpperCase());
    if (!entry) return null;

    const remaining = entry.expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      this.codes.delete(aktenzeichen.toUpperCase());
      return null;
    }

    return Math.ceil(remaining / 1000);
  }

  /**
   * Remove expired codes (called periodically)
   */
  cleanup() {
    const now = new Date();
    let removed = 0;

    for (const [aktenzeichen, entry] of this.codes.entries()) {
      if (now > entry.expiresAt) {
        this.codes.delete(aktenzeichen);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} expired verification code(s)`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval (for testing/shutdown)
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics (for debugging/monitoring)
   */
  getStats() {
    return {
      activeCodesCount: this.codes.size,
      config: {
        ttlMinutes: this.CODE_TTL_MS / 60000,
        maxAttempts: this.MAX_ATTEMPTS
      }
    };
  }
}

// Export singleton instance
module.exports = new VerificationCodeService();
