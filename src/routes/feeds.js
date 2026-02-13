/**
 * iCal feed routes
 *
 * GET /feeds/:calendar_id.ics?token=:feed_token
 *
 * Read-only iCalendar feed. Authenticated by feed_token query param
 * (not Bearer token). Returns text/calendar content that can be
 * subscribed to from Google Calendar, Apple Calendar, etc.
 */

const { Router } = require('express');
const { default: ical } = require('ical-generator');
const { pool } = require('../db');
const { logError } = require('../lib/errors');

const router = Router();

const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';

/**
 * GET /feeds/:calendar_id.ics?token=:feed_token
 */
router.get('/:calendar_id.ics', async (req, res) => {
  const { calendar_id } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({ error: 'Missing token parameter' });
  }

  try {
    // Look up calendar by ID and verify feed token
    const calResult = await pool.query(
      'SELECT * FROM calendars WHERE id = $1 AND feed_token = $2',
      [calendar_id, token]
    );

    if (calResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid calendar or token' });
    }

    const cal = calResult.rows[0];

    // Fetch all non-cancelled, non-parent events for this calendar
    const evtResult = await pool.query(
      `SELECT * FROM events
       WHERE calendar_id = $1 AND status NOT IN ('cancelled', 'recurring')
       ORDER BY start_time ASC`,
      [calendar_id]
    );

    // Build the iCal feed
    const calendar = ical({
      name: cal.name,
      timezone: cal.timezone,
      prodId: { company: 'CalDave', product: 'CalDave', language: 'EN' },
      url: `https://${DOMAIN}/feeds/${calendar_id}.ics?token=${token}`,
    });

    for (const evt of evtResult.rows) {
      const eventOpts = {
        id: evt.id,
        start: evt.start_time,
        end: evt.end_time,
        summary: evt.title,
        description: evt.description || undefined,
        location: evt.location || undefined,
        timestamp: evt.created_at,
      };

      if (evt.all_day) {
        eventOpts.allDay = true;
      }

      const event = calendar.createEvent(eventOpts);

      if (evt.attendees) {
        const attendees = typeof evt.attendees === 'string'
          ? JSON.parse(evt.attendees)
          : evt.attendees;
        for (const email of attendees) {
          event.createAttendee({ email });
        }
      }

      if (evt.status === 'tentative') {
        event.status('TENTATIVE');
      } else if (evt.status === 'confirmed') {
        event.status('CONFIRMED');
      }
    }

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `inline; filename="${calendar_id}.ics"`);
    res.send(calendar.toString());
  } catch (err) {
    await logError(err, { route: 'GET /feeds/:id.ics', method: 'GET' });
    res.status(500).json({ error: 'Failed to generate feed' });
  }
});

module.exports = router;
