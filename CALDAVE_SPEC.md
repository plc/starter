# CalDave — API Specification v2

## Overview

CalDave is a calendar-as-a-service API for AI agents. It lets agents own, read, and write to calendars — and receive calendar invites from humans via standard email workflows (Google Calendar, Outlook, etc.).

Agents interact with CalDave via a REST API and/or MCP tools. Operators (humans managing agents) can also use the API directly.

---

## Core Concepts

### Calendar
A calendar belongs to an agent. Each calendar has:
- A unique **calendar ID** (e.g. `cal_a1b2c3`)
- A unique **inbound email address** (e.g. `cal-a1b2c3@caldave.ai`)
- An **iCal feed URL** (read-only, for subscribing from Google Calendar etc.)
- A **timezone** (default, set at creation, modifiable)

An agent can own multiple calendars.

### Event
A calendar entry. Events have:
- `id` — unique event ID
- `calendar_id` — which calendar it belongs to
- `title` — summary/subject
- `description` — free text (supports markdown)
- `metadata` — structured JSON payload (e.g. `{"action": "transcribe", "zoom_url": "..."}`)
- `all_day` — boolean, when true `start`/`end` are date-only (`YYYY-MM-DD`) with inclusive end
- `start` — ISO 8601 datetime with timezone, or `YYYY-MM-DD` for all-day events
- `end` — ISO 8601 datetime with timezone, or `YYYY-MM-DD` for all-day events (inclusive)
- `location` — optional, free text or URL
- `status` — `confirmed` | `tentative` | `cancelled`
- `source` — `api` | `inbound_email` — how the event was created
- `recurrence` — optional RRULE string (RFC 5545)
- `attendees` — optional list of email addresses
- `reminders` — optional list of reminder offsets (e.g. `["-15m", "-1h"]`)

### Agent (Auth Identity)
- An **API key** (bearer token) authenticates an agent
- An agent can own multiple calendars
- API keys are generated at agent provisioning time

---

## Architecture Decisions

### Calendar Backend: Custom Postgres

No CalDAV server. CalDave stores events in Postgres and handles all calendar logic in the application layer. iCalendar (RFC 5545) format is used only for:
- Publishing read-only `.ics` feed URLs (so humans can subscribe in Google Calendar)
- Parsing inbound `.ics` attachments from email invites

This keeps the stack simple (Node.js + Postgres + Docker on Fly.io) while maintaining interoperability where it matters.

### Inbound Email: Webhook-based

Each calendar gets a unique email address under the CalDave domain (e.g. `cal-a1b2c3@caldave.ai`). Inbound email is handled via a webhook provider (Postmark Inbound or SendGrid Inbound Parse):

1. Human sends a Google Calendar invite to `cal-a1b2c3@caldave.ai`
2. Email provider receives it, forwards to CalDave webhook endpoint
3. CalDave parses the `.ics` attachment, creates an event with `source: inbound_email` and `status: tentative`
4. Agent can then accept/decline via the API

### Scheduling & Notifications: Webhook Push + Polling

Agents need to know when it's time to act. Two mechanisms:

**Polling (primary):** Agents call `GET /calendars/:id/upcoming` to check what's next. Simple, stateless, works with any agent framework.

**Webhooks (optional, per-calendar):** A calendar can register a webhook URL. CalDave sends a POST to that URL at configurable offsets before an event starts (e.g. 5 minutes before). Webhook delivery uses a simple retry policy (3 attempts, exponential backoff).

---

## Auth Model

| Concept | Details |
|---------|---------|
| **API Key** | Bearer token, one per agent. Sent as `Authorization: Bearer <key>` |
| **Provisioning** | `POST /agents` returns `agent_id` + `api_key`. Agent must store these — the key is shown once. |
| **Scoping** | An API key grants access to all calendars owned by that agent. No cross-agent access. |

---

## API Endpoints

### Agent Provisioning

#### `POST /agents`
Creates a new agent identity. No auth required (or protected by an operator-level secret — see Open Questions).

**Response:**
```json
{
  "agent_id": "agt_x7y8z9",
  "api_key": "sk_live_abc123...",
  "message": "Store these credentials securely. The API key will not be shown again."
}
```

---

### API Manual

#### `POST /man`
Machine-readable API manual. Returns a JSON document describing all CalDave endpoints with curl examples, parameter definitions, and example responses.

Auth is optional. If a valid Bearer token is provided, the response includes the agent's real calendar IDs and event counts, with personalized curl examples and a recommended next step.

**Response:**
```json
{
  "overview": "CalDave is a calendar-as-a-service API...",
  "base_url": "https://caldave.ai",
  "your_context": {
    "authenticated": true,
    "agent_id": "agt_xxx",
    "calendars": [{ "id": "cal_xxx", "name": "Work", "event_count": 12 }]
  },
  "recommended_next_step": {
    "action": "Check upcoming events",
    "endpoint": "GET /calendars/:id/upcoming",
    "curl": "curl -s https://caldave.ai/calendars/cal_xxx/upcoming ..."
  },
  "endpoints": [{ "method": "POST", "path": "/agents", "description": "...", "auth": "none", "parameters": [], "example_curl": "...", "example_response": {} }]
}
```

---

### Calendar Management

#### `POST /calendars`
Create a new calendar for the authenticated agent.

**Request:**
```json
{
  "name": "Work Schedule",
  "timezone": "America/Denver",
  "agentmail_api_key": "am_xxx..."
}
```

**Response:**
```json
{
  "calendar_id": "cal_a1b2c3",
  "name": "Work Schedule",
  "timezone": "America/Denver",
  "email": "cal-a1b2c3@caldave.ai",
  "ical_feed_url": "https://caldave.ai/feeds/cal_a1b2c3.ics?token=feed_xyz789",
  "feed_token": "feed_xyz789",
  "inbound_webhook_url": "https://caldave.ai/inbound/inb_abc123...",
  "message": "This calendar can receive invites at cal-a1b2c3@caldave.ai. Forward emails to https://caldave.ai/inbound/inb_abc123.... Save this information."
}
```

#### `GET /calendars`
List all calendars for the authenticated agent.

#### `GET /calendars/:id`
Get calendar details.

#### `PATCH /calendars/:id`
Update calendar settings (name, timezone, webhook URL).

#### `DELETE /calendars/:id`
Delete a calendar and all its events.

---

### Events

#### `POST /calendars/:id/events`
Create an event.

**Request:**
```json
{
  "title": "Email weather report",
  "start": "2025-02-15T09:00:00-07:00",
  "end": "2025-02-15T09:05:00-07:00",
  "metadata": {
    "action": "send_email",
    "prompt": "Send me today's weather forecast for Louisville, CO"
  },
  "recurrence": "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
}
```

#### `GET /calendars/:id/events`
List events. Supports query params:
- `start` — filter events starting after this datetime
- `end` — filter events starting before this datetime
- `status` — filter by status
- `limit` / `offset` — pagination

#### `GET /calendars/:id/events/:event_id`
Get a single event.

#### `PATCH /calendars/:id/events/:event_id`
Update an event (partial update).

#### `DELETE /calendars/:id/events/:event_id`
Delete an event.

#### `GET /calendars/:id/upcoming`
Convenience endpoint. Returns the next N events (default 5) from now. Designed for agent polling.

**Response includes:**
```json
{
  "events": [...],
  "next_event_starts_in": "PT14M30S"
}
```

#### `GET /calendars/:id/view`
Plain text table of upcoming events. Useful for quick inspection via curl.

**Query params:** `limit` (default 10, max 50)

**Example:**
```
curl -s http://127.0.0.1:3720/calendars/cal_xxx/view \
  -H "Authorization: Bearer sk_live_xxx"

Work (cal_xxx)  tz: America/Denver
----------------------------------------
TITLE          START                 ...
----------------------------------------
Daily standup  2026-02-13 16:00:00Z  ...
----------------------------------------
1 event(s)
```

#### `POST /calendars/:id/events/:event_id/respond`
Accept or decline an inbound invite.

**Request:**
```json
{
  "response": "accepted"
}
```
Valid values: `accepted` | `declined` | `tentative`

If the original invite included an organiser email, CalDave sends an iCal response email back.

---

### Webhooks

#### `PATCH /calendars/:id`
Set or update webhook configuration:

```json
{
  "webhook_url": "https://my-agent.fly.dev/hooks/calendar",
  "webhook_secret": "whsec_...",
  "webhook_offsets": ["-5m", "-1m", "0"]
}
```

**Webhook payload (POST to the registered URL):**
```json
{
  "type": "event.upcoming",
  "calendar_id": "cal_a1b2c3",
  "event": { ... },
  "fires_at": "2025-02-15T08:55:00-07:00",
  "offset": "-5m",
  "signature": "sha256=..."
}
```

Signature is HMAC-SHA256 of the body using `webhook_secret`.

#### `GET /calendars/:id/webhook-logs`
List webhook delivery attempts for a calendar. Supports query params:
- `status` — filter by `pending` / `delivered` / `failed`
- `limit` / `offset` — pagination

Useful for debugging failed deliveries.

---

### iCal Feed

#### `GET /feeds/:calendar_id.ics?token=:feed_token`
Read-only iCalendar feed. Can be subscribed to from Google Calendar, Apple Calendar, etc. Requires a valid `token` query parameter (generated at calendar creation). Returns 401 without a valid token.

---

### Inbound Email

#### `POST /inbound/:token`
Per-calendar webhook endpoint for receiving forwarded emails containing `.ics` calendar invite attachments.

No Bearer auth. The unguessable `inbound_token` in the URL authenticates the request. Each calendar gets its own unique webhook URL (returned at creation as `inbound_webhook_url`).

Supports multiple email-to-webhook providers:
- **Postmark Inbound** — attachments include base64 content inline in the webhook payload
- **AgentMail** — webhook delivers attachment metadata; CalDave fetches `.ics` content via the AgentMail API using the calendar's `agentmail_api_key`

For AgentMail, set the `agentmail_api_key` on the calendar via `POST /calendars` or `PATCH /calendars/:id`.

**Behavior by iCal METHOD:**

| METHOD | Action |
|--------|--------|
| `REQUEST` / `PUBLISH` | Creates event (or updates if `ical_uid` matches existing event) |
| `CANCEL` | Sets matching event status to `cancelled` |
| Other | Ignored (returns 200) |

**New event fields:**
- `source: 'inbound_email'`
- `status: 'tentative'` (agent must accept/decline via `/respond`)
- `organiser_email` — from the ORGANIZER field in the `.ics`
- `ical_uid` — from the UID field, used to match updates and cancellations

**Recurring invites:** If the inbound `.ics` contains an RRULE (e.g. a weekly Google Calendar invite), CalDave creates a recurring parent event (`status: 'recurring'`) and materializes instances for 90 days, identical to API-created recurring events. If the RRULE is invalid or generates too many instances, the invite falls back to a single event.

**Response (always 200 to prevent Postmark retries):**
```json
{ "status": "created", "event_id": "evt_xxx" }
{ "status": "created", "event_id": "evt_xxx", "recurrence": "FREQ=WEEKLY;BYDAY=SA", "instances_created": 13 }
{ "status": "updated", "event_id": "evt_xxx" }
{ "status": "cancelled", "event_id": "evt_xxx" }
{ "status": "ignored", "reason": "..." }
```

**Reschedule behavior:** If an inbound update changes the event times and the agent had already accepted, the status resets to `tentative` so the agent can re-confirm. For recurring events, time or RRULE changes trigger rematerialization of all non-exception instances.

---

## MCP Tool Definitions

For agents using MCP, CalDave exposes these tools:

| Tool | Description |
|------|-------------|
| `caldave_create_calendar` | Create a new calendar. Returns calendar ID, email, and feed URL. |
| `caldave_list_calendars` | List all calendars for this agent. |
| `caldave_get_upcoming` | Get next N events from a calendar. |
| `caldave_create_event` | Create an event on a calendar. |
| `caldave_update_event` | Update an existing event. |
| `caldave_delete_event` | Delete an event. |
| `caldave_respond_to_invite` | Accept/decline an inbound invite. |
| `caldave_list_events` | List events with optional date range and status filters. |

### Configuration

The MCP server (`src/mcp.mjs`) uses STDIO transport. Configure it in your MCP client:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "caldave": {
      "command": "node",
      "args": ["/path/to/caldave/src/mcp.mjs"],
      "env": {
        "CALDAVE_API_KEY": "sk_live_..."
      }
    }
  }
}
```

**Claude Code** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "caldave": {
      "command": "node",
      "args": ["/path/to/caldave/src/mcp.mjs"],
      "env": {
        "CALDAVE_API_KEY": "sk_live_..."
      }
    }
  }
}
```

**Environment variables:**
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CALDAVE_API_KEY` | Yes | — | Agent API key (Bearer token) |
| `CALDAVE_URL` | No | `https://caldave.ai` | CalDave server URL |

---

## Database Schema (Postgres)

### `agents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | `agt_` prefixed |
| `api_key_hash` | `text` | bcrypt hash of the API key |
| `created_at` | `timestamptz` | |

### `calendars`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | `cal_` prefixed |
| `agent_id` | `text` FK | |
| `name` | `text` | |
| `timezone` | `text` | IANA timezone |
| `email` | `text` UNIQUE | Generated inbound email |
| `feed_token` | `text` | Token for iCal feed auth |
| `webhook_url` | `text` | Nullable |
| `webhook_secret` | `text` | Nullable |
| `webhook_offsets` | `jsonb` | Default `["-5m"]` |
| `inbound_token` | `text` UNIQUE | `inb_` prefixed, for per-calendar webhook URL |
| `agentmail_api_key` | `text` | Nullable, for fetching AgentMail attachments |
| `created_at` | `timestamptz` | |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | `evt_` prefixed |
| `calendar_id` | `text` FK | |
| `title` | `text` | |
| `description` | `text` | Nullable |
| `metadata` | `jsonb` | Nullable, structured payload |
| `all_day` | `boolean` | Default `false`. When true, start/end are midnight-UTC timestamps and API returns date-only strings |
| `start_time` | `timestamptz` | |
| `end_time` | `timestamptz` | For all-day events, stored as exclusive end (start+N days at midnight UTC) |
| `location` | `text` | Nullable |
| `status` | `text` | `confirmed` / `tentative` / `cancelled` |
| `source` | `text` | `api` / `inbound_email` |
| `recurrence` | `text` | Nullable, RRULE string |
| `attendees` | `jsonb` | Nullable |
| `organiser_email` | `text` | Nullable, for inbound invites |
| `ical_uid` | `text` | Nullable, for matching inbound updates |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Indexes:**
- `events(calendar_id, start_time)` — for range queries
- `events(calendar_id, status)` — for filtering
- `events(calendar_id, ical_uid)` — partial index for inbound email update/cancel matching
- `calendars(email)` — for inbound email lookup
- `calendars(inbound_token)` — partial index for webhook URL lookup

### `webhook_deliveries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | `whd_` prefixed |
| `calendar_id` | `text` FK | |
| `event_id` | `text` FK | |
| `offset` | `text` | e.g. `-5m` |
| `status` | `text` | `pending` / `delivered` / `failed` |
| `attempts` | `integer` | Number of delivery attempts |
| `last_attempt_at` | `timestamptz` | |
| `response_status` | `integer` | HTTP status from webhook target |
| `error` | `text` | Nullable, error message on failure |
| `created_at` | `timestamptz` | |

---

## Recurring Events

Recurrence is stored as an RRULE string (RFC 5545). The API expands recurring events into individual occurrences when queried — the `GET /events` and `GET /upcoming` endpoints return expanded instances within the requested time window.

Recurring events can be created via the API (`POST /events` with a `recurrence` field) or from inbound email invites containing an RRULE. In both cases, CalDave creates a parent row (`status: 'recurring'`) and materializes individual instances as separate event rows for the next 90 days.

Single-instance modifications (e.g. "cancel just this Tuesday") are stored as exception events linked to the parent by `ical_uid`.

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Per API key | 100 requests/minute |
| Calendar creation | 10 calendars per agent |
| Event creation | 1000 events per calendar |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js |
| Database | Postgres |
| Containerisation | Docker |
| Hosting | Fly.io |
| Inbound email | Postmark Inbound |
| iCal generation | `ical-generator` npm package |
| iCal parsing | `node-ical` npm package |
| Webhook scheduling | `pg-boss` (Postgres-backed job queue) |

---

## Decisions Log

1. **Agent provisioning auth** — Open, no operator key. Rate-limited (see Rate Limits section).
2. **Feed authentication** — Token required. Feed URLs include a token param: `/feeds/:calendar_id.ics?token=feed_abc123`. Token is generated at calendar creation and returned in the response.
3. **Webhook logs** — Failed deliveries are queryable via `GET /calendars/:id/webhook-logs`.
4. **Domain** — `caldave.ai` for v1. Email addresses: `cal-abc123@caldave.ai`.
5. **Event size limits** — 64KB for description, 16KB for metadata JSON.
6. **Outbound email** — Not in v1. Agents can accept/decline internally but organisers are not notified. Stubbed for v2.
7. **Calendar sharing** — Not in v1. Could add via a `calendar_shares` table later.

---

## Out of Scope (v1)

- Web UI / dashboard
- Calendar sharing between agents
- Attachments on events
- Free/busy lookups
- CalDAV protocol compliance
- Outbound calendar invites (agent inviting humans)
- Outbound email responses (notifying organisers of accept/decline)
