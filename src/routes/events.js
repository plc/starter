/**
 * Event routes
 *
 * All routes require authentication and verify calendar ownership.
 *
 * POST   /calendars/:id/events                    — create event
 * GET    /calendars/:id/events                    — list events (with filters)
 * GET    /calendars/:id/events/:event_id          — get single event
 * PATCH  /calendars/:id/events/:event_id          — update event
 * DELETE /calendars/:id/events/:event_id          — delete event
 * GET    /calendars/:id/upcoming                  — next N events from now
 * POST   /calendars/:id/events/:event_id/respond  — accept/decline invite
 */

const { Router } = require('express');
const { pool } = require('../db');
const { eventId } = require('../lib/ids');

const router = Router();

// Size limits (bytes)
const MAX_DESCRIPTION = 64 * 1024; // 64KB
const MAX_METADATA = 16 * 1024;    // 16KB

/**
 * Helper: verify the authenticated agent owns this calendar.
 * Returns true if valid, sends 404 and returns false otherwise.
 */
async function verifyCalendarOwnership(req, res) {
  const { rows } = await pool.query(
    'SELECT id FROM calendars WHERE id = $1 AND agent_id = $2',
    [req.params.id, req.agent.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Calendar not found' });
    return false;
  }
  return true;
}

/**
 * Format an event row for API responses.
 */
function formatEvent(evt) {
  return {
    id: evt.id,
    calendar_id: evt.calendar_id,
    title: evt.title,
    description: evt.description,
    metadata: evt.metadata,
    start: evt.start_time,
    end: evt.end_time,
    location: evt.location,
    status: evt.status,
    source: evt.source,
    recurrence: evt.recurrence,
    attendees: evt.attendees,
    created_at: evt.created_at,
    updated_at: evt.updated_at,
  };
}

/**
 * Convert a duration in milliseconds to an ISO 8601 duration string.
 * e.g. 870000 → "PT14M30S"
 */
function msToIsoDuration(ms) {
  if (ms <= 0) return 'PT0S';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let parts = 'PT';
  if (hours > 0) parts += `${hours}H`;
  if (minutes > 0) parts += `${minutes}M`;
  if (seconds > 0 || parts === 'PT') parts += `${seconds}S`;
  return parts;
}

/**
 * POST /calendars/:id/events
 */
router.post('/:id/events', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const { title, start, end, description, metadata, location, status, attendees } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!start) return res.status(400).json({ error: 'start is required' });
    if (!end) return res.status(400).json({ error: 'end is required' });

    // Size checks
    if (description && Buffer.byteLength(description) > MAX_DESCRIPTION) {
      return res.status(400).json({ error: 'description exceeds 64KB limit' });
    }
    if (metadata && Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA) {
      return res.status(400).json({ error: 'metadata exceeds 16KB limit' });
    }

    const id = eventId();

    const { rows } = await pool.query(
      `INSERT INTO events (id, calendar_id, title, description, metadata, start_time, end_time, location, status, source, attendees)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'api', $10)
       RETURNING *`,
      [
        id,
        req.params.id,
        title,
        description || null,
        metadata ? JSON.stringify(metadata) : null,
        start,
        end,
        location || null,
        status || 'confirmed',
        attendees ? JSON.stringify(attendees) : null,
      ]
    );

    res.status(201).json(formatEvent(rows[0]));
  } catch (err) {
    console.error('POST /events error:', err.message);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

/**
 * GET /calendars/:id/events
 * Query params: start, end, status, limit (default 50), offset (default 0)
 */
router.get('/:id/events', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const conditions = ['calendar_id = $1'];
    const values = [req.params.id];
    let idx = 2;

    if (req.query.start) {
      conditions.push(`start_time >= $${idx++}`);
      values.push(req.query.start);
    }
    if (req.query.end) {
      conditions.push(`start_time <= $${idx++}`);
      values.push(req.query.end);
    }
    if (req.query.status) {
      conditions.push(`status = $${idx++}`);
      values.push(req.query.status);
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    values.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT * FROM events
       WHERE ${conditions.join(' AND ')}
       ORDER BY start_time ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    res.json({ events: rows.map(formatEvent) });
  } catch (err) {
    console.error('GET /events error:', err.message);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

/**
 * GET /calendars/:id/upcoming
 * Query params: limit (default 5)
 */
router.get('/:id/upcoming', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const limit = Math.min(parseInt(req.query.limit) || 5, 50);

    const { rows } = await pool.query(
      `SELECT * FROM events
       WHERE calendar_id = $1
         AND start_time >= now()
         AND status != 'cancelled'
       ORDER BY start_time ASC
       LIMIT $2`,
      [req.params.id, limit]
    );

    const events = rows.map(formatEvent);

    // Calculate ISO 8601 duration until next event
    let nextEventStartsIn = null;
    if (events.length > 0) {
      const msUntil = new Date(events[0].start).getTime() - Date.now();
      nextEventStartsIn = msToIsoDuration(Math.max(0, msUntil));
    }

    res.json({ events, next_event_starts_in: nextEventStartsIn });
  } catch (err) {
    console.error('GET /upcoming error:', err.message);
    res.status(500).json({ error: 'Failed to get upcoming events' });
  }
});

/**
 * GET /calendars/:id/events/:event_id
 */
router.get('/:id/events/:event_id', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const { rows } = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND calendar_id = $2',
      [req.params.event_id, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(formatEvent(rows[0]));
  } catch (err) {
    console.error('GET /events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

/**
 * PATCH /calendars/:id/events/:event_id
 */
router.patch('/:id/events/:event_id', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    // Verify event exists
    const check = await pool.query(
      'SELECT id FROM events WHERE id = $1 AND calendar_id = $2',
      [req.params.event_id, req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { title, description, metadata, start, end, location, status, attendees } = req.body;

    // Size checks
    if (description && Buffer.byteLength(description) > MAX_DESCRIPTION) {
      return res.status(400).json({ error: 'description exceeds 64KB limit' });
    }
    if (metadata && Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA) {
      return res.status(400).json({ error: 'metadata exceeds 16KB limit' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (metadata !== undefined) { updates.push(`metadata = $${idx++}`); values.push(JSON.stringify(metadata)); }
    if (start !== undefined) { updates.push(`start_time = $${idx++}`); values.push(start); }
    if (end !== undefined) { updates.push(`end_time = $${idx++}`); values.push(end); }
    if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (attendees !== undefined) { updates.push(`attendees = $${idx++}`); values.push(JSON.stringify(attendees)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Always update updated_at
    updates.push(`updated_at = now()`);

    values.push(req.params.event_id);
    const { rows } = await pool.query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(formatEvent(rows[0]));
  } catch (err) {
    console.error('PATCH /events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

/**
 * DELETE /calendars/:id/events/:event_id
 */
router.delete('/:id/events/:event_id', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const result = await pool.query(
      'DELETE FROM events WHERE id = $1 AND calendar_id = $2',
      [req.params.event_id, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('DELETE /events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

/**
 * POST /calendars/:id/events/:event_id/respond
 * Body: { "response": "accepted" | "declined" | "tentative" }
 */
router.post('/:id/events/:event_id/respond', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const { response } = req.body;
    const validResponses = ['accepted', 'declined', 'tentative'];

    if (!response || !validResponses.includes(response)) {
      return res.status(400).json({
        error: `response must be one of: ${validResponses.join(', ')}`,
      });
    }

    // Map response to event status
    const statusMap = {
      accepted: 'confirmed',
      declined: 'cancelled',
      tentative: 'tentative',
    };

    const { rows } = await pool.query(
      `UPDATE events SET status = $1, updated_at = now()
       WHERE id = $2 AND calendar_id = $3
       RETURNING *`,
      [statusMap[response], req.params.event_id, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({
      ...formatEvent(rows[0]),
      response,
      message: `Event ${response}`,
    });
  } catch (err) {
    console.error('POST /respond error:', err.message);
    res.status(500).json({ error: 'Failed to respond to event' });
  }
});

module.exports = router;
