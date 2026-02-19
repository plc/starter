/**
 * Shared MCP tool registration
 *
 * Registers all 24 CalDave tools on a McpServer instance.
 * Used by both the STDIO server (src/mcp.mjs) and the HTTP
 * transport route (src/routes/mcp.mjs).
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {(method: string, path: string, body?: object) => Promise<any>} callApi
 * @param {string} baseUrl — base URL for raw fetch calls (used by view endpoint)
 * @param {string} apiKey — Bearer token for raw fetch calls
 */

import { z } from 'zod';

const INSTRUCTIONS = [
  'CalDave — Calendar as a Service for AI Agents',
  '=============================================',
  '',
  'CalDave gives you calendars that humans can subscribe to. You create events,',
  'humans see them in Google Calendar or Apple Calendar. Humans send you meeting',
  'invites by email, you accept or decline them here.',
  '',
  'Quick start',
  '-----------',
  '1. caldave_list_calendars — see your calendars (you may already have one).',
  '2. caldave_create_calendar — create one if not. You get back:',
  '   - A calendar email (e.g. cal-XXX@invite.caldave.ai) for receiving invites',
  '   - An iCal feed URL for subscribing from any calendar app',
  '3. caldave_create_event — add events (one-off or recurring via RRULE).',
  '4. caldave_get_upcoming — check what is next. Optimized for polling.',
  '',
  'Receiving invites from humans',
  '-----------------------------',
  'When someone emails an invite to your calendar address, it appears as a',
  'tentative event. Use caldave_respond_to_invite to accept, decline, or',
  'tentatively accept. An RSVP email is sent back automatically.',
  '',
  'Sharing your calendar',
  '---------------------',
  'Give humans the iCal feed URL (from caldave_get_calendar). They paste it into',
  'Google Calendar > "Add by URL" or Apple Calendar > "New subscription". Events',
  'sync automatically — no action needed on your part.',
  '',
  'Recurring events',
  '----------------',
  'Pass a recurrence string when creating events:',
  '  FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR — weekdays',
  '  FREQ=WEEKLY;BYDAY=TU — every Tuesday',
  '  FREQ=MONTHLY;BYMONTHDAY=1 — first of each month',
  'Instances are materialized for the next 90 days. Patch an instance to create',
  'an exception; patch the parent to update the whole series.',
  '',
  'Webhooks',
  '--------',
  'Set webhook_url on a calendar to get notified when events change.',
  'Test with caldave_test_webhook before relying on it.',
  '',
  'Choosing the right tool',
  '-----------------------',
  '- "What is next?" → caldave_get_upcoming',
  '- "What happened last week?" → caldave_list_events (with start/end filters)',
  '- "Show me my calendar" → caldave_view_calendar (plain text table)',
  '- "Something broke" → caldave_list_errors',
  '- "What is new?" → caldave_get_changelog',
  '- "Full API reference" → caldave_get_manual',
  '',
  'Other capabilities',
  '-------------------',
  '- Agent profile: caldave_update_agent to set your name (appears in email headers).',
  '- SMTP: caldave_set_smtp for custom email delivery. Default works out of the box.',
  '- Metadata: Events accept a metadata JSON object for storing your own data.',
  '- Attendees: Pass email addresses to send iCal invite emails when creating events.',
  '- All-day events: Set all_day=true with YYYY-MM-DD dates.',
].join('\n');

export { INSTRUCTIONS };

export function registerTools(server, callApi, baseUrl, apiKey) {
  // -------------------------------------------------------------------------
  // Resources — agent-facing documentation
  // -------------------------------------------------------------------------

  server.resource(
    'CalDave Guide',
    'caldave://guide',
    { description: 'Getting started guide for AI agents using CalDave', mimeType: 'text/markdown' },
    async () => ({
      contents: [{
        uri: 'caldave://guide',
        mimeType: 'text/markdown',
        text: [
          '# CalDave — Getting Started Guide for Agents',
          '',
          'CalDave gives you calendars that work with Google Calendar, Apple Calendar,',
          'and any iCal-compatible app. You create and manage events via tools. Humans',
          'subscribe to your calendar feed and see your events in their calendar app.',
          'Humans can also send you meeting invites by email.',
          '',
          '## Setup checklist',
          '',
          '1. **Set your name** — `caldave_update_agent` with a name and description.',
          '   Your name appears in outbound email From headers, so pick something',
          '   recognizable (e.g. "Acme Scheduling Bot").',
          '',
          '2. **Create a calendar** — `caldave_create_calendar` with a name and timezone.',
          '   You get back:',
          '   - `email` — e.g. `cal-XXX@invite.caldave.ai`. Give this to humans so they',
          '     can send you meeting invites.',
          '   - `ical_feed_url` — e.g. `https://caldave.ai/feeds/cal_XXX.ics?token=feed_...`.',
          '     Humans paste this into their calendar app to subscribe.',
          '   - `inbound_webhook_url` — used internally to receive inbound emails.',
          '',
          '3. **Create events** — `caldave_create_event` with title, start, end.',
          '   Events appear in the iCal feed within seconds.',
          '',
          '4. **Share the feed URL** — Tell humans to add your feed URL in:',
          '   - Google Calendar: Other calendars (+) > From URL',
          '   - Apple Calendar: File > New Calendar Subscription',
          '   - Outlook: Add calendar > From internet',
          '',
          '## Common workflows',
          '',
          '### Scheduling a meeting',
          '```',
          'caldave_create_event({',
          '  calendar_id: "cal_...",',
          '  title: "Project sync",',
          '  start: "2025-03-15T14:00:00-07:00",',
          '  end: "2025-03-15T14:30:00-07:00",',
          '  attendees: ["alice@example.com", "bob@example.com"],',
          '  location: "https://meet.google.com/abc-defg-hij"',
          '})',
          '```',
          'This creates the event AND sends iCal invite emails to the attendees.',
          '',
          '### Setting up a recurring standup',
          '```',
          'caldave_create_event({',
          '  calendar_id: "cal_...",',
          '  title: "Daily standup",',
          '  start: "2025-03-15T09:00:00-07:00",',
          '  end: "2025-03-15T09:15:00-07:00",',
          '  recurrence: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"',
          '})',
          '```',
          'Instances are materialized for the next 90 days automatically.',
          '',
          '### Handling an inbound invite',
          'When a human emails an invite to your calendar address:',
          '1. The invite appears as a tentative event.',
          '2. Use `caldave_list_events` with `status: "tentative"` to find it.',
          '3. Use `caldave_respond_to_invite` to accept or decline.',
          '4. An RSVP email is sent back to the organizer automatically.',
          '',
          '### Polling for upcoming events',
          '```',
          'caldave_get_upcoming({ calendar_id: "cal_...", limit: 5 })',
          '```',
          'Returns events sorted by start time with a `time_until` field like "in 2 hours".',
          '',
          '## Event fields reference',
          '',
          '| Field | Type | Notes |',
          '|-------|------|-------|',
          '| title | string | Required |',
          '| start | ISO 8601 | Required. Use YYYY-MM-DD for all-day events |',
          '| end | ISO 8601 | Required. Inclusive for all-day events |',
          '| all_day | boolean | Set true + use date-only start/end |',
          '| description | string | Free text, max 64KB |',
          '| location | string | Free text or URL |',
          '| metadata | object | JSON payload for your own data, max 16KB |',
          '| attendees | string[] | Email addresses — triggers invite emails |',
          '| recurrence | string | RFC 5545 RRULE |',
          '| status | string | confirmed, tentative, or cancelled |',
          '',
          '## Webhook notifications',
          '',
          'Set `webhook_url` when creating/updating a calendar. CalDave sends a POST',
          'to your URL whenever events are created, updated, deleted, or responded to.',
          '',
          'If you set a `webhook_secret`, verify the `X-CalDave-Signature` header',
          'using HMAC-SHA256 on the raw request body.',
          '',
          'Use `caldave_test_webhook` to verify your endpoint works before going live.',
          '',
          '## Custom email (SMTP)',
          '',
          'By default, CalDave sends invite and RSVP emails from its own servers.',
          'To send from your own domain:',
          '1. `caldave_set_smtp` with host, port, username, password, from address.',
          '2. `caldave_test_smtp` to verify it works.',
          '3. All outbound emails now use your SMTP server.',
          '',
          '## Debugging',
          '',
          '- `caldave_list_errors` — recent API errors for your agent.',
          '- `caldave_get_error` — full details and stack trace for a specific error.',
          '- `caldave_get_changelog` — new features and recommendations.',
          '- `caldave_get_manual` — full API reference with curl examples.',
          '',
          '## Tool reference (24 tools)',
          '',
          '**Agent**: caldave_get_agent, caldave_update_agent',
          '**SMTP**: caldave_set_smtp, caldave_get_smtp, caldave_delete_smtp, caldave_test_smtp',
          '**Calendars**: caldave_list_calendars, caldave_get_calendar, caldave_create_calendar, caldave_update_calendar, caldave_delete_calendar, caldave_test_webhook',
          '**Events**: caldave_get_upcoming, caldave_list_events, caldave_get_event, caldave_view_calendar, caldave_create_event, caldave_update_event, caldave_delete_event, caldave_respond_to_invite',
          '**Debug**: caldave_list_errors, caldave_get_error',
          '**Discovery**: caldave_get_changelog, caldave_get_manual',
        ].join('\n'),
      }],
    })
  );

  // -------------------------------------------------------------------------
  // Agent tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_get_agent',
    'Get the authenticated agent profile (name, description, created_at)',
    {},
    async () => {
      const data = await callApi('GET', '/agents/me');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_update_agent',
    'Update the agent name or description. The name appears in outbound email From headers.',
    {
      name: z.string().optional().describe('Display name (max 255 chars). Set to null to clear.'),
      description: z.string().optional().describe('What this agent does (max 1024 chars). Set to null to clear.'),
    },
    async ({ name, description }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      const data = await callApi('PATCH', '/agents', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // -------------------------------------------------------------------------
  // SMTP tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_set_smtp',
    'Configure SMTP for outbound emails. When set, invite and RSVP emails are sent via your SMTP server.',
    {
      host: z.string().describe('SMTP server hostname'),
      port: z.number().describe('SMTP port (465 for SSL, 587 for STARTTLS)'),
      username: z.string().describe('SMTP auth username'),
      password: z.string().describe('SMTP auth password'),
      from: z.string().describe('From email address for outbound emails'),
      secure: z.boolean().optional().describe('Use implicit TLS (true) or STARTTLS (false). Defaults to true for port 465.'),
    },
    async ({ host, port, username, password, from, secure }) => {
      const body = { host, port, username, password, from };
      if (secure !== undefined) body.secure = secure;
      const data = await callApi('PUT', '/agents/smtp', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_get_smtp',
    'View SMTP configuration (password excluded). Returns null if not configured.',
    {},
    async () => {
      const data = await callApi('GET', '/agents/smtp');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_delete_smtp',
    'Remove SMTP configuration. Outbound emails revert to CalDave built-in delivery.',
    {},
    async () => {
      const data = await callApi('DELETE', '/agents/smtp');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_test_smtp',
    'Send a test email to verify SMTP configuration works.',
    {
      to: z.string().optional().describe('Recipient email (default: the configured from address)'),
    },
    async ({ to }) => {
      const body = {};
      if (to) body.to = to;
      const data = await callApi('POST', '/agents/smtp/test', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // -------------------------------------------------------------------------
  // Calendar tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_list_calendars',
    'List all calendars for this agent',
    {},
    async () => {
      const data = await callApi('GET', '/calendars');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_get_calendar',
    'Get a single calendar by ID with full details',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
    },
    async ({ calendar_id }) => {
      const data = await callApi('GET', `/calendars/${calendar_id}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_create_calendar',
    'Create a new calendar. Returns calendar ID, email address, and feed URL.',
    {
      name: z.string().describe('Calendar name'),
      timezone: z.string().optional().describe('IANA timezone (default: UTC)'),
      webhook_url: z.string().optional().describe('URL to receive event webhooks'),
      webhook_secret: z.string().optional().describe('Secret for HMAC-SHA256 webhook signatures'),
      agentmail_api_key: z.string().optional().describe('AgentMail API key for inbound email attachments'),
      welcome_event: z.boolean().optional().describe('Set to false to skip the auto-created welcome event (default: true)'),
    },
    async ({ name, timezone, webhook_url, webhook_secret, agentmail_api_key, welcome_event }) => {
      const body = { name };
      if (timezone) body.timezone = timezone;
      if (webhook_url) body.webhook_url = webhook_url;
      if (webhook_secret) body.webhook_secret = webhook_secret;
      if (agentmail_api_key) body.agentmail_api_key = agentmail_api_key;
      if (welcome_event !== undefined) body.welcome_event = welcome_event;
      const data = await callApi('POST', '/calendars', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_update_calendar',
    'Update calendar settings (name, timezone, webhook config). All fields optional.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      name: z.string().optional().describe('Calendar display name'),
      timezone: z.string().optional().describe('IANA timezone'),
      webhook_url: z.string().optional().describe('URL to receive event notifications'),
      webhook_secret: z.string().optional().describe('HMAC secret for webhook signatures'),
      agentmail_api_key: z.string().optional().describe('AgentMail API key'),
    },
    async ({ calendar_id, name, timezone, webhook_url, webhook_secret, agentmail_api_key }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (timezone !== undefined) body.timezone = timezone;
      if (webhook_url !== undefined) body.webhook_url = webhook_url;
      if (webhook_secret !== undefined) body.webhook_secret = webhook_secret;
      if (agentmail_api_key !== undefined) body.agentmail_api_key = agentmail_api_key;
      const data = await callApi('PATCH', `/calendars/${calendar_id}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_delete_calendar',
    'Delete a calendar and all its events. This action is irreversible.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
    },
    async ({ calendar_id }) => {
      await callApi('DELETE', `/calendars/${calendar_id}`);
      return { content: [{ type: 'text', text: 'Calendar deleted' }] };
    }
  );

  server.tool(
    'caldave_test_webhook',
    'Send a test payload to the calendar webhook URL. Verifies webhook configuration before real events fire.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
    },
    async ({ calendar_id }) => {
      const data = await callApi('POST', `/calendars/${calendar_id}/webhook/test`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // -------------------------------------------------------------------------
  // Event tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_get_upcoming',
    'Get next N upcoming events from a calendar. Returns events and time until next event.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      limit: z.number().optional().describe('Max events to return (default: 5, max: 50)'),
    },
    async ({ calendar_id, limit }) => {
      const params = limit ? `?limit=${limit}` : '';
      const data = await callApi('GET', `/calendars/${calendar_id}/upcoming${params}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_list_events',
    'List events with optional date range and status filters',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      start: z.string().optional().describe('Filter: events starting after this ISO 8601 datetime'),
      end: z.string().optional().describe('Filter: events starting before this ISO 8601 datetime'),
      status: z.string().optional().describe('Filter by status: confirmed, tentative, cancelled'),
      limit: z.number().optional().describe('Max events (default: 50, max: 200)'),
    },
    async ({ calendar_id, start, end, status, limit }) => {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await callApi('GET', `/calendars/${calendar_id}/events${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_get_event',
    'Get a single event by ID',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      event_id: z.string().describe('Event ID (evt_...)'),
    },
    async ({ calendar_id, event_id }) => {
      const data = await callApi('GET', `/calendars/${calendar_id}/events/${event_id}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_view_calendar',
    'Get a plain text table of upcoming events. Useful for quick inspection.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      limit: z.number().optional().describe('Number of events (default: 10, max: 50)'),
    },
    async ({ calendar_id, limit }) => {
      const params = limit ? `?limit=${limit}` : '';
      const res = await fetch(`${baseUrl}/calendars/${calendar_id}/view${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const text = await res.text();
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'caldave_create_event',
    'Create an event on a calendar',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      title: z.string().describe('Event title'),
      start: z.string().describe('Start time (ISO 8601), or YYYY-MM-DD for all-day events'),
      end: z.string().describe('End time (ISO 8601), or YYYY-MM-DD for all-day events (inclusive)'),
      all_day: z.boolean().optional().describe('Set true for all-day events (start/end must be YYYY-MM-DD)'),
      description: z.string().optional().describe('Event description (max 64KB)'),
      metadata: z.record(z.string(), z.any()).optional().describe('Structured JSON payload for agent-specific data (max 16KB)'),
      location: z.string().optional().describe('Event location'),
      status: z.string().optional().describe('Event status: confirmed (default), tentative, cancelled'),
      attendees: z.array(z.string()).optional().describe('Array of attendee email addresses (sends invite emails)'),
      recurrence: z.string().optional().describe('RRULE string (e.g. FREQ=WEEKLY;BYDAY=MO)'),
    },
    async ({ calendar_id, title, start, end, all_day, description, metadata, location, status, attendees, recurrence }) => {
      const body = { title, start, end };
      if (all_day) body.all_day = true;
      if (description) body.description = description;
      if (metadata) body.metadata = metadata;
      if (location) body.location = location;
      if (status) body.status = status;
      if (attendees) body.attendees = attendees;
      if (recurrence) body.recurrence = recurrence;
      const data = await callApi('POST', `/calendars/${calendar_id}/events`, body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_update_event',
    'Update an existing event. Patching a recurring instance marks it as an exception; patching the parent propagates to non-exception instances.',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      event_id: z.string().describe('Event ID (evt_...)'),
      title: z.string().optional().describe('New title'),
      start: z.string().optional().describe('New start time (ISO 8601 or YYYY-MM-DD for all-day)'),
      end: z.string().optional().describe('New end time (ISO 8601 or YYYY-MM-DD for all-day, inclusive)'),
      all_day: z.boolean().optional().describe('Toggle all-day mode on/off'),
      description: z.string().optional().describe('New description'),
      metadata: z.record(z.string(), z.any()).optional().describe('Structured JSON payload for agent-specific data'),
      location: z.string().optional().describe('New location'),
      status: z.string().optional().describe('New status: confirmed, tentative, cancelled'),
      attendees: z.array(z.string()).optional().describe('Updated list of attendee email addresses'),
      recurrence: z.string().optional().describe('Updated RRULE (parent only — triggers rematerialization)'),
    },
    async ({ calendar_id, event_id, title, start, end, all_day, description, metadata, location, status, attendees, recurrence }) => {
      const body = {};
      if (title !== undefined) body.title = title;
      if (start !== undefined) body.start = start;
      if (end !== undefined) body.end = end;
      if (all_day !== undefined) body.all_day = all_day;
      if (description !== undefined) body.description = description;
      if (metadata !== undefined) body.metadata = metadata;
      if (location !== undefined) body.location = location;
      if (status !== undefined) body.status = status;
      if (attendees !== undefined) body.attendees = attendees;
      if (recurrence !== undefined) body.recurrence = recurrence;
      const data = await callApi('PATCH', `/calendars/${calendar_id}/events/${event_id}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_delete_event',
    'Delete an event',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      event_id: z.string().describe('Event ID (evt_...)'),
    },
    async ({ calendar_id, event_id }) => {
      await callApi('DELETE', `/calendars/${calendar_id}/events/${event_id}`);
      return { content: [{ type: 'text', text: 'Event deleted' }] };
    }
  );

  server.tool(
    'caldave_respond_to_invite',
    'Accept, decline, or tentatively accept an inbound invite',
    {
      calendar_id: z.string().describe('Calendar ID (cal_...)'),
      event_id: z.string().describe('Event ID (evt_...)'),
      response: z.enum(['accepted', 'declined', 'tentative']).describe('Your response'),
    },
    async ({ calendar_id, event_id, response }) => {
      const data = await callApi(
        'POST',
        `/calendars/${calendar_id}/events/${event_id}/respond`,
        { response }
      );
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // -------------------------------------------------------------------------
  // Debugging tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_list_errors',
    'Query recent API errors for your agent. Useful for debugging failed requests.',
    {
      limit: z.number().optional().describe('Max results (default: 50, max: 200)'),
      route: z.string().optional().describe('Filter by route pattern (e.g. "POST /calendars")'),
    },
    async ({ limit, route }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (route) params.set('route', route);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await callApi('GET', `/errors${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_get_error',
    'Get a single error with full stack trace',
    {
      error_id: z.number().describe('Error log ID'),
    },
    async ({ error_id }) => {
      const data = await callApi('GET', `/errors/${error_id}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // -------------------------------------------------------------------------
  // Discovery tools
  // -------------------------------------------------------------------------

  server.tool(
    'caldave_get_changelog',
    'Get API changelog. Shows new features since your agent was created and personalized recommendations.',
    {},
    async () => {
      const data = await callApi('GET', '/changelog');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'caldave_get_manual',
    'Get machine-readable API manual with all endpoints, parameters, and curl examples. Includes personalized context.',
    {
      guide: z.boolean().optional().describe('Set true for condensed guide with recommended next steps (skip full endpoint catalog)'),
      topic: z.string().optional().describe('Filter by category: agents, smtp, calendars, events, feeds, errors. Comma-separated for multiple.'),
    },
    async ({ guide, topic }) => {
      const params = new URLSearchParams();
      if (guide) params.set('guide', '');
      if (topic) params.set('topic', topic);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await callApi('GET', `/man${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
