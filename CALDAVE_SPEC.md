# CalDave — API Specification v2

## Overview

CalDave is a calendar-as-a-service API for AI agents. It lets agents own, read, and write to calendars — and receive calendar invites from humans via standard email workflows (Google Calendar, Outlook, etc.).

Agents interact with CalDave via a REST API and/or MCP tools. Operators (humans managing agents) can also use the API directly.

---

## Core Concepts

### Calendar
A calendar belongs to an agent. Each calendar has:
- A unique **calendar ID** (e.g. `cal_a1b2c3`)
- A unique **inbound email address** (e.g. `cal-a1b2c3@caldave.fly.dev`)
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
- `start` — ISO 8601 datetime with timezone
- `end` — ISO 8601 datetime with timezone
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

Each calendar gets a unique email address under the CalDave domain (e.g. `cal-a1b2c3@caldave.fly.dev`). Inbound email is handled via a webhook provider (Postmark Inbound or SendGrid Inbound Parse):

1. Human sends a Google Calendar invite to `cal-a1b2c3@caldave.fly.dev`
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

### Calendar Management

#### `POST /calendars`
Create a new calendar for the authenticated agent.

**Request:**
```json
{
  "name": "Work Schedule",
  "timezone": "America/Denver"
}
```

**Response:**
```json
{
  "calendar_id": "cal_a1b2c3",
  "name": "Work Schedule",
  "timezone": "America/Denver",
  "email": "cal-a1b2c3@caldave.fly.dev",
  "ical_feed_url": "https://caldave.fly.dev/feeds/cal_a1b2c3.ics?token=feed_xyz789",
  "feed_token": "feed_xyz789",
  "message": "This calendar can receive invites at cal-a1b2c3@caldave.fly.dev. Save this information."
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

MCP auth: The agent's API key is passed as a config parameter when registering the MCP server.

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
| `created_at` | `timestamptz` | |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | `evt_` prefixed |
| `calendar_id` | `text` FK | |
| `title` | `text` | |
| `description` | `text` | Nullable |
| `metadata` | `jsonb` | Nullable, structured payload |
| `start_time` | `timestamptz` | |
| `end_time` | `timestamptz` | |
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
- `calendars(email)` — for inbound email lookup

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
| Inbound email | Postmark Inbound (or SendGrid Inbound Parse) |
| iCal generation | `ical-generator` npm package |
| iCal parsing | `ical.js` (or `node-ical`) npm package |
| Webhook scheduling | `pg-boss` (Postgres-backed job queue) |

---

## Decisions Log

1. **Agent provisioning auth** — Open, no operator key. Rate-limited (see Rate Limits section).
2. **Feed authentication** — Token required. Feed URLs include a token param: `/feeds/:calendar_id.ics?token=feed_abc123`. Token is generated at calendar creation and returned in the response.
3. **Webhook logs** — Failed deliveries are queryable via `GET /calendars/:id/webhook-logs`.
4. **Domain** — `caldave.fly.dev` for v1. Email addresses: `cal-abc123@caldave.fly.dev`.
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
