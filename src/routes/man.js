/**
 * Machine-readable API manual
 *
 * POST /man — returns JSON describing all CalDave endpoints.
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
      'SELECT id FROM agents WHERE api_key_hash = $1',
      [hash]
    );
    req.agent = result.rows.length > 0 ? { id: result.rows[0].id } : null;
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
    parts.push(`curl -s ${url}`);
  } else {
    parts.push(`curl -s -X ${method} ${url}`);
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
      method: 'POST',
      path: '/agents',
      description: 'Create a new agent identity. Returns agent_id and api_key (shown once — save it).',
      auth: 'none',
      parameters: [],
      example_body: null,
      example_response: {
        agent_id: 'agt_x7y8z9AbCd',
        api_key: 'sk_live_abc123...',
        message: 'Store these credentials securely. The API key will not be shown again.',
      },
    },
    {
      method: 'POST',
      path: '/man',
      description: 'This endpoint. Machine-readable API manual with optional personalized context. Add ?guide to skip the full endpoint catalog.',
      auth: 'none (optional bearer)',
      parameters: [
        { name: 'guide', in: 'query', required: false, type: 'flag', description: 'If present, return only overview, context, and recommended next step (skip endpoint details)' },
      ],
      example_body: null,
      example_response: '{ overview, base_url, your_context, recommended_next_step, endpoints }',
    },
    {
      method: 'POST',
      path: '/calendars',
      description: 'Create a new calendar for the authenticated agent.',
      auth: 'bearer',
      parameters: [
        { name: 'name', in: 'body', required: true, type: 'string', description: 'Calendar display name' },
        { name: 'timezone', in: 'body', required: false, type: 'string', description: 'IANA timezone (default: UTC)' },
        { name: 'agentmail_api_key', in: 'body', required: false, type: 'string', description: 'AgentMail API key for inbound email attachments' },
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
      method: 'GET',
      path: '/calendars',
      description: 'List all calendars for the authenticated agent.',
      auth: 'bearer',
      parameters: [],
      example_body: null,
      example_response: { calendars: ['...'] },
    },
    {
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
        { name: 'webhook_offsets', in: 'body', required: false, type: 'array', description: 'Reminder offsets, e.g. ["-5m", "-1m"]' },
        { name: 'agentmail_api_key', in: 'body', required: false, type: 'string', description: 'AgentMail API key' },
      ],
      example_body: { name: 'Updated Name', timezone: 'America/New_York' },
      example_response: { id: 'cal_...', name: 'Updated Name', timezone: 'America/New_York' },
    },
    {
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
      method: 'POST',
      path: '/calendars/:id/events',
      description: 'Create an event. Supports one-off and recurring (RRULE) events.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'title', in: 'body', required: true, type: 'string', description: 'Event title' },
        { name: 'start', in: 'body', required: true, type: 'string', description: 'ISO 8601 datetime' },
        { name: 'end', in: 'body', required: true, type: 'string', description: 'ISO 8601 datetime' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'Free text (max 64KB)' },
        { name: 'metadata', in: 'body', required: false, type: 'object', description: 'Structured JSON payload (max 16KB)' },
        { name: 'location', in: 'body', required: false, type: 'string', description: 'Free text or URL' },
        { name: 'status', in: 'body', required: false, type: 'string', description: 'confirmed (default), tentative, cancelled' },
        { name: 'attendees', in: 'body', required: false, type: 'array', description: 'Array of email addresses' },
        { name: 'recurrence', in: 'body', required: false, type: 'string', description: 'RFC 5545 RRULE (e.g. FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR)' },
      ],
      example_body: { title: 'Team standup', start: '2025-03-01T09:00:00-07:00', end: '2025-03-01T09:15:00-07:00' },
      example_response: { id: 'evt_...', title: 'Team standup', calendar_id: 'cal_...', status: 'confirmed' },
    },
    {
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
      method: 'PATCH',
      path: '/calendars/:id/events/:event_id',
      description: 'Update an event. Patching a recurring instance marks it as an exception; patching the parent propagates to non-exception instances.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID' },
        { name: 'title', in: 'body', required: false, type: 'string', description: 'Event title' },
        { name: 'start', in: 'body', required: false, type: 'string', description: 'New start time' },
        { name: 'end', in: 'body', required: false, type: 'string', description: 'New end time' },
        { name: 'description', in: 'body', required: false, type: 'string', description: 'Free text' },
        { name: 'metadata', in: 'body', required: false, type: 'object', description: 'JSON payload' },
        { name: 'location', in: 'body', required: false, type: 'string', description: 'Location' },
        { name: 'status', in: 'body', required: false, type: 'string', description: 'confirmed, tentative, cancelled' },
        { name: 'attendees', in: 'body', required: false, type: 'array', description: 'Array of emails' },
        { name: 'recurrence', in: 'body', required: false, type: 'string', description: 'Updated RRULE (parent only — triggers rematerialization)' },
      ],
      example_body: { title: 'Updated title', location: 'Room 42' },
      example_response: { id: 'evt_...', title: 'Updated title', location: 'Room 42' },
    },
    {
      method: 'DELETE',
      path: '/calendars/:id/events/:event_id',
      description: 'Delete an event. For recurring instances, use the mode query parameter.',
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
      method: 'POST',
      path: '/calendars/:id/events/:event_id/respond',
      description: 'Accept or decline an inbound calendar invite.',
      auth: 'bearer',
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string', description: 'Calendar ID' },
        { name: 'event_id', in: 'path', required: true, type: 'string', description: 'Event ID' },
        { name: 'response', in: 'body', required: true, type: 'string', description: 'accepted, declined, or tentative' },
      ],
      example_body: { response: 'accepted' },
      example_response: { id: 'evt_...', status: 'confirmed', response_sent: 'accepted' },
    },
    {
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
      method: 'POST',
      path: '/inbound/:token',
      description: 'Inbound email webhook. Receives forwarded .ics invites. Each calendar has a unique webhook URL returned at creation. Supports Postmark and AgentMail.',
      auth: 'url_token',
      parameters: [
        { name: 'token', in: 'path', required: true, type: 'string', description: 'Inbound token (inb_...)' },
      ],
      example_body: null,
      example_response: { status: 'created', event_id: 'evt_...' },
    },
    {
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

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

function buildRecommendation(context, apiKey, calId) {
  if (!context.authenticated) {
    return {
      action: 'Create an agent',
      description: 'You are not authenticated. Create an agent to get an API key, then pass it as a Bearer token to access all endpoints.',
      endpoint: 'POST /agents',
      curl: buildCurl('POST', '/agents'),
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

  const hasEvents = context.calendars.some(c => c.event_count > 0);
  if (!hasEvents) {
    return {
      action: 'Create an event',
      description: 'You have a calendar but no events. Create your first event.',
      endpoint: 'POST /calendars/:id/events',
      curl: buildCurl('POST', '/calendars/:id/events', {
        apiKey,
        calId,
        body: { title: 'My first event', start: '2025-03-01T10:00:00Z', end: '2025-03-01T11:00:00Z' },
      }),
    };
  }

  const withEvents = context.calendars.find(c => c.event_count > 0);
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

router.post('/', softAuth, async (req, res) => {
  try {
    const apiKey = 'YOUR_API_KEY';
    const context = {
      authenticated: false,
      agent_id: null,
      calendars: [],
    };

    let calId = null;
    let evtId = null;

    if (req.agent) {
      context.authenticated = true;
      context.agent_id = req.agent.id;

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
    }

    const recommendation = buildRecommendation(context, apiKey, calId);

    // guide mode: skip the full endpoint catalog
    // Supports: ?guide query param, or {"guide": true} in body
    const guide = ('guide' in req.query) || (req.body && req.body.guide);
    if (guide) {
      return res.json({
        overview: 'CalDave is a calendar-as-a-service API for AI agents. Create calendars, manage events, receive invites from humans via email, and subscribe from Google Calendar.',
        base_url: BASE,
        your_context: context,
        recommended_next_step: recommendation,
      });
    }

    const endpoints = getEndpoints().map(ep => {
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

    res.json({
      overview: 'CalDave is a calendar-as-a-service API for AI agents. Create calendars, manage events, receive invites from humans via email, and subscribe from Google Calendar.',
      base_url: BASE,
      your_context: context,
      recommended_next_step: recommendation,
      endpoints,
    });
  } catch (err) {
    await logError(err, { route: 'POST /man', method: 'POST', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
