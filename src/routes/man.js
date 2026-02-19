/**
 * Machine-readable API manual
 *
 * GET /man — returns JSON describing all CalDave endpoints.
 * Auth is optional: if a valid Bearer token is provided, the response
 * includes the agent's real calendar IDs, event counts, and personalized
 * curl examples with a recommended next step.
 */

const { Router } = require('express');
const { pool } = require('../db');
const { hashKey } = require('../lib/keys');
const { logError } = require('../lib/errors');

const router = Router();
const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';
const EMAIL_DOMAIN = process.env.CALDAVE_EMAIL_DOMAIN || 'invite.caldave.ai';
const BASE = `https://${DOMAIN}`;

// ---------------------------------------------------------------------------
// Soft auth — resolve Bearer token if present, never 401
// ---------------------------------------------------------------------------

async function softAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.agent = null;
    return next();
  }
  const token = header.slice(7);
  const hash = hashKey(token);
  try {
    const result = await pool.query(
      'SELECT id, name, description FROM agents WHERE api_key_hash = $1',
      [hash]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      req.agent = { id: row.id, name: row.name, description: row.description };
    } else {
      req.agent = null;
    }
  } catch {
    req.agent = null;
  }
  next();
}

// ---------------------------------------------------------------------------
// Curl builder
// ---------------------------------------------------------------------------

function buildCurl(method, path, { apiKey, calId, evtId, body, queryString } = {}) {
  let resolved = path
    .replace(':id', calId || 'CAL_ID')
    .replace(':event_id', evtId || 'EVT_ID')
    .replace(':calendar_id', calId || 'CAL_ID');

  let url = `${BASE}${resolved}`;
  if (queryString) url += queryString;

  const parts = [];
  if (method === 'GET') {
    parts.push(`curl -s "${url}"`);
  } else {
    parts.push(`curl -s -X ${method} "${url}"`);
  }

  if (apiKey) {
    parts.push(`-H "Authorization: Bearer ${apiKey}"`);
  }

  if (body) {
    parts.push('-H "Content-Type: application/json"');
    parts.push(`-d '${JSON.stringify(body)}'`);
  }

  return parts.join(' \\\n  ');
}

// ---------------------------------------------------------------------------
// Endpoint catalog
// ---------------------------------------------------------------------------

function getEndpoints() {
  return [
    {
      topic: 'agents',
      method: 'POST',
      path: '/agents',
      description: 'Create a new agent identity. Returns agent_id and api_key (shown once — save it). Include name and description — the name appears in outbound email From headers. Pass X-Human-Key header to auto-associate with a human account.',
      auth: 'none (optional X-Human-Key header)',
      parameters: [
        { name: 'name', in: 'body', required: false, type: 'string', description: 'Display name for the agent (max 255 chars). Recommended.' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'What this agent does (max 1024 chars). Recommended.' },
      ],
      example_body: { name: 'My Agent', description: 'Manages team meetings and sends daily summaries' },
      example_response: {
        agent_id: 'agt_x7y8z9AbCd',
        api_key: 'sk_live_abc123...',
        name: 'My Agent',
        description: 'Manages team meetings and sends daily summaries',
        message: 'Store these credentials securely. The API key will not be shown again.',
      },
    },
    {
      topic: 'agents',
      method: 'POST',
      path: '/agents/claim',
      description: 'Claim an existing agent by providing its API key. The agent is immediately associated with your human account.',
      auth: 'X-Human-Key header',
      parameters: [
        { name: 'api_key', in: 'body', required: true, type: 'string', description: 'The agent API key to claim (sk_live_...).' },
      ],
      example_body: { api_key: 'sk_live_abc123...' },
      example_response: {
        agent_id: 'agt_x7y8z9AbCd',
        agent_name: 'My Agent',
        claimed: true,
        owned_by: 'hum_abc123...',
      },
    },
    {
      topic: 'agents',
      method: 'GET',
      path: '/agents/me',
      description: 'Get the authenticated agent profile (name, description, created_at).',
      auth: 'bearer',
      parameters: [],
      example_body: null,
      example_response: {
        agent_id: 'agt_x7y8z9AbCd',
        name: 'My Agent',
        description: 'Manages team meetings and sends daily summaries',
        created_at: '2025-01-15T10:30:00.000Z',
      },
    },
    {
      topic: 'agents',
      method: 'PATCH',
      path: '/agents',
      description: 'Update the authenticated agent name or description. Does not change the API key.',
      auth: 'bearer',
      parameters: [
        { name: 'name', in: 'body', required: false, type: 'string', description: 'New display name (max 255 chars). Set to null to clear.' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'New description (max 1024 chars). Set to null to clear.' },
      ],
      example_body: { name: 'Updated Agent Name' },
      example_response: {
        agent_id: 'agt_x7y8z9AbCd',
        name: 'Updated Agent Name',
        description: 'Manages team meetings and sends daily summaries',
        created_at: '2025-01-15T10:30:00.000Z',
      },
    },
    {
      topic: 'smtp',
      method: 'PUT',
      path: '/agents/smtp',
      description: 'Configure SMTP for outbound emails. When set, all invite and RSVP emails are sent via your SMTP server instead of CalDave built-in delivery.',
      auth: 'bearer',
      parameters: [
        { name: 'host', in: 'body', required: true, type: 'string', description: 'SMTP server hostname' },
        { name: 'port', in: 'body', required: true, type: 'integer', description: 'SMTP port (465 for SSL, 587 for STARTTLS)' },
        { name: 'username', in: 'body', required: true, type: 'string', description: 'SMTP auth username' },
        { name: 'password', in: 'body', required: true, type: 'string', description: 'SMTP auth password (never returned in responses)' },
        { name: 'from', in: 'body', required: true, type: 'string', description: 'From email address for outbound emails' },
        { name: 'secure', in: 'body', required: false, type: 'boolean', description: 'Use implicit TLS (true) or STARTTLS (false). Defaults to true for port 465, false otherwise.' },
      ],
      example_body: { host: 'smtp.agentmail.to', port: 465, username: 'inbox@agentmail.to', password: '...', from: 'inbox@agentmail.to' },
      example_response: { smtp: { host: 'smtp.agentmail.to', port: 465, username: 'inbox@agentmail.to', from: 'inbox@agentmail.to', secure: true, configured: true } },
    },
    {
      topic: 'smtp',
      method: 'GET',
      path: '/agents/smtp',
      description: 'View SMTP configuration (password excluded). Returns null if not configured.',
      auth: 'bearer',
      parameters: [],
      example_body: null,
      example_response: { smtp: { host: 'smtp.agentmail.to', port: 465, username: 'inbox@agentmail.to', from: 'inbox@agentmail.to', secure: true, configured: true } },
    },
    {
      topic: 'smtp',
      method: 'DELETE',
      path: '/agents/smtp',
      description: 'Remove SMTP configuration. Outbound emails revert to CalDave built-in delivery.',
      auth: 'bearer',
      parameters: [],
      example_body: null,
      example_response: { smtp: null, message: 'SMTP configuration removed.' },
    },
    {
      topic: 'smtp',
      method: 'POST',
      path: '/agents/smtp/test',
      description: 'Send a test email to verify SMTP configuration works. Defaults to the configured from address, or specify a custom recipient.',
      auth: 'bearer',
      parameters: [
        { name: 'to', in: 'body', required: false, type: 'string', description: 'Recipient email address (default: the configured from address)' },
      ],
      example_body: { to: 'test@example.com' },
      example_response: { success: true, message_id: '<...>', from: 'inbox@agentmail.to', to: 'test@example.com', message: 'Test email sent successfully.' },
    },
    {
      topic: 'discovery',
      method: 'GET',
      path: '/man',
      description: 'This endpoint. Machine-readable API manual with optional personalized context. Add ?guide to skip the full endpoint catalog, or ?topic= to filter by category.',
      auth: 'none (optional bearer)',
      parameters: [
        { name: 'guide', in: 'query', required: false, type: 'flag', description: 'If present, return only overview, context, and recommended next step (skip endpoint details)' },
        { name: 'topic', in: 'query', required: false, type: 'string', description: 'Filter endpoints by topic. Comma-separated. Options: agents, smtp, calendars, events, feeds, errors' },
      ],
      example_body: null,
      example_response: '{ overview, base_url, your_context, recommended_next_step, endpoints }',
    },
    {
      topic: 'discovery',
      method: 'GET',
      path: '/changelog',
      description: 'API changelog. Lists new features, improvements, and fixes with dates and links to docs. Poll ~weekly to discover new capabilities. With auth, highlights changes since your agent was created.',
      auth: 'none (optional bearer)',
      parameters: [],
      example_body: null,
      example_response: {
        description: 'CalDave API changelog...',
        poll_recommendation: 'Check this endpoint approximately once per week.',
        changelog: [{ date: '2026-02-14', changes: ['...'] }],
      },
    },
    {
      topic: 'calendars',
      method: 'POST',
      path: '/calendars',
      description: 'Create a new calendar for the authenticated agent.',
      auth: 'bearer',
      parameters: [
        { name: 'name', in: 'body', required: true, type: 'string', description: 'Calendar display name' },
        { name: 'timezone', in: 'body', required: false, type: 'string', description: 'IANA timezone (default: UTC)' },
        { name: 'agentmail_api_key', in: 'body', required: false, type: 'string', description: 'AgentMail API key for inbound email attachments' },
        { name: 'webhook_url', in: 'body', required: false, type: 'string', description: 'URL to receive event webhooks' },
        { name: 'webhook_secret', in: 'body', required: false, type: 'string', description: 'Secret for HMAC-SHA256 webhook signatures' },
        { name: 'welcome_event', in: 'body', required: false, type: 'boolean', description: 'Set to false to skip the auto-created welcome event (recommended for production). Defaults to true.' },
      ],
      example_body: { name: 'Work Schedule', timezone: 'America/Denver' },
      example_response: {
        calendar_id: 'cal_a1b2c3XyZ',
        name: 'Work Schedule',
        timezone: 'America/Denver',
        email: `cal-a1b2c3XyZ@${EMAIL_DOMAIN}`,
        ical_feed_url: `${BASE}/feeds/cal_a1b2c3XyZ.ics?token=feed_...`,
        inbound_webhook_url: `${BASE}/inbound/inb_...`,
      },
    },
    {
      topic: 'calendars',
      method: 'GET',
      path: '/calendars',
      description: 'List all calendars for the authenticated agent.',
      auth: 'bearer',
      parameters: [],
      example_body: null,
      example_response: { calendars: ['...'] },
    },
    {
      topic: 'calendars',
      method: 'GET',
      path: '/calendars/:id',
      description: 'Get a single calendar by ID.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID (cal_...)' },
      ],
      example_body: null,
      example_response: { id: 'cal_...', name: '...', timezone: '...', email: '...' },
    },
    {
      topic: 'calendars',
      method: 'PATCH',
      path: '/calendars/:id',
      description: 'Update calendar settings. All fields optional.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'name', in: 'body', required: false, type: 'string', description: 'Calendar display name' },
        { name: 'timezone', in: 'body', required: false, type: 'string', description: 'IANA timezone' },
        { name: 'webhook_url', in: 'body', required: false, type: 'string', description: 'URL to receive event notifications' },
        { name: 'webhook_secret', in: 'body', required: false, type: 'string', description: 'HMAC secret for webhook signatures' },
        { name: 'agentmail_api_key', in: 'body', required: false, type: 'string', description: 'AgentMail API key' },
      ],
      example_body: { name: 'Updated Name', timezone: 'America/New_York' },
      example_response: { id: 'cal_...', name: 'Updated Name', timezone: 'America/New_York' },
    },
    {
      topic: 'calendars',
      method: 'DELETE',
      path: '/calendars/:id',
      description: 'Delete a calendar and all its events. Returns 204.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
      ],
      example_body: null,
      example_response: null,
    },
    {
      topic: 'calendars',
      method: 'POST',
      path: '/calendars/:id/webhook/test',
      description: 'Send a test payload to the calendar webhook URL. Returns the HTTP status code. Verifies webhook configuration before real events fire.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
      ],
      example_body: null,
      example_response: { success: true, status_code: 200, webhook_url: 'https://...', message: 'Webhook delivered successfully.' },
    },
    {
      topic: 'events',
      method: 'POST',
      path: '/calendars/:id/events',
      description: 'Create an event. Supports one-off and recurring (RRULE) events. Fires event.created webhook if calendar has webhook_url.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'title', in: 'body', required: true, type: 'string', description: 'Event title' },
        { name: 'start', in: 'body', required: true, type: 'string', description: 'ISO 8601 datetime, or YYYY-MM-DD when all_day is true' },
        { name: 'end', in: 'body', required: true, type: 'string', description: 'ISO 8601 datetime, or YYYY-MM-DD when all_day is true (inclusive)' },
        { name: 'all_day', in: 'body', required: false, type: 'boolean', description: 'True for all-day events. When true, start/end must be YYYY-MM-DD and end is inclusive.' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'Free text (max 64KB)' },
        { name: 'metadata', in: 'body', required: false, type: 'object', description: 'Structured JSON payload (max 16KB)' },
        { name: 'location', in: 'body', required: false, type: 'string', description: 'Free text or URL' },
        { name: 'status', in: 'body', required: false, type: 'string', description: 'confirmed (default), tentative, cancelled' },
        { name: 'attendees', in: 'body', required: false, type: 'array', description: 'Array of email addresses' },
        { name: 'recurrence', in: 'body', required: false, type: 'string', description: 'RFC 5545 RRULE (e.g. FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR). Alias: rrule' },
      ],
      example_body: { title: 'Team standup', start: '2025-03-01T09:00:00-07:00', end: '2025-03-01T09:15:00-07:00' },
      example_response: { id: 'evt_...', title: 'Team standup', calendar_id: 'cal_...', status: 'confirmed' },
    },
    {
      topic: 'events',
      method: 'GET',
      path: '/calendars/:id/events',
      description: 'List events with optional filters. Returns expanded recurring instances.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'start', in: 'query', required: false, type: 'string', description: 'Filter: events starting after this datetime' },
        { name: 'end', in: 'query', required: false, type: 'string', description: 'Filter: events starting before this datetime' },
        { name: 'status', in: 'query', required: false, type: 'string', description: 'Filter by status (confirmed, tentative, cancelled)' },
        { name: 'limit', in: 'query', required: false, type: 'number', description: 'Max results (default 50, max 200)' },
        { name: 'offset', in: 'query', required: false, type: 'number', description: 'Pagination offset (default 0)' },
      ],
      example_body: null,
      example_response: { events: ['...'] },
    },
    {
      topic: 'events',
      method: 'GET',
      path: '/calendars/:id/events/:event_id',
      description: 'Get a single event by ID.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID (evt_...)' },
      ],
      example_body: null,
      example_response: { id: 'evt_...', title: '...', start_time: '...', end_time: '...', status: '...' },
    },
    {
      topic: 'events',
      method: 'PATCH',
      path: '/calendars/:id/events/:event_id',
      description: 'Update an event. Patching a recurring instance marks it as an exception; patching the parent propagates to non-exception instances. Fires event.updated webhook.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID' },
        { name: 'title', in: 'body', required: false, type: 'string', description: 'Event title' },
        { name: 'start', in: 'body', required: false, type: 'string', description: 'New start time (YYYY-MM-DD for all-day events)' },
        { name: 'end', in: 'body', required: false, type: 'string', description: 'New end time (YYYY-MM-DD for all-day events, inclusive)' },
        { name: 'all_day', in: 'body', required: false, type: 'boolean', description: 'Toggle all-day mode on/off' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'Free text' },
        { name: 'metadata', in: 'body', required: false, type: 'object', description: 'JSON payload' },
        { name: 'location', in: 'body', required: false, type: 'string', description: 'Location' },
        { name: 'status', in: 'body', required: false, type: 'string', description: 'confirmed, tentative, cancelled' },
        { name: 'attendees', in: 'body', required: false, type: 'array', description: 'Array of emails' },
        { name: 'recurrence', in: 'body', required: false, type: 'string', description: 'Updated RRULE (parent only — triggers rematerialization). Alias: rrule' },
      ],
      example_body: { title: 'Updated title', location: 'Room 42' },
      example_response: { id: 'evt_...', title: 'Updated title', location: 'Room 42' },
    },
    {
      topic: 'events',
      method: 'DELETE',
      path: '/calendars/:id/events/:event_id',
      description: 'Delete an event. For recurring instances, use the mode query parameter. Fires event.deleted webhook.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID' },
        { name: 'mode', in: 'query', required: false, type: 'string', description: 'single (default) — cancel this instance | future — cancel this + future | all — delete entire series' },
      ],
      example_body: null,
      example_response: null,
    },
    {
      topic: 'events',
      method: 'GET',
      path: '/calendars/:id/upcoming',
      description: 'Get the next N events from now. Designed for agent polling.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'limit', in: 'query', required: false, type: 'number', description: 'Number of events (default 5, max 50)' },
      ],
      example_body: null,
      example_response: { events: ['...'], next_event_starts_in: 'PT14M30S' },
    },
    {
      topic: 'events',
      method: 'GET',
      path: '/calendars/:id/view',
      description: 'Plain text table of upcoming events. Returns text/plain.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'limit', in: 'query', required: false, type: 'number', description: 'Number of events (default 10, max 50)' },
      ],
      example_body: null,
      example_response: '(text/plain table)',
    },
    {
      topic: 'events',
      method: 'POST',
      path: '/calendars/:id/events/:event_id/respond',
      description: 'Accept or decline an inbound calendar invite. Fires event.responded webhook.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID' },
        { name: 'response', in: 'body', required: true, type: 'string', description: 'accepted, declined, or tentative' },
      ],
      example_body: { response: 'accepted' },
      example_response: { id: 'evt_...', status: 'confirmed', response: 'accepted', email_sent: true },
    },
    {
      topic: 'feeds',
      method: 'GET',
      path: '/feeds/:calendar_id.ics',
      description: 'Read-only iCalendar feed. Subscribe from Google Calendar, Apple Calendar, or any iCal app. The feed_token is returned when you create a calendar.',
      auth: 'feed_token',
      parameters: [
        { name: 'calendar_id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'token', in: 'query', required: true, type: 'string', description: 'Feed token (feed_...)' },
      ],
      example_body: null,
      example_response: '(text/calendar iCal data)',
    },
    {
      topic: 'feeds',
      method: 'POST',
      path: '/inbound/:token',
      description: 'Inbound email endpoint. Receives forwarded .ics invites and creates calendar events from them. Each calendar has a unique inbound URL returned at creation. Supports Postmark and AgentMail.',
      auth: 'url_token',
      parameters: [
        { name: 'token', in: 'path', required: true, type: 'string', description: 'Inbound token (inb_...)' },
      ],
      example_body: null,
      example_response: { status: 'created', event_id: 'evt_...' },
    },
    {
      topic: 'errors',
      method: 'GET',
      path: '/errors',
      description: 'Query recent API errors for your agent.',
      auth: 'bearer',
      parameters: [
        { name: 'limit', in: 'query', required: false, type: 'number', description: 'Max results (default 50, max 200)' },
        { name: 'route', in: 'query', required: false, type: 'string', description: 'Filter by route pattern' },
      ],
      example_body: null,
      example_response: { errors: ['...'], count: 0 },
    },
    {
      topic: 'errors',
      method: 'GET',
      path: '/errors/:id',
      description: 'Get a single error with full stack trace.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'number', description: 'Error log ID' },
      ],
      example_body: null,
      example_response: { id: 1, route: '...', method: '...', message: '...', stack: '...' },
    },
  ];
}

// Pre-compute at module load (static data, never changes at runtime)
const CACHED_ENDPOINTS = getEndpoints();

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

function buildRecommendation(context, apiKey, calId) {
  if (!context.authenticated) {
    return {
      action: 'Create an agent',
      description: 'You are not authenticated. Create an agent to get an API key, then pass it as a Bearer token to access all endpoints.',
      endpoint: 'POST /agents',
      curl: buildCurl('POST', '/agents', {
        body: { name: 'My Agent', description: 'Brief description of what this agent does' },
      }),
    };
  }

  if (!context.agent_name) {
    return {
      action: 'Name your agent',
      description: 'Your agent has no name. Setting a name is recommended — it appears in outbound email From headers and makes your agent easier to identify.',
      endpoint: 'PATCH /agents',
      curl: buildCurl('PATCH', '/agents', {
        apiKey,
        body: { name: 'My Agent', description: 'Brief description of what this agent does' },
      }),
    };
  }

  if (context.calendars.length === 0) {
    return {
      action: 'Create a calendar',
      description: 'You have an agent but no calendars yet. Create one to start managing events.',
      endpoint: 'POST /calendars',
      curl: buildCurl('POST', '/calendars', {
        apiKey,
        body: { name: 'My Calendar', timezone: 'UTC' },
      }),
    };
  }

  // Each new calendar gets an auto-created welcome event, so <= 1 means
  // the agent hasn't created any events of their own yet.
  const hasOwnEvents = context.calendars.some(c => c.event_count > 1);
  if (!hasOwnEvents) {
    return {
      action: 'Create an event',
      description: 'You have a calendar but haven\'t created any events yet. New calendars include a welcome event, but try creating your own.',
      endpoint: 'POST /calendars/:id/events',
      curl: buildCurl('POST', '/calendars/:id/events', {
        apiKey,
        calId,
        body: { title: 'My first event', start: '2025-03-01T10:00:00Z', end: '2025-03-01T11:00:00Z' },
      }),
    };
  }

  if (!context.claimed) {
    return {
      action: 'Claim this agent with a human account',
      description: 'This agent has calendars and events but isn\'t claimed by a human account. Claiming lets you manage API keys from a dashboard and prevents losing access.',
      endpoint: 'POST /agents/claim',
      curl: 'curl -s -X POST "' + BASE + '/agents/claim" -H "Content-Type: application/json" -H "X-Human-Key: hk_live_YOUR_HUMAN_KEY" -d \'{"api_key": "sk_live_YOUR_AGENT_KEY"}\'',
      signup_url: BASE + '/signup',
    };
  }

  const withEvents = context.calendars.find(c => c.event_count > 1) || context.calendars[0];
  return {
    action: 'Check upcoming events',
    description: 'You have calendars with events. Poll for upcoming events to drive agent scheduling.',
    endpoint: 'GET /calendars/:id/upcoming',
    curl: buildCurl('GET', '/calendars/:id/upcoming', {
      apiKey,
      calId: withEvents.id,
    }),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.get('/', softAuth, async (req, res) => {
  try {
    const apiKey = 'YOUR_API_KEY';
    const context = {
      authenticated: false,
      agent_id: null,
      agent_name: null,
      agent_description: null,
      calendars: [],
      claimed: false,
    };

    let calId = null;
    let evtId = null;

    if (req.agent) {
      context.authenticated = true;
      context.agent_id = req.agent.id;
      context.agent_name = req.agent.name || null;
      context.agent_description = req.agent.description || null;

      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.timezone, c.email,
                COUNT(e.id) FILTER (WHERE e.status != 'recurring') AS event_count
         FROM calendars c
         LEFT JOIN events e ON e.calendar_id = c.id
         WHERE c.agent_id = $1
         GROUP BY c.id
         ORDER BY c.created_at`,
        [req.agent.id]
      );

      context.calendars = rows.map(r => ({
        id: r.id,
        name: r.name,
        timezone: r.timezone,
        email: r.email,
        event_count: parseInt(r.event_count, 10),
      }));

      if (context.calendars.length > 0) {
        calId = context.calendars[0].id;
      }

      // Check if agent is claimed by a human account
      const { rows: claimed } = await pool.query(
        'SELECT 1 FROM human_agents WHERE agent_id = $1 LIMIT 1',
        [req.agent.id]
      );
      context.claimed = claimed.length > 0;
    }

    const recommendation = buildRecommendation(context, apiKey, calId);

    const ERROR_FORMAT = {
      shape: '{ "error": "Human-readable message" }',
      status_codes: {
        200: 'Success',
        201: 'Created',
        204: 'Deleted (no body)',
        400: 'Validation error — check the error message for details',
        401: 'Missing or invalid API key',
        404: 'Resource not found',
        429: 'Rate limited — check RateLimit-Reset header',
        500: 'Server error — retry or check GET /errors',
      },
      notes: 'All error responses return JSON with a single "error" key containing a human-readable message. Rate limit headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset) are included on every response.',
    };

    const AVAILABLE_TOPICS = ['agents', 'smtp', 'calendars', 'events', 'feeds', 'errors'];

    // guide mode: skip the full endpoint catalog
    const guide = 'guide' in req.query;
    if (guide) {
      return res.json({
        overview: 'CalDave is a calendar-as-a-service API for AI agents. Create calendars, manage events, receive invites from humans via email, and subscribe from Google Calendar.',
        base_url: BASE,
        rate_limits: { api: '1000/min', agent_creation: '20/hour', inbound: '60/min' },
        error_format: ERROR_FORMAT,
        webhook_verification: {
          header: 'X-CalDave-Signature',
          algorithm: 'HMAC-SHA256(webhook_secret, raw_request_body)',
          format: 'hex digest',
          note: 'Set webhook_secret on a calendar via POST/PATCH /calendars. Use constant-time comparison (crypto.timingSafeEqual or hmac.compare_digest). Verify against the raw body string, not re-serialized JSON.',
          docs: BASE + '/docs#webhook-verification',
        },
        your_context: context,
        recommended_next_step: recommendation,
        discover_more: {
          full_api_reference: 'GET ' + BASE + '/man (without ?guide) returns all endpoints with curl examples and parameters.',
          changelog: 'GET ' + BASE + '/changelog (with Bearer auth) shows new features since you signed up and personalized recommendations.',
          update_agent: 'PATCH ' + BASE + '/agents lets you set a name and description for your agent.',
        },
      });
    }

    // Topic filtering
    const topicParam = req.query.topic;
    let rawEndpoints = CACHED_ENDPOINTS;
    if (topicParam) {
      const topics = topicParam.split(',').map(t => t.trim().toLowerCase());
      const validTopics = topics.filter(t => AVAILABLE_TOPICS.includes(t));
      if (validTopics.length === 0) {
        return res.status(400).json({
          error: 'Unknown topic: ' + topicParam + '. Available: ' + AVAILABLE_TOPICS.join(', '),
        });
      }
      // Always include discovery endpoints alongside requested topics
      rawEndpoints = rawEndpoints.filter(ep =>
        validTopics.includes(ep.topic) || ep.topic === 'discovery'
      );
    }

    const endpoints = rawEndpoints.map(ep => {
      const needsAuth = ep.auth === 'bearer';
      const curlOpts = {};
      if (needsAuth) curlOpts.apiKey = apiKey;
      if (calId) curlOpts.calId = calId;
      if (evtId) curlOpts.evtId = evtId;
      if (ep.example_body) curlOpts.body = ep.example_body;

      // Special cases for non-bearer auth
      if (ep.auth === 'feed_token') {
        return {
          method: ep.method,
          path: ep.path,
          description: ep.description,
          auth: ep.auth,
          parameters: ep.parameters,
          example_curl: `curl -s "${BASE}/feeds/${calId || 'CAL_ID'}.ics?token=FEED_TOKEN"`,
          example_response: ep.example_response,
        };
      }
      if (ep.auth === 'url_token') {
        return {
          method: ep.method,
          path: ep.path,
          description: ep.description,
          auth: ep.auth,
          parameters: ep.parameters,
          example_curl: `curl -s -X POST ${BASE}/inbound/INB_TOKEN`,
          example_response: ep.example_response,
        };
      }

      return {
        method: ep.method,
        path: ep.path,
        description: ep.description,
        auth: ep.auth,
        parameters: ep.parameters,
        example_curl: buildCurl(ep.method, ep.path, curlOpts),
        example_response: ep.example_response,
      };
    });

    const response = {
      overview: 'CalDave is a calendar-as-a-service API for AI agents. Create calendars, manage events, receive invites from humans via email, and subscribe from Google Calendar.',
      base_url: BASE,
      available_topics: AVAILABLE_TOPICS,
      rate_limits: {
        api: '1000 requests/minute per IP',
        agent_creation: '20 requests/hour per IP',
        inbound_webhooks: '60 requests/minute per IP',
        headers: 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset (RFC draft-7)',
      },
      error_format: ERROR_FORMAT,
      webhook_verification: {
        header: 'X-CalDave-Signature',
        algorithm: 'HMAC-SHA256(webhook_secret, raw_request_body)',
        format: 'hex digest',
        note: 'Set webhook_secret on a calendar via POST/PATCH /calendars. Use constant-time comparison (crypto.timingSafeEqual or hmac.compare_digest). Verify against the raw body string, not re-serialized JSON.',
        docs: BASE + '/docs#webhook-verification',
      },
      your_context: context,
      recommended_next_step: recommendation,
      endpoints,
    };
    if (topicParam) response.topic = topicParam;

    res.json(response);
  } catch (err) {
    logError(err, { route: 'GET /man', method: 'GET', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
