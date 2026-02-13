/**
 * Agent provisioning routes
 *
 * POST /agents — create a new agent identity (no auth required)
 *
 * Returns agent_id and api_key. The key is shown once and cannot be
 * retrieved later (only the SHA-256 hash is stored).
 */

const { Router } = require('express');
const { pool } = require('../db');
const { agentId, apiKey } = require('../lib/ids');
const { hashKey } = require('../lib/keys');
const { logError } = require('../lib/errors');

const router = Router();

/**
 * POST /agents
 * Create a new agent. No authentication required.
 */
router.post('/', async (req, res) => {
  try {
    const id = agentId();
    const key = apiKey();
    const hash = hashKey(key);

    await pool.query(
      'INSERT INTO agents (id, api_key_hash) VALUES ($1, $2)',
      [id, hash]
    );

    res.status(201).json({
      agent_id: id,
      api_key: key,
      message: 'Store these credentials securely. The API key will not be shown again.',
    });
  } catch (err) {
    await logError(err, { route: 'POST /agents', method: 'POST' });
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

module.exports = router;
