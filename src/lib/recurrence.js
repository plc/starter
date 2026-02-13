/**
 * Recurrence engine — RRULE parsing, materialization, and horizon management
 *
 * Recurring events are stored as a "parent" row with an RRULE string in the
 * `recurrence` column and `status = 'recurring'`. Individual occurrences are
 * materialized as separate event rows linked via `parent_event_id`.
 *
 * Functions:
 *   parseAndValidateRRule(rruleString, dtstart) — parse + validate
 *   materializeInstances(pool, parentEvent, fromDate, toDate) — create instance rows
 *   rematerialize(pool, parentEvent) — delete non-exceptions, re-create
 *   extendHorizon(pool, parentEvent, newHorizon) — extend materialization window
 *   extendAllHorizons(pool) — extend all recurring events that need it
 */

const { RRule } = require('rrule');
const { eventId } = require('./ids');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATERIALIZE_WINDOW_DAYS = 90;
const EXTEND_THRESHOLD_DAYS = 60;
const EXTEND_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_INSTANCES_PER_WINDOW = 1000;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse an RRULE string and validate it against the materialization limits.
 *
 * @param {string} rruleString  e.g. "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
 * @param {Date}   dtstart      start time of the parent event
 * @returns {{ valid: boolean, rule?: RRule, error?: string }}
 */
function parseAndValidateRRule(rruleString, dtstart) {
  try {
    const options = RRule.parseString(rruleString);

    // Reject SECONDLY and MINUTELY — expansion is too expensive (can block event loop for 18s+)
    if (options.freq === RRule.SECONDLY) {
      return { valid: false, error: 'FREQ=SECONDLY is not supported' };
    }
    if (options.freq === RRule.MINUTELY) {
      return { valid: false, error: 'FREQ=MINUTELY is not supported' };
    }

    options.dtstart = dtstart;
    const rule = new RRule(options);

    // Guard against absurd frequencies
    const windowEnd = new Date(dtstart.getTime() + MATERIALIZE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const instances = rule.between(dtstart, windowEnd, true);

    if (instances.length > MAX_INSTANCES_PER_WINDOW) {
      return {
        valid: false,
        error: `Recurrence rule generates too many instances (${instances.length} in ${MATERIALIZE_WINDOW_DAYS} days, max ${MAX_INSTANCES_PER_WINDOW})`,
      };
    }

    if (instances.length === 0) {
      return { valid: false, error: 'Recurrence rule generates no instances in the next 90 days' };
    }

    return { valid: true, rule };
  } catch (err) {
    return { valid: false, error: `Invalid recurrence rule: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

/**
 * Materialize event instances for a parent recurring event within [fromDate, toDate].
 *
 * Inserts rows into the events table. Uses ON CONFLICT DO NOTHING on the
 * (parent_event_id, occurrence_date) unique index to avoid duplicates.
 *
 * @param {import('pg').Pool} pool
 * @param {object} parentEvent  — full row from events table
 * @param {Date}   fromDate
 * @param {Date}   toDate
 * @returns {Promise<number>} number of instances created
 */
async function materializeInstances(pool, parentEvent, fromDate, toDate) {
  const options = RRule.parseString(parentEvent.recurrence);
  options.dtstart = new Date(parentEvent.start_time);
  const rule = new RRule(options);

  const dates = rule.between(fromDate, toDate, true);

  if (dates.length === 0) return 0;

  // Compute duration from parent's start/end
  const parentStart = new Date(parentEvent.start_time).getTime();
  const parentEnd = new Date(parentEvent.end_time).getTime();
  const durationMs = parentEnd - parentStart;

  // Strip internal metadata keys before copying to instances
  let instanceMetadata = null;
  if (parentEvent.metadata) {
    const meta = typeof parentEvent.metadata === 'string'
      ? JSON.parse(parentEvent.metadata)
      : parentEvent.metadata;
    const cleaned = { ...meta };
    delete cleaned._materialized_until;
    instanceMetadata = Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
  }

  let created = 0;

  // Batch insert in groups of 50 to keep query sizes manageable
  const batchSize = 50;
  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const date of batch) {
      const instanceStart = date;
      const instanceEnd = new Date(date.getTime() + durationMs);
      const occurrenceDate = date.toISOString().slice(0, 10); // YYYY-MM-DD
      const id = eventId();

      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
      );
      values.push(
        id,
        parentEvent.calendar_id,
        parentEvent.title,
        parentEvent.description || null,
        instanceMetadata,
        instanceStart,
        instanceEnd,
        parentEvent.location || null,
        'confirmed',
        parentEvent.id,          // parent_event_id
        occurrenceDate,          // occurrence_date
        parentEvent.attendees ? (typeof parentEvent.attendees === 'string' ? parentEvent.attendees : JSON.stringify(parentEvent.attendees)) : null,
        !!parentEvent.all_day,
      );
    }

    const result = await pool.query(
      `INSERT INTO events (id, calendar_id, title, description, metadata, start_time, end_time, location, status, parent_event_id, occurrence_date, attendees, all_day)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (parent_event_id, occurrence_date) WHERE parent_event_id IS NOT NULL
       DO NOTHING`,
      values
    );

    created += result.rowCount;
  }

  return created;
}

/**
 * Delete non-exception instances and re-materialize for the standard window.
 * Called when the parent's RRULE or timing changes.
 *
 * @param {import('pg').Pool} pool
 * @param {object} parentEvent  — updated parent row
 * @returns {Promise<number>} number of new instances created
 */
async function rematerialize(pool, parentEvent) {
  // Delete all non-exception instances
  await pool.query(
    'DELETE FROM events WHERE parent_event_id = $1 AND is_exception = false',
    [parentEvent.id]
  );

  const now = new Date();
  const horizon = new Date(now.getTime() + MATERIALIZE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const created = await materializeInstances(pool, parentEvent, now, horizon);

  // Update the parent's materialization horizon
  await updateMaterializedUntil(pool, parentEvent.id, horizon);

  return created;
}

// ---------------------------------------------------------------------------
// Horizon management
// ---------------------------------------------------------------------------

/**
 * Update the _materialized_until key in the parent's metadata.
 */
async function updateMaterializedUntil(pool, parentId, horizon) {
  await pool.query(
    `UPDATE events
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify({ _materialized_until: horizon.toISOString() }), parentId]
  );
}

/**
 * Extend the materialization horizon for a single parent event.
 *
 * @param {import('pg').Pool} pool
 * @param {object} parentEvent  — parent row
 * @param {Date}   newHorizon
 * @returns {Promise<number>} instances created
 */
async function extendHorizon(pool, parentEvent, newHorizon) {
  const meta = parentEvent.metadata || {};
  const currentHorizon = meta._materialized_until
    ? new Date(meta._materialized_until)
    : new Date();

  if (currentHorizon >= newHorizon) return 0;

  const created = await materializeInstances(pool, parentEvent, currentHorizon, newHorizon);
  await updateMaterializedUntil(pool, parentEvent.id, newHorizon);
  return created;
}

/**
 * Extend materialization horizons for all recurring events that need it.
 * Called at startup and periodically via setInterval.
 *
 * @param {import('pg').Pool} pool
 */
async function extendAllHorizons(pool) {
  const { rows: parents } = await pool.query(
    "SELECT * FROM events WHERE recurrence IS NOT NULL AND status = 'recurring'"
  );

  const now = new Date();
  const thresholdDate = new Date(now.getTime() + EXTEND_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const newHorizon = new Date(now.getTime() + MATERIALIZE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let totalCreated = 0;

  for (const parent of parents) {
    const meta = parent.metadata || {};
    const currentHorizon = meta._materialized_until
      ? new Date(meta._materialized_until)
      : new Date(0); // force extension if never materialized

    if (currentHorizon < thresholdDate) {
      try {
        const created = await extendHorizon(pool, parent, newHorizon);
        totalCreated += created;
      } catch (err) {
        console.error(`Failed to extend horizon for ${parent.id}:`, err.message);
      }
    }
  }

  if (totalCreated > 0) {
    console.log(`Horizon extension: created ${totalCreated} instances across ${parents.length} recurring events`);
  }
}

module.exports = {
  parseAndValidateRRule,
  materializeInstances,
  rematerialize,
  extendHorizon,
  extendAllHorizons,
  updateMaterializedUntil,
  MATERIALIZE_WINDOW_DAYS,
  EXTEND_THRESHOLD_DAYS,
  EXTEND_INTERVAL_MS,
  MAX_INSTANCES_PER_WINDOW,
};
