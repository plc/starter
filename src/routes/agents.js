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
const { notify } = require('../lib/notify');
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

    notify('agent_created', { agent_id: id, name: name || '(unnamed)' });

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

const ALLOWED_SMTP_FIELDS = new Set(['host', 'port', 'username', 'password', 'from', 'secure']);

function formatSmtpResponse(agent) {
  if (!agent.smtp_host) return null;
  return {
    host: agent.smtp_host,
    port: agent.smtp_port,
    username: agent.smtp_user,
    from: agent.smtp_from,
    secure: agent.smtp_secure !== null ? agent.smtp_secure : (agent.smtp_port === 465),
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

    const { host, port, username, password, from, secure } = body;

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

    if (secure !== undefined && typeof secure !== 'boolean') {
      return res.status(400).json({ error: 'secure must be a boolean' });
    }

    // Default: port 465 = implicit TLS (secure: true), otherwise STARTTLS (secure: false)
    const secureValue = secure !== undefined ? secure : null;

    const { rows } = await pool.query(
      `UPDATE agents SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_pass = $4, smtp_from = $5, smtp_secure = $6
       WHERE id = $7
       RETURNING smtp_host, smtp_port, smtp_user, smtp_from, smtp_secure`,
      [host, port, username, password, from, secureValue, req.agent.id]
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
      'SELECT smtp_host, smtp_port, smtp_user, smtp_from, smtp_secure FROM agents WHERE id = $1',
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
      'UPDATE agents SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_pass = NULL, smtp_from = NULL, smtp_secure = NULL WHERE id = $1',
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

/**
 * POST /agents/smtp/test
 * Send a test email via the agent's configured SMTP to verify it works.
 */
router.post('/smtp/test', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure FROM agents WHERE id = $1',
      [req.agent.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (!rows[0].smtp_host) {
      return res.status(400).json({ error: 'No SMTP configured. Use PUT /agents/smtp to configure your SMTP server first.' });
    }

    // Optional recipient override
    const body = req.body || {};
    if (body.to !== undefined) {
      if (typeof body.to !== 'string') {
        return res.status(400).json({ error: 'to must be a string (email address)' });
      }
      if (!body.to.includes('@')) {
        return res.status(400).json({ error: 'to must be a valid email address' });
      }
      if (body.to.length > 255) {
        return res.status(400).json({ error: 'to exceeds 255 character limit' });
      }
    }

    const r = rows[0];
    const smtpConfig = { host: r.smtp_host, port: r.smtp_port, user: r.smtp_user, pass: r.smtp_pass, from: r.smtp_from, secure: r.smtp_secure };
    const testRecipient = body.to || smtpConfig.from;

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure !== null && smtpConfig.secure !== undefined ? smtpConfig.secure : (smtpConfig.port === 465),
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });

    try {
      await transporter.verify();
    } catch (verifyErr) {
      return res.json({
        success: false,
        message: 'SMTP connection failed: ' + verifyErr.message,
      });
    }

    // Send a test email
    try {
      const info = await transporter.sendMail({
        from: smtpConfig.from,
        to: testRecipient,
        subject: 'CalDave SMTP Test',
        text: 'This is a test email from CalDave to verify your SMTP configuration is working correctly.',
      });

      res.json({
        success: true,
        message_id: info.messageId,
        from: smtpConfig.from,
        to: testRecipient,
        message: 'Test email sent successfully to ' + testRecipient + '.',
      });
    } catch (sendErr) {
      res.json({
        success: false,
        message: 'SMTP send failed: ' + sendErr.message,
      });
    }
  } catch (err) {
    await logError(err, { route: 'POST /agents/smtp/test', method: 'POST', agent_id: req.agent.id });
    res.status(500).json({ error: 'Failed to test SMTP' });
  }
});

module.exports = router;
