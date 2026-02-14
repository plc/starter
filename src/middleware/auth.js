/**
 * Bearer token authentication middleware
 *
 * Extracts the API key from the Authorization header, hashes it with
 * SHA-256, and looks up the agent in the database. On success, sets
 * req.agent = { id } for downstream route handlers.
 *
 * Returns 401 for missing/invalid tokens.
 */

const { pool } = require('../db');
const { hashKey } = require('../lib/keys');
const { logError } = require('../lib/errors');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7); // strip "Bearer "
  const hash = hashKey(token);

  try {
    const result = await pool.query(
      'SELECT id, name, description FROM agents WHERE api_key_hash = $1',
      [hash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const row = result.rows[0];
    req.agent = { id: row.id, name: row.name, description: row.description };
    next();
  } catch (err) {
    logError(err, { route: 'auth middleware', method: req.method });
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = auth;
