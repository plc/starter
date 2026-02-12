/**
 * API key hashing
 *
 * Uses SHA-256 for deterministic hashing. This allows direct DB lookup
 * by hash (WHERE api_key_hash = $1) instead of iterating all rows.
 *
 * SHA-256 is appropriate here because API keys are high-entropy random
 * strings (32 alphanumeric chars), not human-chosen passwords.
 */

const crypto = require('crypto');

/**
 * Hash an API key with SHA-256
 * @param {string} key - The plaintext API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = { hashKey };
