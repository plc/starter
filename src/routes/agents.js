/**
 * Agent provisioning and management routes
 *
 * POST  /agents — create a new agent identity (no auth required)
 * PATCH /agents — update the authenticated agent's metadata (auth required)
 * GET   /agents/me — get the authenticated agent's profile (auth required)
 *
 * Returns agent_id and api_key on creation. The key is shown once and cannot be
 * retrieved later (only the SHA-256 hash is stored).
 */

const { Router } = require('express');
const { pool } = require('../db');
const { agentId, apiKey } = require('../lib/ids');
const { hashKey } = require('../lib/keys');
const { logError } = require('../lib/errors');
const auth = require('../middleware/auth');

const router = Router();

const MAX_NAME = 255;
const MAX_DESCRIPTION = 1024;

// Fields allowed on POST /agents
const ALLOWED_CREATE_FIELDS = new Set(['name', 'description']);

// Fields allowed on PATCH /agents
const ALLOWED_PATCH_FIELDS = new Set(['name', 'description']);

/**
 * POST /agents
 * Create a new agent. No authentication required.
 * Optionally accepts name and description.
 */
router.post('/', async (req, res) => {
  try {
    const id = agentId();
    const key = apiKey();
    const hash = hashKey(key);

    // Validate unknown fields
    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(k => !ALLOWED_CREATE_FIELDS.has(k));
    if (unknownFields.length > 0) {
      return res.status(400).json({ error: 'Unknown fields: ' + unknownFields.join(', ') });
    }

    // Validate optional fields
    const name = body.name || null;
    const description = body.description || null;

    if (name !== null && typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a string' });
    }
    if (name && name.length > MAX_NAME) {
      return res.status(400).json({ error: 'name must be ' + MAX_NAME + ' characters or fewer' });
    }
    if (description !== null && typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    if (description && description.length > MAX_DESCRIPTION) {
      return res.status(400).json({ error: 'description must be ' + MAX_DESCRIPTION + ' characters or fewer' });
    }

    await pool.query(
      'INSERT INTO agents (id, api_key_hash, name, description) VALUES ($1, $2, $3, $4)',
      [id, hash, name, description]
    );

    const response = {
      agent_id: id,
      api_key: key,
      message: 'Store these credentials securely. The API key will not be shown again.',
    };
    if (name) response.name = name;
    if (description) response.description = description;

    res.status(201).json(response);
  } catch (err) {
    await logError(err, { route: 'POST /agents', method: 'POST' });
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * GET /agents/me
 * Get the authenticated agent's profile.
 */
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, created_at FROM agents WHERE id = $1',
      [req.agent.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const agent = rows[0];
    res.json({
      agent_id: agent.id,
      name: agent.name,
      description: agent.description,
      created_at: agent.created_at,
    });
  } catch (err) {
    await logError(err, { route: 'GET /agents/me', method: 'GET', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * PATCH /agents
 * Update the authenticated agent's metadata. Does not change the API key.
 */
router.patch('/', auth, async (req, res) => {
  try {
    const body = req.body || {};

    // Validate unknown fields
    const unknownFields = Object.keys(body).filter(k => !ALLOWED_PATCH_FIELDS.has(k));
    if (unknownFields.length > 0) {
      return res.status(400).json({ error: 'Unknown fields: ' + unknownFields.join(', ') });
    }

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'No fields to update. Allowed: name, description' });
    }

    // Build dynamic SET clause
    const sets = [];
    const values = [];
    let idx = 1;

    if ('name' in body) {
      const name = body.name;
      if (name !== null && typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' });
      }
      if (name && name.length > MAX_NAME) {
        return res.status(400).json({ error: 'name must be ' + MAX_NAME + ' characters or fewer' });
      }
      sets.push('name = $' + idx++);
      values.push(name || null);
    }

    if ('description' in body) {
      const description = body.description;
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      if (description && description.length > MAX_DESCRIPTION) {
        return res.status(400).json({ error: 'description must be ' + MAX_DESCRIPTION + ' characters or fewer' });
      }
      sets.push('description = $' + idx++);
      values.push(description || null);
    }

    values.push(req.agent.id);

    const { rows } = await pool.query(
      'UPDATE agents SET ' + sets.join(', ') + ' WHERE id = $' + idx + ' RETURNING id, name, description, created_at',
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = rows[0];
    res.json({
      agent_id: agent.id,
      name: agent.name,
      description: agent.description,
      created_at: agent.created_at,
    });
  } catch (err) {
    await logError(err, { route: 'PATCH /agents', method: 'PATCH', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

module.exports = router;
