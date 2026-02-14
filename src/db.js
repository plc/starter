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
const { inboundToken } = require('./lib/ids');

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
      name            text,
      description     text,
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
      inbound_token   text UNIQUE,
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

    -- Agent metadata columns (backfill for existing DBs)
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS name text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS description text;

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_events_calendar_start
      ON events (calendar_id, start_time);

    CREATE INDEX IF NOT EXISTS idx_events_calendar_status
      ON events (calendar_id, status);

    CREATE INDEX IF NOT EXISTS idx_calendars_email
      ON calendars (email);

    CREATE INDEX IF NOT EXISTS idx_calendars_agent
      ON calendars (agent_id);

    -- Per-calendar inbound webhook token
    ALTER TABLE calendars ADD COLUMN IF NOT EXISTS inbound_token text UNIQUE;

    CREATE INDEX IF NOT EXISTS idx_calendars_inbound_token
      ON calendars (inbound_token)
      WHERE inbound_token IS NOT NULL;

    -- Recurring event support: link instances to parent series
    ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id text REFERENCES events(id) ON DELETE CASCADE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS occurrence_date date;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS idx_events_parent
      ON events (parent_event_id);

    -- Prevent duplicate instances for the same parent + date
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_parent_occurrence
      ON events (parent_event_id, occurrence_date)
      WHERE parent_event_id IS NOT NULL;

    -- Fast lookup by ical_uid for inbound email updates/cancellations
    CREATE INDEX IF NOT EXISTS idx_events_ical_uid
      ON events (calendar_id, ical_uid)
      WHERE ical_uid IS NOT NULL;

    -- All-day event support
    ALTER TABLE events ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

    -- Per-calendar AgentMail API key for fetching attachments
    ALTER TABLE calendars ADD COLUMN IF NOT EXISTS agentmail_api_key text;

    -- Outbound email tracking
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_sent boolean NOT NULL DEFAULT false;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS reply_sent text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS ical_sequence integer NOT NULL DEFAULT 0;

    -- Postmark webhook events for email deliverability debugging
    CREATE TABLE IF NOT EXISTS postmark_webhooks (
      id            serial PRIMARY KEY,
      record_type   text NOT NULL,
      message_id    text,
      recipient     text,
      tag           text,
      error_code    text,
      error_message text,
      payload       jsonb,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_postmark_webhooks_created
      ON postmark_webhooks (created_at DESC);

    -- Error log for tracking API errors
    CREATE TABLE IF NOT EXISTS error_log (
      id            serial PRIMARY KEY,
      route         text,
      method        text,
      status_code   integer,
      message       text NOT NULL,
      stack         text,
      agent_id      text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_error_log_created
      ON error_log (created_at DESC);

    -- Agent SMTP configuration (optional, replaces Postmark when set)
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS smtp_host text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS smtp_port integer;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS smtp_user text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS smtp_pass text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS smtp_from text;
  `);

  // Backfill inbound_token for existing calendars that don't have one
  const { rows: missing } = await pool.query(
    'SELECT id FROM calendars WHERE inbound_token IS NULL'
  );
  for (const cal of missing) {
    await pool.query(
      'UPDATE calendars SET inbound_token = $1 WHERE id = $2',
      [inboundToken(), cal.id]
    );
  }
}

module.exports = { pool, initSchema };
