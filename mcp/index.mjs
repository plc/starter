#!/usr/bin/env node
/**
 * CalDave MCP Server
 *
 * Thin HTTP-client wrapper that exposes CalDave's REST API as MCP tools.
 * Uses STDIO transport for local agent usage (Claude Desktop, Claude Code).
 *
 * Environment variables:
 *   CALDAVE_API_KEY  — required, Bearer token for auth
 *   CALDAVE_URL      — optional, defaults to https://caldave.ai
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_KEY = process.env.CALDAVE_API_KEY;
const BASE_URL = (process.env.CALDAVE_URL || 'https://caldave.ai').replace(/\/$/, '');

if (!API_KEY) {
  console.error('CALDAVE_API_KEY environment variable is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function callApi(method, path, body) {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return { ok: true };

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: 'caldave', version: '1.0.0' },
  {
    instructions: [
      'CalDave is a calendar-as-a-service API for AI agents.',
      'You have an API key configured, so you can call any of the tools below.',
      '',
      'Typical workflow:',
      '1. caldave_list_calendars — see what calendars you have.',
      '2. caldave_create_calendar — create one if needed. Each calendar gets an email address (e.g. cal-XXX@invite.caldave.ai) and an iCal feed URL subscribable from Google Calendar or Apple Calendar.',
      '3. caldave_create_event — add events. Supports recurring events via RRULE (e.g. FREQ=WEEKLY;BYDAY=MO).',
      '4. caldave_get_upcoming — poll for upcoming events. Returns the next N events sorted by start time with a human-readable time-until field. Use this for scheduling and reminders.',
      '5. caldave_respond_to_invite — when humans send calendar invites to your calendar email, they appear as events with status "tentative". Use this tool to accept, decline, or tentatively accept them.',
      '',
      'Key concepts:',
      '- Inbound email: Humans can invite your agent to meetings by emailing the calendar address. Invites arrive as tentative events with organiser_email and attendees populated.',
      '- Recurring events: Pass a recurrence RRULE string (RFC 5545) when creating events. Instances are automatically materialized for the next 90 days.',
      '- Event status: "confirmed" (you created it or accepted), "tentative" (inbound invite awaiting response), "cancelled" (declined or cancelled).',
      '- Metadata: Events have an optional metadata field (JSON object) for storing agent-specific data like meeting URLs, action items, or context.',
      '- iCal feeds: Each calendar has a feed URL that external calendar apps can subscribe to. The feed updates automatically as events change.',
      '',
      'Tool tips:',
      '- Use caldave_get_upcoming for "what is next on my calendar" queries. It is optimized for this.',
      '- Use caldave_list_events with date range filters for "what happened last week" or "what is scheduled in March" queries.',
      '- After responding to an invite, the event status changes immediately. No need to update it separately.',
    ].join('\n'),
  }
);

// --- caldave_list_calendars ---
server.tool(
  'caldave_list_calendars',
  'List all calendars for this agent',
  {},
  async () => {
    const data = await callApi('GET', '/calendars');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// --- caldave_create_calendar ---
server.tool(
  'caldave_create_calendar',
  'Create a new calendar. Returns calendar ID, email address, and feed URL.',
  {
    name: z.string().describe('Calendar name'),
    timezone: z.string().optional().describe('IANA timezone (default: UTC)'),
  },
  async ({ name, timezone }) => {
    const body = { name };
    if (timezone) body.timezone = timezone;
    const data = await callApi('POST', '/calendars', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// --- caldave_get_upcoming ---
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

// --- caldave_list_events ---
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

// --- caldave_create_event ---
server.tool(
  'caldave_create_event',
  'Create an event on a calendar',
  {
    calendar_id: z.string().describe('Calendar ID (cal_...)'),
    title: z.string().describe('Event title'),
    start: z.string().describe('Start time (ISO 8601), or YYYY-MM-DD for all-day events'),
    end: z.string().describe('End time (ISO 8601), or YYYY-MM-DD for all-day events (inclusive)'),
    all_day: z.boolean().optional().describe('Set true for all-day events (start/end must be YYYY-MM-DD)'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    recurrence: z.string().optional().describe('RRULE string (e.g. FREQ=WEEKLY;BYDAY=MO)'),
  },
  async ({ calendar_id, title, start, end, all_day, description, location, recurrence }) => {
    const body = { title, start, end };
    if (all_day) body.all_day = true;
    if (description) body.description = description;
    if (location) body.location = location;
    if (recurrence) body.recurrence = recurrence;
    const data = await callApi('POST', `/calendars/${calendar_id}/events`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// --- caldave_update_event ---
server.tool(
  'caldave_update_event',
  'Update an existing event',
  {
    calendar_id: z.string().describe('Calendar ID (cal_...)'),
    event_id: z.string().describe('Event ID (evt_...)'),
    title: z.string().optional().describe('New title'),
    start: z.string().optional().describe('New start time (ISO 8601 or YYYY-MM-DD for all-day)'),
    end: z.string().optional().describe('New end time (ISO 8601 or YYYY-MM-DD for all-day, inclusive)'),
    all_day: z.boolean().optional().describe('Toggle all-day mode on/off'),
    description: z.string().optional().describe('New description'),
    location: z.string().optional().describe('New location'),
    status: z.string().optional().describe('New status: confirmed, tentative, cancelled'),
  },
  async ({ calendar_id, event_id, title, start, end, all_day, description, location, status }) => {
    const body = {};
    if (title !== undefined) body.title = title;
    if (start !== undefined) body.start = start;
    if (end !== undefined) body.end = end;
    if (all_day !== undefined) body.all_day = all_day;
    if (description !== undefined) body.description = description;
    if (location !== undefined) body.location = location;
    if (status !== undefined) body.status = status;
    const data = await callApi('PATCH', `/calendars/${calendar_id}/events/${event_id}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// --- caldave_delete_event ---
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

// --- caldave_respond_to_invite ---
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('CalDave MCP server running on stdio');
