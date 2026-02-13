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
const { logError } = require('../lib/errors');
const {
  parseAndValidateRRule,
  materializeInstances,
  rematerialize,
  updateMaterializedUntil,
  MATERIALIZE_WINDOW_DAYS,
} = require('../lib/recurrence');

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
  let start = evt.start_time;
  let end = evt.end_time;

  if (evt.all_day) {
    // Convert back from exclusive midnight-UTC end to inclusive date-only strings
    start = new Date(evt.start_time).toISOString().slice(0, 10);
    const endDate = new Date(evt.end_time);
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    end = endDate.toISOString().slice(0, 10);
  }

  const result = {
    id: evt.id,
    calendar_id: evt.calendar_id,
    title: evt.title,
    description: evt.description,
    metadata: evt.metadata,
    all_day: evt.all_day || undefined,
    start,
    end,
    location: evt.location,
    status: evt.status,
    source: evt.source,
    recurrence: evt.recurrence || undefined,
    parent_event_id: evt.parent_event_id || undefined,
    occurrence_date: evt.occurrence_date || undefined,
    is_exception: evt.is_exception || undefined,
    attendees: evt.attendees,
    organiser_email: evt.organiser_email || undefined,
    ical_uid: evt.ical_uid || undefined,
    created_at: evt.created_at,
    updated_at: evt.updated_at,
  };
  // Strip undefined keys for clean JSON
  return JSON.parse(JSON.stringify(result));
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
const KNOWN_EVENT_FIELDS = new Set([
  'title', 'start', 'end', 'description', 'metadata', 'location',
  'status', 'attendees', 'recurrence', 'all_day',
]);

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize start/end for all-day events.
 * Input: inclusive dates like "2025-03-15" (start) and "2025-03-15" (end = same day).
 * Output: { startTime, endTime } as midnight-UTC timestamps.
 * End is exclusive (iCal convention): "2025-03-15" → end_time = 2025-03-16T00:00:00Z.
 */
function normalizeAllDay(start, end) {
  const startTime = `${start}T00:00:00Z`;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const endTime = d.toISOString();
  return { startTime, endTime };
}

/**
 * Check for unknown fields in the request body. Returns an error message
 * listing the unknown fields, or null if all fields are known.
 */
function checkUnknownFields(body, knownFields) {
  if (!body || typeof body !== 'object') return null;
  const unknown = Object.keys(body).filter(k => !knownFields.has(k));
  if (unknown.length === 0) return null;
  return `Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`;
}

router.post('/:id/events', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const unknownErr = checkUnknownFields(req.body, KNOWN_EVENT_FIELDS);
    if (unknownErr) return res.status(400).json({ error: unknownErr });

    const { title, start, end, description, metadata, location, status, attendees, recurrence, all_day } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!start) return res.status(400).json({ error: 'start is required' });
    if (!end) return res.status(400).json({ error: 'end is required' });

    // Length checks
    if (title.length > 500) return res.status(400).json({ error: 'title exceeds 500 character limit' });
    if (location && location.length > 500) return res.status(400).json({ error: 'location exceeds 500 character limit' });

    // Size checks
    if (description && Buffer.byteLength(description) > MAX_DESCRIPTION) {
      return res.status(400).json({ error: 'description exceeds 64KB limit' });
    }
    if (metadata && Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA) {
      return res.status(400).json({ error: 'metadata exceeds 16KB limit' });
    }

    // All-day validation and normalization
    let startTime = start;
    let endTime = end;
    if (all_day) {
      if (!DATE_ONLY_RE.test(start)) {
        return res.status(400).json({ error: 'all_day events require date-only start (YYYY-MM-DD)' });
      }
      if (!DATE_ONLY_RE.test(end)) {
        return res.status(400).json({ error: 'all_day events require date-only end (YYYY-MM-DD)' });
      }
      if (start > end) {
        return res.status(400).json({ error: 'start date must not be after end date' });
      }
      ({ startTime, endTime } = normalizeAllDay(start, end));
    }

    const id = eventId();

    // ---- Recurring event ----
    if (recurrence) {
      const dtstart = new Date(startTime);
      const validation = parseAndValidateRRule(recurrence, dtstart);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Insert the parent row with status = 'recurring'
      const { rows } = await pool.query(
        `INSERT INTO events (id, calendar_id, title, description, metadata, start_time, end_time, location, status, source, recurrence, attendees, all_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'recurring', 'api', $9, $10, $11)
         RETURNING *`,
        [
          id,
          req.params.id,
          title,
          description || null,
          metadata ? JSON.stringify(metadata) : null,
          startTime,
          endTime,
          location || null,
          recurrence,
          attendees ? JSON.stringify(attendees) : null,
          !!all_day,
        ]
      );

      const parentEvent = rows[0];

      // Materialize instances for the next 90 days
      const now = new Date();
      const horizon = new Date(now.getTime() + MATERIALIZE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const instancesCreated = await materializeInstances(pool, parentEvent, now, horizon);

      // Record the materialization horizon
      await updateMaterializedUntil(pool, parentEvent.id, horizon);

      return res.status(201).json({
        ...formatEvent(parentEvent),
        instances_created: instancesCreated,
      });
    }

    // ---- Regular (non-recurring) event ----
    const { rows } = await pool.query(
      `INSERT INTO events (id, calendar_id, title, description, metadata, start_time, end_time, location, status, source, attendees, all_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'api', $10, $11)
       RETURNING *`,
      [
        id,
        req.params.id,
        title,
        description || null,
        metadata ? JSON.stringify(metadata) : null,
        startTime,
        endTime,
        location || null,
        status || 'confirmed',
        attendees ? JSON.stringify(attendees) : null,
        !!all_day,
      ]
    );

    res.status(201).json(formatEvent(rows[0]));
  } catch (err) {
    await logError(err, { route: 'POST /calendars/:id/events', method: 'POST', agent_id: req.agent?.id });
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

    // Exclude recurring parent rows from listings (they are templates, not events)
    const conditions = ['calendar_id = $1', "status != 'recurring'"];
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
    await logError(err, { route: 'GET /calendars/:id/events', method: 'GET', agent_id: req.agent?.id });
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
         AND status NOT IN ('cancelled', 'recurring')
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
    await logError(err, { route: 'GET /calendars/:id/upcoming', method: 'GET', agent_id: req.agent?.id });
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
    await logError(err, { route: 'GET /calendars/:id/events/:event_id', method: 'GET', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Failed to get event' });
  }
});

/**
 * PATCH /calendars/:id/events/:event_id
 *
 * Three modes depending on what's being patched:
 * - Instance: mark as exception, apply changes to that row only
 * - Parent template fields: update parent + propagate to non-exception instances
 * - Parent RRULE/timing: update parent + rematerialize all non-exception instances
 */
router.patch('/:id/events/:event_id', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    // Fetch the full event row
    const check = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND calendar_id = $2',
      [req.params.event_id, req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const evt = check.rows[0];

    const unknownErr = checkUnknownFields(req.body, KNOWN_EVENT_FIELDS);
    if (unknownErr) return res.status(400).json({ error: unknownErr });

    const { title, description, metadata, start, end, location, status, attendees, recurrence, all_day } = req.body;

    // Length checks
    if (title !== undefined && title.length > 500) {
      return res.status(400).json({ error: 'title exceeds 500 character limit' });
    }
    if (location !== undefined && location.length > 500) {
      return res.status(400).json({ error: 'location exceeds 500 character limit' });
    }

    // Size checks
    if (description && Buffer.byteLength(description) > MAX_DESCRIPTION) {
      return res.status(400).json({ error: 'description exceeds 64KB limit' });
    }
    if (metadata && Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA) {
      return res.status(400).json({ error: 'metadata exceeds 16KB limit' });
    }

    // Resolve whether this event will be all_day after the patch
    const effectiveAllDay = all_day !== undefined ? !!all_day : !!evt.all_day;

    // Normalize start/end if the event is (or will be) all_day
    let startTime = start;
    let endTime = end;
    if (effectiveAllDay && (start !== undefined || end !== undefined || all_day !== undefined)) {
      const s = start !== undefined ? start : (evt.all_day ? new Date(evt.start_time).toISOString().slice(0, 10) : String(evt.start_time));
      const e = end !== undefined ? end : (evt.all_day ? (() => { const d = new Date(evt.end_time); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })() : String(evt.end_time));
      if (start !== undefined && !DATE_ONLY_RE.test(start)) {
        return res.status(400).json({ error: 'all_day events require date-only start (YYYY-MM-DD)' });
      }
      if (end !== undefined && !DATE_ONLY_RE.test(end)) {
        return res.status(400).json({ error: 'all_day events require date-only end (YYYY-MM-DD)' });
      }
      if (DATE_ONLY_RE.test(s) && DATE_ONLY_RE.test(e)) {
        ({ startTime, endTime } = normalizeAllDay(s, e));
      }
    }

    // ---- Case A: Patching an instance (has parent_event_id) ----
    if (evt.parent_event_id) {
      if (recurrence !== undefined) {
        return res.status(400).json({ error: 'Cannot set recurrence on an instance. Patch the parent event instead.' });
      }

      const updates = [];
      const values = [];
      let idx = 1;

      if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
      if (metadata !== undefined) { updates.push(`metadata = $${idx++}`); values.push(JSON.stringify(metadata)); }
      if (start !== undefined || (all_day !== undefined && startTime)) { updates.push(`start_time = $${idx++}`); values.push(startTime || start); }
      if (end !== undefined || (all_day !== undefined && endTime)) { updates.push(`end_time = $${idx++}`); values.push(endTime || end); }
      if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
      if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
      if (attendees !== undefined) { updates.push(`attendees = $${idx++}`); values.push(JSON.stringify(attendees)); }
      if (all_day !== undefined) { updates.push(`all_day = $${idx++}`); values.push(!!all_day); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Mark as exception so rematerialization won't overwrite it
      updates.push(`is_exception = true`);
      updates.push(`updated_at = now()`);

      values.push(req.params.event_id);
      const { rows } = await pool.query(
        `UPDATE events SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      return res.json(formatEvent(rows[0]));
    }

    // ---- Case B: Patching a recurring parent (has recurrence) ----
    if (evt.recurrence) {
      const needsRematerialize = recurrence !== undefined || start !== undefined || end !== undefined || all_day !== undefined;

      // Validate new RRULE if provided
      if (recurrence !== undefined) {
        const dtstart = new Date(startTime || start || evt.start_time);
        const validation = parseAndValidateRRule(recurrence, dtstart);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      // Update the parent row
      const updates = [];
      const values = [];
      let idx = 1;

      if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
      if (metadata !== undefined) { updates.push(`metadata = $${idx++}`); values.push(JSON.stringify(metadata)); }
      if (start !== undefined) { updates.push(`start_time = $${idx++}`); values.push(startTime || start); }
      if (end !== undefined) { updates.push(`end_time = $${idx++}`); values.push(endTime || end); }
      if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
      if (attendees !== undefined) { updates.push(`attendees = $${idx++}`); values.push(JSON.stringify(attendees)); }
      if (recurrence !== undefined) { updates.push(`recurrence = $${idx++}`); values.push(recurrence); }
      if (all_day !== undefined) { updates.push(`all_day = $${idx++}`); values.push(!!all_day); }
      // Don't allow setting status on a parent (it must stay 'recurring')
      if (status !== undefined) {
        return res.status(400).json({ error: 'Cannot change status of a recurring event parent. Delete the series or modify individual instances.' });
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = now()`);

      values.push(req.params.event_id);
      const { rows } = await pool.query(
        `UPDATE events SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      const updatedParent = rows[0];

      if (needsRematerialize) {
        // RRULE or timing changed — delete non-exceptions and recreate
        const instancesCreated = await rematerialize(pool, updatedParent);
        return res.json({
          ...formatEvent(updatedParent),
          instances_created: instancesCreated,
        });
      } else {
        // Template fields changed — propagate to non-exception instances
        const propagateUpdates = [];
        const propagateValues = [];
        let pIdx = 1;

        if (title !== undefined) { propagateUpdates.push(`title = $${pIdx++}`); propagateValues.push(title); }
        if (description !== undefined) { propagateUpdates.push(`description = $${pIdx++}`); propagateValues.push(description); }
        if (location !== undefined) { propagateUpdates.push(`location = $${pIdx++}`); propagateValues.push(location); }
        if (attendees !== undefined) { propagateUpdates.push(`attendees = $${pIdx++}`); propagateValues.push(JSON.stringify(attendees)); }

        if (propagateUpdates.length > 0) {
          propagateUpdates.push(`updated_at = now()`);
          propagateValues.push(updatedParent.id);
          await pool.query(
            `UPDATE events SET ${propagateUpdates.join(', ')} WHERE parent_event_id = $${pIdx} AND is_exception = false`,
            propagateValues
          );
        }

        return res.json(formatEvent(updatedParent));
      }
    }

    // ---- Case C: Patching a standalone event ----
    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (metadata !== undefined) { updates.push(`metadata = $${idx++}`); values.push(JSON.stringify(metadata)); }
    if (start !== undefined) { updates.push(`start_time = $${idx++}`); values.push(startTime || start); }
    if (end !== undefined) { updates.push(`end_time = $${idx++}`); values.push(endTime || end); }
    if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (attendees !== undefined) { updates.push(`attendees = $${idx++}`); values.push(JSON.stringify(attendees)); }
    if (all_day !== undefined) { updates.push(`all_day = $${idx++}`); values.push(!!all_day); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);

    values.push(req.params.event_id);
    const { rows } = await pool.query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(formatEvent(rows[0]));
  } catch (err) {
    await logError(err, { route: 'PATCH /calendars/:id/events/:event_id', method: 'PATCH', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Failed to update event' });
  }
});

/**
 * DELETE /calendars/:id/events/:event_id
 *
 * Query param: ?mode=single|future|all
 *
 * - single (default for instances): cancel this one occurrence
 * - future: cancel this + delete all future instances, add UNTIL to parent
 * - all: delete entire series (parent + all instances via CASCADE)
 *
 * Standalone events are always hard-deleted (no mode needed).
 */
router.delete('/:id/events/:event_id', async (req, res) => {
  try {
    if (!(await verifyCalendarOwnership(req, res))) return;

    const { rows } = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND calendar_id = $2',
      [req.params.event_id, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const evt = rows[0];
    const mode = req.query.mode || 'single';

    // ---- Standalone event: just delete it ----
    if (!evt.parent_event_id && !evt.recurrence) {
      await pool.query('DELETE FROM events WHERE id = $1', [evt.id]);
      return res.status(204).end();
    }

    // ---- Recurring parent: require mode=all ----
    if (evt.recurrence && !evt.parent_event_id) {
      if (mode !== 'all') {
        return res.status(400).json({
          error: 'This is a recurring event series. Use ?mode=all to delete the entire series, or delete individual instances by their instance ID.',
        });
      }
      // CASCADE deletes all instances
      await pool.query('DELETE FROM events WHERE id = $1', [evt.id]);
      return res.status(204).end();
    }

    // ---- Instance of a recurring event ----
    if (mode === 'single') {
      // Cancel this occurrence and mark as exception
      await pool.query(
        "UPDATE events SET status = 'cancelled', is_exception = true, updated_at = now() WHERE id = $1",
        [evt.id]
      );
      return res.status(204).end();

    } else if (mode === 'future') {
      // Cancel this instance
      await pool.query(
        "UPDATE events SET status = 'cancelled', is_exception = true, updated_at = now() WHERE id = $1",
        [evt.id]
      );

      // Delete future non-exception instances
      await pool.query(
        'DELETE FROM events WHERE parent_event_id = $1 AND occurrence_date > $2 AND is_exception = false',
        [evt.parent_event_id, evt.occurrence_date]
      );

      // Cancel future exception instances
      await pool.query(
        "UPDATE events SET status = 'cancelled', updated_at = now() WHERE parent_event_id = $1 AND occurrence_date > $2 AND is_exception = true",
        [evt.parent_event_id, evt.occurrence_date]
      );

      // Add UNTIL to the parent's RRULE
      const { RRule } = require('rrule');
      const parent = await pool.query('SELECT * FROM events WHERE id = $1', [evt.parent_event_id]);
      if (parent.rows.length > 0) {
        const parentEvt = parent.rows[0];
        const options = RRule.parseString(parentEvt.recurrence);
        // Set UNTIL to the day before this occurrence
        const untilDate = new Date(evt.occurrence_date);
        untilDate.setDate(untilDate.getDate() - 1);
        options.until = untilDate;
        delete options.count; // UNTIL and COUNT are mutually exclusive
        options.dtstart = new Date(parentEvt.start_time);
        const updatedRule = new RRule(options);
        // Extract just the RRULE part (without DTSTART)
        const ruleStr = updatedRule.toString().replace(/^DTSTART.*\n/, '').replace('RRULE:', '');

        await pool.query(
          'UPDATE events SET recurrence = $1, updated_at = now() WHERE id = $2',
          [ruleStr, evt.parent_event_id]
        );
      }

      return res.status(204).end();

    } else if (mode === 'all') {
      // Delete the parent — CASCADE handles instances
      await pool.query('DELETE FROM events WHERE id = $1', [evt.parent_event_id]);
      return res.status(204).end();

    } else {
      return res.status(400).json({ error: 'mode must be one of: single, future, all' });
    }
  } catch (err) {
    await logError(err, { route: 'DELETE /calendars/:id/events/:event_id', method: 'DELETE', agent_id: req.agent?.id });
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
    await logError(err, { route: 'POST /calendars/:id/events/:event_id/respond', method: 'POST', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Failed to respond to event' });
  }
});

module.exports = router;
