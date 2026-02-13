/**
 * Error logging utility — writes errors to the error_log table.
 *
 * Usage:
 *   const { logError } = require('../lib/errors');
 *
 *   catch (err) {
 *     await logError(err, { route: 'POST /events', agent_id: req.agent?.id });
 *     res.status(500).json({ error: 'Failed to create event' });
 *   }
 */

const { pool } = require('../db');

/**
 * Log an error to the error_log table. Never throws — falls back to console.error.
 *
 * @param {Error|string} err
 * @param {object} [ctx]
 * @param {string} [ctx.route]    — e.g. "POST /calendars/:id/events"
 * @param {string} [ctx.method]   — HTTP method
 * @param {number} [ctx.status_code] — HTTP status returned
 * @param {string} [ctx.agent_id]
 */
async function logError(err, ctx = {}) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : null;

  // Always log to console too
  console.error(ctx.route || 'Error:', message);

  try {
    await pool.query(
      `INSERT INTO error_log (route, method, status_code, message, stack, agent_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ctx.route || null,
        ctx.method || null,
        ctx.status_code || 500,
        message,
        stack || null,
        ctx.agent_id || null,
      ]
    );
  } catch (dbErr) {
    // Last resort — don't let logging failures break the app
    console.error('Failed to write error_log:', dbErr.message);
  }
}

module.exports = { logError };
