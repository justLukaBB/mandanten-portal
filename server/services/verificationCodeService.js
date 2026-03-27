const crypto = require('crypto');
const VerificationCode = require('../models/VerificationCode');

/**
 * VerificationCodeService
 * Manages 6-digit verification codes for login flow
 * - MongoDB storage with TTL index (survives server restarts)
 * - Max 3 verification attempts per code
 * - 5-minute expiration enforced by both app logic and MongoDB TTL
 */
class VerificationCodeService {
  constructor() {
    this.CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    this.MAX_ATTEMPTS = 3;
  }

  /**
   * Generate a secure 6-digit code
   * @returns {string} 6-digit numeric code
   */
  generateCode() {
    const code = crypto.randomInt(100000, 999999);
    return code.toString();
  }

  /**
   * Create and store a new verification code for an aktenzeichen
   * @param {string} aktenzeichen - The client's file number
   * @param {string} email - The client's email address
   * @returns {{ code: string, expiresAt: Date, expiresInSeconds: number }}
   */
  async createCode(aktenzeichen, email) {
    const code = this.generateCode();
    const normalizedAktenzeichen = aktenzeichen.toUpperCase();
    const expiresAt = new Date(Date.now() + this.CODE_TTL_MS);

    // Upsert: replace any existing code for this aktenzeichen
    await VerificationCode.findOneAndUpdate(
      { aktenzeichen: normalizedAktenzeichen },
      {
        aktenzeichen: normalizedAktenzeichen,
        code,
        email: email.toLowerCase(),
        attempts: 0,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log(`Verification code created for ${aktenzeichen} (expires: ${expiresAt.toISOString()})`);

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
  async verifyCode(aktenzeichen, code) {
    const normalizedAktenzeichen = aktenzeichen.toUpperCase();
    const normalizedCode = String(code).trim();

    const entry = await VerificationCode.findOne({ aktenzeichen: normalizedAktenzeichen });

    // Check if code exists
    if (!entry) {
      return {
        valid: false,
        error: 'Kein aktiver Code gefunden. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Check if code is expired (app-level check, TTL index handles cleanup)
    const expiresAt = new Date(entry.createdAt.getTime() + this.CODE_TTL_MS);
    if (new Date() > expiresAt) {
      await VerificationCode.deleteOne({ _id: entry._id });
      return {
        valid: false,
        error: 'Der Code ist abgelaufen. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Check max attempts
    if (entry.attempts >= this.MAX_ATTEMPTS) {
      await VerificationCode.deleteOne({ _id: entry._id });
      return {
        valid: false,
        error: 'Maximale Anzahl an Versuchen erreicht. Bitte fordern Sie einen neuen Code an.'
      };
    }

    // Increment attempts atomically
    await VerificationCode.updateOne(
      { _id: entry._id },
      { $inc: { attempts: 1 } }
    );

    // Verify code
    if (entry.code !== normalizedCode) {
      const attemptsRemaining = this.MAX_ATTEMPTS - (entry.attempts + 1);

      if (attemptsRemaining <= 0) {
        await VerificationCode.deleteOne({ _id: entry._id });
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
    await VerificationCode.deleteOne({ _id: entry._id });
    console.log(`Verification code verified successfully for ${aktenzeichen}`);

    return {
      valid: true
    };
  }

  /**
   * Check if there's an active (non-expired) code for an aktenzeichen
   * @param {string} aktenzeichen - The client's file number
   * @returns {boolean}
   */
  async hasActiveCode(aktenzeichen) {
    const entry = await VerificationCode.findOne({ aktenzeichen: aktenzeichen.toUpperCase() });
    if (!entry) return false;

    const expiresAt = new Date(entry.createdAt.getTime() + this.CODE_TTL_MS);
    if (new Date() > expiresAt) {
      await VerificationCode.deleteOne({ _id: entry._id });
      return false;
    }

    return true;
  }

  /**
   * Get time until code expires (for rate limiting)
   * @param {string} aktenzeichen - The client's file number
   * @returns {number|null} Seconds until expiration, or null if no active code
   */
  async getTimeUntilExpiration(aktenzeichen) {
    const entry = await VerificationCode.findOne({ aktenzeichen: aktenzeichen.toUpperCase() });
    if (!entry) return null;

    const expiresAt = new Date(entry.createdAt.getTime() + this.CODE_TTL_MS);
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      await VerificationCode.deleteOne({ _id: entry._id });
      return null;
    }

    return Math.ceil(remaining / 1000);
  }

  /**
   * Get statistics (for debugging/monitoring)
   */
  async getStats() {
    const activeCodesCount = await VerificationCode.countDocuments();
    return {
      activeCodesCount,
      config: {
        ttlMinutes: this.CODE_TTL_MS / 60000,
        maxAttempts: this.MAX_ATTEMPTS
      }
    };
  }
}

// Export singleton instance
module.exports = new VerificationCodeService();
