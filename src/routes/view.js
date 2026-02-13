/**
 * Calendar view route
 *
 * GET /calendars/:id/view — plain text table of upcoming events
 * Query params: limit (default 10, max 50)
 */

const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

router.get('/:id/view', async (req, res) => {
  try {
    // Verify calendar belongs to this agent
    const { rows: cals } = await pool.query(
      'SELECT id, name, timezone FROM calendars WHERE id = $1 AND agent_id = $2',
      [req.params.id, req.agent.id]
    );
    if (cals.length === 0) {
      res.type('text').status(404).send('Calendar not found.\n');
      return;
    }

    const cal = cals[0];
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const { rows } = await pool.query(
      `SELECT title, start_time, end_time, location, status FROM events
       WHERE calendar_id = $1
         AND start_time >= now()
         AND status NOT IN ('cancelled', 'recurring')
       ORDER BY start_time ASC
       LIMIT $2`,
      [req.params.id, limit]
    );

    // Column widths
    const tw = 30, sw = 22, ew = 22, lw = 20, stw = 10;
    const header = pad('TITLE', tw) + pad('START', sw) + pad('END', ew) + pad('LOCATION', lw) + pad('STATUS', stw);
    const sep = '-'.repeat(header.length);

    let out = `${cal.name} (${cal.id})`;
    if (cal.timezone) out += `  tz: ${cal.timezone}`;
    out += '\n' + sep + '\n' + header + '\n' + sep + '\n';

    if (rows.length === 0) {
      out += 'No upcoming events.\n';
    } else {
      for (const r of rows) {
        out += pad(r.title || '(untitled)', tw)
          + pad(fmtDate(r.start_time), sw)
          + pad(fmtDate(r.end_time), ew)
          + pad(r.location || '—', lw)
          + pad(r.status || 'confirmed', stw)
          + '\n';
      }
    }

    out += sep + '\n' + `${rows.length} event(s)\n`;

    res.type('text').send(out);
  } catch (err) {
    res.type('text').status(500).send('Internal error.\n');
  }
});

module.exports = router;
