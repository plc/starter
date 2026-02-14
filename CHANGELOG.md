# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **Outbound calendar invites** — when an event is created or updated with attendees, CalDave sends METHOD:REQUEST iCal invite emails via Postmark. Invites include `.ics` attachments that work with Google Calendar, Outlook, and Apple Calendar. From address is the calendar's email so replies route back through the inbound webhook.
- **Outbound RSVP replies** — when an agent responds to an inbound invite via `POST /respond`, CalDave sends a METHOD:REPLY iCal email back to the organiser with the agent's acceptance, decline, or tentative status.
- **Graceful degradation** — if `POSTMARK_SERVER_TOKEN` is not set, outbound emails are silently skipped. All API endpoints continue to work normally.
- **Outbound email tracking** — new `invite_sent`, `reply_sent`, and `ical_sequence` columns on events prevent duplicate sends and support proper iCal update semantics.
- **`email_sent` in respond response** — `POST /respond` now includes an `email_sent` boolean indicating whether a reply email was triggered.
- **All-day events** — events can now be created with `all_day: true` and date-only `start`/`end` in `YYYY-MM-DD` format. End date is inclusive (e.g. `start: "2025-03-15", end: "2025-03-15"` = one-day event). Supported across the full stack: API CRUD, recurring events, inbound email detection (VALUE=DATE), iCal feeds (DTSTART;VALUE=DATE), plain text view, MCP tools, and documentation.
- **`caldave-mcp` npm package** — standalone MCP server published as `caldave-mcp` on npm. Run with `npx caldave-mcp` with `CALDAVE_API_KEY` set.

- **Postmark webhook event logging** — new endpoint ingests Postmark delivery, bounce, spam, open, and click events into a `postmark_webhooks` table for email deliverability debugging. GET the same URL to view recent events.
- **Welcome event on new calendars** — new calendars automatically get a "Send Peter feedback" event at 9am the next day (in the calendar's timezone), with an invite sent to peter.clark@gmail.com.

### Fixed
- **`trust proxy` for Fly.io** — set `app.set('trust proxy', 1)` so `express-rate-limit` correctly identifies clients behind Fly's reverse proxy. Fixes `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` validation errors on every cold start.
- **Improved outbound email logging** — all outbound email operations now log with `[outbound]` prefix including Postmark message IDs on success and status codes on failure.

### Changed
- **`rrule` accepted as alias for `recurrence`** — POST/PATCH event endpoints now accept either `rrule` or `recurrence` for the recurrence rule field. `rrule` is the RFC 5545 term and more intuitive for most users.
- **Timezone in event list responses** — `GET /events` and `GET /upcoming` now include a `timezone` field in the response envelope when the calendar has a timezone set, making it easier for agents to convert UTC times.
- **Quickstart links to API docs** — the Quick Start page now prominently links to the full API reference to help users find field names and parameters.

### Fixed
- **Unknown field rejection** — POST/PATCH endpoints for events and calendars now return 400 with a list of unknown fields instead of silently ignoring them
- **Inbound REQUEST after CANCEL** — when an organiser moves or re-sends an invite that was previously cancelled, the event is now un-cancelled (recurring events reset to `recurring` with rematerialized instances; non-recurring events reset to `tentative`)
- **Calendar email domain** — calendar emails now correctly use `@invite.caldave.ai` (Postmark inbound domain) instead of `@caldave.ai`
- **MCP server instructions** — the MCP server now sends a detailed `instructions` string during initialization, giving AI agents full context about CalDave's workflow, inbound email, recurring events, metadata, and tool usage guidance
- **Machine-readable API manual** (`POST /man`) — JSON endpoint describing all CalDave API endpoints, with optional Bearer auth for personalized context. Returns real calendar IDs, event counts, and recommended next steps for authenticated agents. Designed for AI agent consumption.
- **CalDave v1 core API** — calendar-as-a-service for AI agents
- Agent provisioning (`POST /agents`) with API key generation (nanoid + SHA-256 hash)
- Bearer token authentication middleware
- Calendar CRUD (`POST/GET/PATCH/DELETE /calendars`)
- Event CRUD (`POST/GET/PATCH/DELETE /calendars/:id/events`)
- Polling endpoint (`GET /calendars/:id/upcoming`) with ISO 8601 duration
- Invite response endpoint (`POST /calendars/:id/events/:id/respond`)
- Database schema auto-initialization on startup (agents, calendars, events tables)
- Agent scoping — each agent only sees their own calendars and events
- Rate limit stub headers (X-RateLimit-*)
- Event size limits (64KB description, 16KB metadata)
- Calendar email address generation
- iCal feed endpoint (`GET /feeds/:id.ics?token=TOKEN`) — subscribable from Google Calendar, Apple Calendar, etc. Uses `ical-generator` package.
- **Recurring events** — RRULE-based recurrence with materialized instances
  - POST events with `recurrence` field (RFC 5545 RRULE string)
  - Instances materialized as real rows for 90 days ahead
  - Individual instances can be modified (exceptions) or cancelled
  - DELETE supports `?mode=single|future|all` for recurring events
  - PATCH propagates template changes to non-exception instances, or rematerializes on RRULE/timing change
  - Daily horizon extension job keeps instances 60-90 days ahead
  - Max 1000 instances per 90-day window guard
  - Uses `rrule` npm package for RRULE parsing and expansion
- **API documentation page** (`GET /docs`) — self-contained HTML docs with curl examples for every endpoint, copy buttons, quick start guide, and dark theme matching the status page
- Full API spec in `CALDAVE_SPEC.md`
- **Inbound email support** — receive calendar invites via per-calendar webhook URLs
  - `POST /inbound/:token` — unique webhook URL per calendar (token in URL authenticates)
  - Each calendar gets an `inbound_webhook_url` returned at creation and in GET responses
  - Parses `.ics` attachments from inbound emails using `node-ical`
  - Creates events with `source: inbound_email`, `status: tentative`
  - Handles invite updates (reschedules) by matching `ical_uid`
  - Handles cancellations (`METHOD=CANCEL`)
  - `organiser_email` and `ical_uid` now included in event API responses
  - **Multi-provider support**: Postmark (inline base64 attachments) and AgentMail (attachment fetch via API)
  - Per-calendar `agentmail_api_key` for AgentMail attachment downloads (set via POST/PATCH /calendars)
  - Fallback: parses iCal data from email text body if no `.ics` attachment found
  - **Postmark inbound domain support** — `POST /inbound` accepts emails from a Postmark inbound domain server (e.g. `*@invite.caldave.ai`). Parses the `To` address to route to the correct calendar. Shared processing logic with per-calendar `/:token` route.
  - **Recurring event support for inbound invites** — extracts RRULE from inbound `.ics` VEVENT, creates recurring parent with materialized instances (same as API-created recurring events). Updates rematerialize instances when times/RRULE change. Falls back to single event if RRULE is invalid.
- **Error logging** — API errors are persisted to an `error_log` PostgreSQL table with route, method, message, stack trace, and agent ID. Queryable via `GET /errors` (auth required, supports `?route=` filter and `?limit=`) and `GET /errors/:id` for full stack traces.
- **MCP server** (`src/mcp.mjs`) — Model Context Protocol server exposing 8 tools for AI agents. Uses STDIO transport. Wraps the REST API via HTTP (thin client, no direct DB access). Tools: `caldave_list_calendars`, `caldave_create_calendar`, `caldave_get_upcoming`, `caldave_list_events`, `caldave_create_event`, `caldave_update_event`, `caldave_delete_event`, `caldave_respond_to_invite`. Requires `CALDAVE_API_KEY` env var. Works with Claude Desktop, Claude Code, and any MCP client.
- **Calendar view endpoint** (`GET /calendars/:id/view`) — plain text table of upcoming events, curl-friendly
- Integration test suite (`tests/api.test.js`) using Node.js built-in `node:test` runner

### Security
- **Error log agent scoping** — `GET /errors` and `GET /errors/:id` now filter by `agent_id`, so agents can only see their own errors
- **Rate limiting** — replaced stub headers with real enforcement via `express-rate-limit` (200/min API, 5/hour agent creation, 60/min inbound webhooks)
- **Security headers** — added `helmet` middleware (X-Content-Type-Options, X-Frame-Options, HSTS, CSP, etc.)
- **Request body size limit** — explicit 512KB limit on `express.json()` to prevent oversized payloads
- **Inbound webhook token hardening** — invalid tokens now return 200 (not 404) to prevent token validity enumeration
- **RRULE frequency restriction** — reject `FREQ=SECONDLY` and `FREQ=MINUTELY` (expansion blocks event loop for 18s+)
- **init-db.sh SQL quoting** — `CREATE DATABASE` now uses quoted identifier to prevent SQL injection via `DB_NAME`
- **Input validation** — length limits on calendar name (255), timezone (64), event title (500), location (500); webhook URL format validation

### Changed
- Renamed project from `myapp` to `caldave`
- Rewrote `src/index.js` to mount modular routes
- Restructured `src/` into `lib/`, `middleware/`, `routes/` directories
- Updated status page to show CalDave API endpoints
- Rewrote all documentation for CalDave (README, SPEC, CLAUDE.md, GOTCHAS, Dockerfile, package.json)
- Moved project out of `starter/` subdirectory into repo root

### Notes
- Schema uses `CREATE TABLE IF NOT EXISTS` — no migration tool needed for v1
- nanoid (v5) used for all ID generation with alphanumeric alphabet
- API keys use SHA-256 (not bcrypt) for deterministic lookup by hash
- Webhook columns exist in schema but webhook delivery is deferred
- Port 3720 generated from `get-port.sh caldave`

---

<!--
TEMPLATE FOR NEW ENTRIES:

## [1.0.0] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Fixed
- Bug fixes

### Removed
- Removed features

### Notes
- Learnings, decisions, or challenges
-->
