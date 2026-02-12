/**
 * Calendar management routes
 *
 * All routes require authentication (req.agent must be set).
 *
 * POST   /calendars       — create calendar
 * GET    /calendars       — list agent's calendars
 * GET    /calendars/:id   — get single calendar
 * PATCH  /calendars/:id   — update calendar
 * DELETE /calendars/:id   — delete calendar + events
 */

const { Router } = require('express');
const { pool } = require('../db');
const { calendarId, feedToken } = require('../lib/ids');

const router = Router();

// Domain used for generated email addresses
const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.fly.dev';

/**
 * Helper: fetch a calendar and verify the authenticated agent owns it.
 * Returns the calendar row or sends a 404 and returns null.
 */
async function getOwnedCalendar(req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM calendars WHERE id = $1 AND agent_id = $2',
    [req.params.id, req.agent.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Calendar not found' });
    return null;
  }
  return rows[0];
}

/**
 * Format a calendar row for API responses.
 */
function formatCalendar(cal) {
  return {
    calendar_id: cal.id,
    name: cal.name,
    timezone: cal.timezone,
    email: cal.email,
    ical_feed_url: `https://${DOMAIN}/feeds/${cal.id}.ics?token=${cal.feed_token}`,
    webhook_url: cal.webhook_url || null,
    created_at: cal.created_at,
  };
}

/**
 * POST /calendars
 */
router.post('/', async (req, res) => {
  try {
    const { name, timezone } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = calendarId();
    const token = feedToken();
    const email = `cal-${id.slice(4)}@${DOMAIN}`;
    const tz = timezone || 'UTC';

    await pool.query(
      `INSERT INTO calendars (id, agent_id, name, timezone, email, feed_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.agent.id, name, tz, email, token]
    );

    res.status(201).json({
      calendar_id: id,
      name,
      timezone: tz,
      email,
      ical_feed_url: `https://${DOMAIN}/feeds/${id}.ics?token=${token}`,
      feed_token: token,
      message: `This calendar can receive invites at ${email}. Save this information.`,
    });
  } catch (err) {
    console.error('POST /calendars error:', err.message);
    res.status(500).json({ error: 'Failed to create calendar' });
  }
});

/**
 * GET /calendars
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM calendars WHERE agent_id = $1 ORDER BY created_at',
      [req.agent.id]
    );
    res.json({ calendars: rows.map(formatCalendar) });
  } catch (err) {
    console.error('GET /calendars error:', err.message);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

/**
 * GET /calendars/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const cal = await getOwnedCalendar(req, res);
    if (!cal) return;
    res.json(formatCalendar(cal));
  } catch (err) {
    console.error('GET /calendars/:id error:', err.message);
    res.status(500).json({ error: 'Failed to get calendar' });
  }
});

/**
 * PATCH /calendars/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const cal = await getOwnedCalendar(req, res);
    if (!cal) return;

    const { name, timezone, webhook_url, webhook_secret, webhook_offsets } = req.body;

    // Build dynamic SET clause from provided fields
    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (timezone !== undefined) { updates.push(`timezone = $${idx++}`); values.push(timezone); }
    if (webhook_url !== undefined) { updates.push(`webhook_url = $${idx++}`); values.push(webhook_url); }
    if (webhook_secret !== undefined) { updates.push(`webhook_secret = $${idx++}`); values.push(webhook_secret); }
    if (webhook_offsets !== undefined) { updates.push(`webhook_offsets = $${idx++}`); values.push(JSON.stringify(webhook_offsets)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE calendars SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(formatCalendar(rows[0]));
  } catch (err) {
    console.error('PATCH /calendars/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

/**
 * DELETE /calendars/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const cal = await getOwnedCalendar(req, res);
    if (!cal) return;

    await pool.query('DELETE FROM calendars WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /calendars/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete calendar' });
  }
});

module.exports = router;
