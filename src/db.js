/**
 * Database connection pool and schema initialization
 *
 * Exports:
 *   pool      — pg.Pool instance (used by all queries)
 *   initSchema() — creates tables and indexes (idempotent)
 *
 * Schema is created at server startup via CREATE TABLE IF NOT EXISTS.
 * No migration tool needed for v1.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Create all tables and indexes. Safe to call on every startup.
 */
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id              text PRIMARY KEY,
      api_key_hash    text NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id              text PRIMARY KEY,
      agent_id        text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      name            text NOT NULL,
      timezone        text NOT NULL DEFAULT 'UTC',
      email           text UNIQUE,
      feed_token      text,
      webhook_url     text,
      webhook_secret  text,
      webhook_offsets jsonb DEFAULT '[\"-5m\"]',
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id              text PRIMARY KEY,
      calendar_id     text NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      title           text NOT NULL,
      description     text,
      metadata        jsonb,
      start_time      timestamptz NOT NULL,
      end_time        timestamptz NOT NULL,
      location        text,
      status          text NOT NULL DEFAULT 'confirmed',
      source          text NOT NULL DEFAULT 'api',
      recurrence      text,
      attendees       jsonb,
      organiser_email text,
      ical_uid        text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_events_calendar_start
      ON events (calendar_id, start_time);

    CREATE INDEX IF NOT EXISTS idx_events_calendar_status
      ON events (calendar_id, status);

    CREATE INDEX IF NOT EXISTS idx_calendars_email
      ON calendars (email);

    CREATE INDEX IF NOT EXISTS idx_calendars_agent
      ON calendars (agent_id);
  `);
}

module.exports = { pool, initSchema };
