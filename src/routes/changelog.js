/**
 * API changelog endpoint
 *
 * GET /changelog — returns a structured list of API changes with dates.
 * Auth is optional: if a valid Bearer token is provided, the response
 * includes when the agent was created and highlights changes introduced
 * since that date.
 *
 * Designed for AI agents to poll periodically (~weekly) to discover
 * new features, breaking changes, and deprecations.
 */

const { Router } = require('express');
const { pool } = require('../db');
const { hashKey } = require('../lib/keys');
const { logError } = require('../lib/errors');

const router = Router();
const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';
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
      'SELECT id, name, description, created_at FROM agents WHERE api_key_hash = $1',
      [hash]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      req.agent = { id: row.id, name: row.name, description: row.description, created_at: row.created_at };
    } else {
      req.agent = null;
    }
  } catch {
    req.agent = null;
  }
  next();
}

// ---------------------------------------------------------------------------
// Build personalized recommendations based on agent state
// ---------------------------------------------------------------------------

async function buildRecommendations(agent) {
  const recs = [];

  if (!agent.name) {
    recs.push({
      action: 'Name your agent',
      why: 'Your agent has no name set. Named agents are easier to identify in calendar invites and logs.',
      how: 'PATCH /agents with {"name": "My Agent"}',
      docs: BASE + '/docs#agents',
    });
  }

  if (!agent.description) {
    recs.push({
      action: 'Add a description to your agent',
      why: 'A description helps you and others understand what your agent does.',
      how: 'PATCH /agents with {"description": "Manages team meetings"}',
      docs: BASE + '/docs#agents',
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name,
              COUNT(e.id) FILTER (WHERE e.status != 'recurring') AS event_count
       FROM calendars c
       LEFT JOIN events e ON e.calendar_id = c.id
       WHERE c.agent_id = $1
       GROUP BY c.id
       ORDER BY c.created_at`,
      [agent.id]
    );

    if (rows.length === 0) {
      recs.push({
        action: 'Create your first calendar',
        why: 'You have no calendars yet. Calendars are required before you can create events or receive invites.',
        how: 'POST /calendars with {"name": "My Calendar", "timezone": "America/New_York"}',
        docs: BASE + '/docs#calendars',
      });
    } else {
      const emptyCals = rows.filter(r => parseInt(r.event_count, 10) === 0);
      if (emptyCals.length > 0 && emptyCals.length === rows.length) {
        recs.push({
          action: 'Create your first event',
          why: 'You have ' + rows.length + (rows.length === 1 ? ' calendar' : ' calendars') + ' but no events yet.',
          how: 'POST /calendars/' + rows[0].id + '/events with {"title": "Team standup", "start": "...", "end": "..."}',
          docs: BASE + '/docs#events',
        });
      }
    }
  } catch {
    // If calendar query fails, skip calendar-based recommendations
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Changelog entries — newest first
// ---------------------------------------------------------------------------

const CHANGELOG = [
  {
    date: '2026-02-14',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Agent metadata (name and description)',
        description: 'POST /agents now accepts optional name and description fields. New GET /agents/me returns agent profile. New PATCH /agents updates metadata without changing the API key.',
        endpoints: ['POST /agents', 'GET /agents/me', 'PATCH /agents'],
        docs: BASE + '/docs#agents',
      },
      {
        type: 'feature',
        title: 'Personalized recommendations in changelog',
        description: 'GET /changelog with auth now includes a recommendations array with actionable suggestions based on your agent state (e.g. name your agent, create your first calendar).',
        endpoints: ['GET /changelog'],
        docs: BASE + '/docs#changelog',
      },
    ],
  },
  {
    date: '2026-02-13',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Terms of Service and Privacy Policy',
        description: 'Added /terms and /privacy pages.',
        endpoints: ['GET /terms', 'GET /privacy'],
        docs: BASE + '/terms',
      },
    ],
  },
  {
    date: '2026-02-12',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Welcome event on new calendars',
        description: 'New calendars automatically get a welcome event at 9am the next day in the calendar timezone.',
        endpoints: ['POST /calendars'],
        docs: BASE + '/docs#calendars',
      },
    ],
  },
  {
    date: '2026-02-10',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Outbound calendar invites',
        description: 'Creating or updating events with attendees sends METHOD:REQUEST iCal invite emails via Postmark. From address is the calendar email so replies route back through inbound.',
        endpoints: ['POST /calendars/:id/events', 'PATCH /calendars/:id/events/:event_id'],
        docs: BASE + '/docs#events',
      },
      {
        type: 'feature',
        title: 'Outbound RSVP replies',
        description: 'Responding to an inbound invite via POST /respond sends a METHOD:REPLY iCal email back to the organiser.',
        endpoints: ['POST /calendars/:id/events/:event_id/respond'],
        docs: BASE + '/docs#respond',
      },
      {
        type: 'feature',
        title: 'email_sent in respond response',
        description: 'POST /respond now includes an email_sent boolean indicating whether a reply email was triggered.',
        endpoints: ['POST /calendars/:id/events/:event_id/respond'],
        docs: BASE + '/docs#respond',
      },
    ],
  },
  {
    date: '2026-02-08',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'All-day events',
        description: 'Events can be created with all_day: true and date-only start/end in YYYY-MM-DD format. End date is inclusive. Supported across the full stack: API, recurring events, inbound email, iCal feeds, and MCP tools.',
        endpoints: ['POST /calendars/:id/events', 'PATCH /calendars/:id/events/:event_id'],
        docs: BASE + '/docs#events',
      },
      {
        type: 'improvement',
        title: 'rrule accepted as alias for recurrence',
        description: 'POST and PATCH event endpoints now accept either rrule or recurrence for the recurrence rule field.',
        endpoints: ['POST /calendars/:id/events', 'PATCH /calendars/:id/events/:event_id'],
        docs: BASE + '/docs#events',
      },
      {
        type: 'improvement',
        title: 'Timezone in event list responses',
        description: 'GET /events and GET /upcoming now include a timezone field in the response envelope.',
        endpoints: ['GET /calendars/:id/events', 'GET /calendars/:id/upcoming'],
        docs: BASE + '/docs#events',
      },
    ],
  },
  {
    date: '2026-02-05',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Machine-readable API manual',
        description: 'POST /man returns a JSON document describing all endpoints with curl examples. Supports optional Bearer auth for personalized context and recommended next steps.',
        endpoints: ['POST /man'],
        docs: BASE + '/docs',
      },
      {
        type: 'feature',
        title: 'caldave-mcp npm package',
        description: 'MCP server for AI agents published as caldave-mcp on npm. Run with npx caldave-mcp.',
        endpoints: [],
        docs: BASE + '/docs#mcp',
      },
    ],
  },
  {
    date: '2026-02-03',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Inbound email — recurring invites',
        description: 'Inbound .ics invites with RRULE are now created as recurring events with materialized instances, matching API-created recurring events.',
        endpoints: ['POST /inbound/:token'],
        docs: BASE + '/docs#inbound',
      },
      {
        type: 'feature',
        title: 'Inbound email — multi-provider support',
        description: 'Inbound webhooks support both Postmark (inline base64 attachments) and AgentMail (attachment fetch via API). Set agentmail_api_key on the calendar for AgentMail.',
        endpoints: ['POST /inbound/:token'],
        docs: BASE + '/docs#inbound',
      },
    ],
  },
  {
    date: '2026-02-01',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Recurring events',
        description: 'POST events with a recurrence field (RFC 5545 RRULE). Instances materialized for 90 days. Supports single/future/all deletion modes, exception instances, and parent template propagation.',
        endpoints: ['POST /calendars/:id/events', 'DELETE /calendars/:id/events/:event_id'],
        docs: BASE + '/docs#recurring',
      },
      {
        type: 'feature',
        title: 'iCal feed endpoint',
        description: 'GET /feeds/:calendar_id.ics returns a subscribable iCal feed. Works with Google Calendar, Apple Calendar, and Outlook.',
        endpoints: ['GET /feeds/:calendar_id.ics'],
        docs: BASE + '/docs#feeds',
      },
    ],
  },
  {
    date: '2026-01-30',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'Inbound email support',
        description: 'Each calendar gets a unique email address and inbound webhook URL. Forward .ics invites to create events with source: inbound_email and status: tentative.',
        endpoints: ['POST /inbound/:token'],
        docs: BASE + '/docs#inbound',
      },
      {
        type: 'feature',
        title: 'Error log endpoint',
        description: 'GET /errors returns recent API errors scoped to your agent. Useful for debugging.',
        endpoints: ['GET /errors', 'GET /errors/:id'],
        docs: BASE + '/docs#errors',
      },
    ],
  },
  {
    date: '2026-01-28',
    version: null,
    changes: [
      {
        type: 'feature',
        title: 'CalDave v1 launch',
        description: 'Initial release. Agent provisioning, calendar CRUD, event CRUD, upcoming polling endpoint, invite response, and API documentation.',
        endpoints: ['POST /agents', 'POST /calendars', 'POST /calendars/:id/events', 'GET /calendars/:id/upcoming'],
        docs: BASE + '/docs',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.get('/', softAuth, async (req, res) => {
  try {
    const result = {
      description: 'CalDave API changelog. Lists new features, improvements, and fixes. We recommend polling this endpoint ~weekly to discover new capabilities.',
      poll_recommendation: 'Check this endpoint approximately once per week.',
      docs_url: BASE + '/docs',
      total_changes: CHANGELOG.reduce((sum, entry) => sum + entry.changes.length, 0),
    };

    if (req.agent) {
      const agentCreated = new Date(req.agent.created_at);
      result.your_agent = {
        agent_id: req.agent.id,
        name: req.agent.name || null,
        created_at: req.agent.created_at,
      };

      // Split changelog into new-to-you vs already-existed
      const newEntries = [];
      const existingEntries = [];
      for (const entry of CHANGELOG) {
        const entryDate = new Date(entry.date + 'T23:59:59Z');
        if (entryDate > agentCreated) {
          newEntries.push(entry);
        } else {
          existingEntries.push(entry);
        }
      }

      result.changes_since_signup = newEntries.length > 0 ? newEntries : null;
      result.changes_since_signup_count = newEntries.reduce((sum, e) => sum + e.changes.length, 0);
      result.changelog = existingEntries;

      // Personalized recommendations based on agent state
      const recs = await buildRecommendations(req.agent);
      if (recs.length > 0) {
        result.recommendations = recs;
      }
    } else {
      result.tip = 'Pass your API key as a Bearer token to see which changes are new since your agent was created.';
      result.changelog = CHANGELOG;
    }

    res.json(result);
  } catch (err) {
    await logError(err, { route: 'GET /changelog', method: 'GET', agent_id: req.agent?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
