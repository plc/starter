/**
 * Agent provisioning and management routes
 *
 * POST  /agents — create a new agent identity (no auth required)
 * PATCH /agents — update the authenticated agent's metadata (auth required)
 * GET   /agents/me — get the authenticated agent's profile (auth required)
 * PUT   /agents/smtp — configure SMTP for outbound emails (auth required)
 * GET   /agents/smtp — view SMTP configuration (auth required)
 * DELETE /agents/smtp — remove SMTP configuration (auth required)
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
      'SELECT id, name, description, smtp_host, created_at FROM agents WHERE id = $1',
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
      smtp_configured: !!agent.smtp_host,
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

// ---------------------------------------------------------------------------
// SMTP configuration sub-resource
// ---------------------------------------------------------------------------

const ALLOWED_SMTP_FIELDS = new Set(['host', 'port', 'username', 'password', 'from']);

function formatSmtpResponse(agent) {
  if (!agent.smtp_host) return null;
  return {
    host: agent.smtp_host,
    port: agent.smtp_port,
    username: agent.smtp_user,
    from: agent.smtp_from,
    configured: true,
  };
}

/**
 * PUT /agents/smtp
 * Set or replace the agent's SMTP configuration. All fields required.
 */
router.put('/smtp', auth, async (req, res) => {
  try {
    const body = req.body || {};

    const unknownFields = Object.keys(body).filter(k => !ALLOWED_SMTP_FIELDS.has(k));
    if (unknownFields.length > 0) {
      return res.status(400).json({ error: 'Unknown fields: ' + unknownFields.join(', ') + '. Allowed: host, port, username, password, from' });
    }

    const { host, port, username, password, from } = body;

    if (!host || typeof host !== 'string') {
      return res.status(400).json({ error: 'host is required (string)' });
    }
    if (host.length > 255) {
      return res.status(400).json({ error: 'host exceeds 255 character limit' });
    }

    if (port === undefined || port === null || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
      return res.status(400).json({ error: 'port is required (integer, 1-65535)' });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required (string)' });
    }
    if (username.length > 255) {
      return res.status(400).json({ error: 'username exceeds 255 character limit' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required (string)' });
    }
    if (password.length > 1024) {
      return res.status(400).json({ error: 'password exceeds 1024 character limit' });
    }

    if (!from || typeof from !== 'string') {
      return res.status(400).json({ error: 'from is required (string, email address)' });
    }
    if (from.length > 255) {
      return res.status(400).json({ error: 'from exceeds 255 character limit' });
    }
    if (!from.includes('@')) {
      return res.status(400).json({ error: 'from must be a valid email address' });
    }

    const { rows } = await pool.query(
      `UPDATE agents SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_pass = $4, smtp_from = $5
       WHERE id = $6
       RETURNING smtp_host, smtp_port, smtp_user, smtp_from`,
      [host, port, username, password, from, req.agent.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ smtp: formatSmtpResponse(rows[0]) });
  } catch (err) {
    await logError(err, { route: 'PUT /agents/smtp', method: 'PUT', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to configure SMTP' });
  }
});

/**
 * GET /agents/smtp
 * View the agent's SMTP configuration (password excluded).
 */
router.get('/smtp', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT smtp_host, smtp_port, smtp_user, smtp_from FROM agents WHERE id = $1',
      [req.agent.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const smtp = formatSmtpResponse(rows[0]);
    if (!smtp) {
      return res.json({
        smtp: null,
        message: 'No SMTP configured. Outbound emails use CalDave\'s built-in delivery. Use PUT /agents/smtp to configure your own SMTP server.',
      });
    }

    res.json({ smtp });
  } catch (err) {
    await logError(err, { route: 'GET /agents/smtp', method: 'GET', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to get SMTP configuration' });
  }
});

/**
 * DELETE /agents/smtp
 * Remove the agent's SMTP configuration. Reverts to CalDave's built-in delivery.
 */
router.delete('/smtp', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE agents SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_pass = NULL, smtp_from = NULL WHERE id = $1',
      [req.agent.id]
    );

    res.json({
      smtp: null,
      message: 'SMTP configuration removed. Outbound emails will use CalDave\'s built-in delivery.',
    });
  } catch (err) {
    await logError(err, { route: 'DELETE /agents/smtp', method: 'DELETE', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to remove SMTP configuration' });
  }
});

module.exports = router;
