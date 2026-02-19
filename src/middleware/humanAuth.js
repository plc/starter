/**
 * Human authentication middleware
 *
 * Two modes:
 * 1. Session cookie (caldave_session) — for dashboard/browser access
 * 2. X-Human-Key header (hk_live_...) — for API access
 *
 * On success, sets req.human = { id, name, email }
 *
 * sessionAuth: redirects to /login on failure (for HTML pages)
 * humanKeyAuth: returns 401 JSON on failure (for API endpoints)
 * optionalHumanKeyAuth: sets req.human if key present, continues regardless
 */

const { pool } = require('../db');
const { hashKey } = require('../lib/keys');

/**
 * Dashboard middleware: authenticates via session cookie, redirects to /login on failure.
 */
async function sessionAuth(req, res, next) {
  const sessionId = req.cookies && req.cookies.caldave_session;
  if (!sessionId) {
    return res.redirect('/login');
  }

  try {
    const { rows } = await pool.query(
      'SELECT h.id, h.name, h.email FROM human_sessions s JOIN humans h ON h.id = s.human_id WHERE s.id = $1 AND s.expires_at > now()',
      [sessionId]
    );

    if (rows.length === 0) {
      res.clearCookie('caldave_session');
      return res.redirect('/login');
    }

    req.human = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    next();
  } catch (err) {
    console.error('Session auth error:', err.message);
    res.redirect('/login');
  }
}

/**
 * API middleware: authenticates via X-Human-Key header.
 * Returns 401 on failure.
 */
async function humanKeyAuth(req, res, next) {
  const key = req.headers['x-human-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing X-Human-Key header' });
  }

  try {
    const hash = hashKey(key);
    const { rows } = await pool.query(
      'SELECT id, name, email FROM humans WHERE api_key_hash = $1',
      [hash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid human key' });
    }

    req.human = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    next();
  } catch (err) {
    console.error('Human key auth error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Optional API middleware: sets req.human if X-Human-Key header present,
 * continues either way. Returns 401 only if a key is provided but invalid.
 */
async function optionalHumanKeyAuth(req, res, next) {
  const key = req.headers['x-human-key'];
  if (!key) {
    return next();
  }

  try {
    const hash = hashKey(key);
    const { rows } = await pool.query(
      'SELECT id, name, email FROM humans WHERE api_key_hash = $1',
      [hash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid human key' });
    }

    req.human = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    next();
  } catch (err) {
    console.error('Optional human key auth error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { sessionAuth, humanKeyAuth, optionalHumanKeyAuth };
