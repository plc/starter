# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **Webhook delivery on event mutations** — Calendars with a `webhook_url` now receive automatic webhooks when events are created, updated, deleted, or responded to. Works for both API operations and inbound email invites. Event types: `event.created`, `event.updated`, `event.deleted`, `event.responded`. Payloads are signed with HMAC-SHA256 if `webhook_secret` is set. Delivery is fire-and-forget (no retries).
- **Human accounts with agent key claiming** — Humans can sign up at `/signup`, log in at `/login`, and manage their agent keys from a `/dashboard`. Agents are claimed by providing the agent's secret key (`sk_live_...`) — if you have the key, you own it. No calendar invites needed.
  - **Human API keys** (`hk_live_...`) — pass via `X-Human-Key` header to `POST /agents` to auto-associate new agents, or to `POST /agents/claim` to claim existing agents programmatically.
  - **Dashboard** — web UI to view claimed agents, claim new ones by pasting a secret key, and release agents.
  - **Session auth** — cookie-based sessions for the dashboard (7-day expiry, automatic cleanup).
  - New tables: `humans`, `human_agents`, `human_sessions`.

- **MCP server at full parity with API** — Added 16 new MCP tools covering all documented API endpoints. Previously the MCP server only had 8 core tools; it now exposes 24 tools matching every REST endpoint:
  - **Agent management**: `caldave_get_agent`, `caldave_update_agent`
  - **SMTP configuration**: `caldave_set_smtp`, `caldave_get_smtp`, `caldave_delete_smtp`, `caldave_test_smtp`
  - **Calendar management**: `caldave_get_calendar`, `caldave_update_calendar`, `caldave_delete_calendar`, `caldave_test_webhook`
  - **Event tools**: `caldave_get_event`, `caldave_view_calendar`
  - **Debugging**: `caldave_list_errors`, `caldave_get_error`
  - **Discovery**: `caldave_get_changelog`, `caldave_get_manual`
- **Missing parameters on existing MCP tools** — `caldave_create_event` now supports `metadata`, `attendees`, and `status`. `caldave_update_event` now supports `metadata`, `attendees`, and `recurrence`. `caldave_create_calendar` now supports `webhook_url`, `webhook_secret`, `agentmail_api_key`, and `welcome_event`.
- **Remote MCP endpoint at `/mcp`** — CalDave now serves an MCP endpoint via Streamable HTTP transport. Agents can connect with just a URL and API key (`{ "url": "https://caldave.ai/mcp", "headers": { "Authorization": "Bearer sk_live_..." } }`) — no local installation required. Sessions are stateful with automatic 30-minute TTL cleanup.
- **MCP agent guide** — Enhanced MCP instructions with structured quick-start, workflow descriptions, and tool selection guide. Added `caldave://guide` MCP resource with a comprehensive getting-started guide for agents (setup checklist, code examples, event fields reference, webhook/SMTP config, debugging).

### Improved
- **Auth performance** — Added missing database index on `agents.api_key_hash`. Auth lookups now use an index scan instead of a full table scan on every authenticated request.
- **`/docs` caching** — Static HTML documentation is pre-computed at startup and served with `Cache-Control: public, max-age=86400`. Eliminates ~30KB of string construction per request.
- **Fire-and-forget error logging** — Error log INSERTs no longer block error responses. Clients get their 500 response immediately while logging completes in the background.
- **iCal feed ETag/caching** — `GET /feeds/*.ics` now returns `ETag` and `Cache-Control: public, max-age=300`. Calendar clients that send `If-None-Match` get a `304 Not Modified` when nothing has changed, skipping the full feed rebuild.
- **`/man` endpoint catalog cached** — Static endpoint catalog is pre-computed at module load instead of rebuilt on every request.
- **Parallel recurring event extension** — The daily materialization job now processes all recurring events concurrently instead of sequentially.

### Fixed
- **Attendee input validation** — `attendees` field now requires an array of valid email strings. Non-array values, non-string elements, and invalid emails are rejected with 400. Attendees are deduplicated case-insensitively and capped at 50 per event. Previously, invalid values could be stored and crash the iCal feed.
- **End-before-start validation** — Timed events where `end` is before `start` are now rejected with 400. All-day events already had this check.
- **Dangerous URI schemes in location** — `javascript:`, `data:`, `vbscript:`, and `file:` URIs are now rejected in event location fields to prevent stored XSS in calendar invite emails.
- **Defensive iCal feed generation** — The iCal feed generator now gracefully handles malformed attendee data in the database instead of crashing the entire feed.

### Added
- **Scoped `/man` with `?topic=` filter** — `GET /man` now supports `?topic=` to filter endpoints by category (`agents`, `smtp`, `calendars`, `events`, `feeds`, `errors`). Comma-separated for multiple topics. Discovery endpoints (`/man`, `/changelog`) are always included. Reduces token usage for agents with limited context windows.
- **Error format documentation in `/man`** — `GET /man` response now includes `error_format` with the standard error shape, status codes, and notes. Also included in `?guide` mode so agents know what to expect from error responses.
- **SMTP test `to` parameter** — `POST /agents/smtp/test` now accepts an optional `to` body parameter to send the test email to a specific address instead of the configured `from` address.
- **SMTP test endpoint** — `POST /agents/smtp/test` sends a test email to verify your SMTP configuration works. Sends to the configured `from` address and reports success/failure with the SMTP error message if any.
- **SMTP `secure` field** — `PUT /agents/smtp` now accepts an optional `secure` boolean to explicitly control TLS mode. Use `true` for implicit TLS (port 465) or `false` for STARTTLS (port 587). Auto-detected from port when omitted.
- **Webhook config at calendar creation** — `POST /calendars` now accepts `webhook_url` and `webhook_secret` at creation time, saving a separate `PATCH` call.
- **`email_sent` in event responses** — `POST` and `PATCH` event endpoints now return `email_sent: true/false` when the event has attendees, confirming whether the invite was dispatched. Invites are now sent synchronously before the response is returned.
- **SMTP integration for outbound emails** — configure your own SMTP server via `PUT /agents/smtp` so calendar invites and RSVP replies are sent from your email address instead of CalDave's built-in delivery. New `GET /agents/smtp` (view config, password excluded) and `DELETE /agents/smtp` (revert to built-in). `GET /agents/me` now includes `smtp_configured` boolean. Supports any SMTP provider (AgentMail, SendGrid, Gmail, etc.).
- **Webhook test endpoint** — `POST /calendars/:id/webhook/test` sends a test payload to the calendar's configured webhook URL and returns the HTTP status code. Supports HMAC-SHA256 signing via `X-CalDave-Signature` when `webhook_secret` is set.
- **Welcome event opt-out** — `POST /calendars` now accepts `welcome_event: false` to skip the auto-created welcome event. Default remains true.
- **Rate limit documentation** — rate limits documented in `/docs` and included in `GET /man` responses. All responses include `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers (RFC draft-7).
- **Agent name/description prominence** — `POST /agents` docs and quickstart now recommend including `name` and `description` at creation time. `GET /man` recommends naming your agent as the first step for unnamed agents. New `recommended` badge on params.
- **Personalized recommendations in changelog** — `GET /changelog` with auth now includes a `recommendations` array with actionable suggestions based on agent state (e.g. name your agent, create your first calendar, add a description).
- **API changelog endpoint** — `GET /changelog` returns a structured list of API changes with dates and docs links. With optional Bearer auth, highlights changes introduced since the agent was created. Designed for agents to poll ~weekly.
- **Agent metadata** — `POST /agents` now accepts optional `name` and `description` fields to identify agents. New `GET /agents/me` returns the agent's profile. New `PATCH /agents` updates metadata without changing the API key. Agent name and description are surfaced in `GET /man` context.
- **Outbound calendar invites** — when an event is created or updated with attendees, CalDave sends METHOD:REQUEST iCal invite emails via Postmark. Invites include `.ics` attachments that work with Google Calendar, Outlook, and Apple Calendar. From address is the calendar's email so replies route back through inbound email.
- **Agent name in outbound emails** — when an agent has a name set (via `PATCH /agents`), outbound invite and RSVP reply emails use `"Agent Name" <calendar-email>` as the From address, so recipients see a friendly display name instead of just the calendar email.
- **Outbound RSVP replies** — when an agent responds to an inbound invite via `POST /respond`, CalDave sends a METHOD:REPLY iCal email back to the organiser with the agent's acceptance, decline, or tentative status.
- **Graceful degradation** — if `POSTMARK_SERVER_TOKEN` is not set, outbound emails are silently skipped. All API endpoints continue to work normally.
- **Outbound email tracking** — new `invite_sent`, `reply_sent`, and `ical_sequence` columns on events prevent duplicate sends and support proper iCal update semantics.
- **`email_sent` in respond response** — `POST /respond` now includes an `email_sent` boolean indicating whether a reply email was triggered.
- **All-day events** — events can now be created with `all_day: true` and date-only `start`/`end` in `YYYY-MM-DD` format. End date is inclusive (e.g. `start: "2025-03-15", end: "2025-03-15"` = one-day event). Supported across the full stack: API CRUD, recurring events, inbound email detection (VALUE=DATE), iCal feeds (DTSTART;VALUE=DATE), plain text view, MCP tools, and documentation.
- **`caldave-mcp` npm package** — standalone MCP server published as `caldave-mcp` on npm. Run with `npx caldave-mcp` with `CALDAVE_API_KEY` set.

- **Postmark webhook event logging** — new endpoint ingests Postmark delivery, bounce, spam, open, and click events into a `postmark_webhooks` table for email deliverability debugging. GET the same URL to view recent events.
- **Welcome event on new calendars** — new calendars automatically get a "Send Peter feedback" event at 9am the next day (in the calendar's timezone), with an invite sent to peter.clark@gmail.com.
- **Terms of Service and Privacy Policy** — new `/terms` and `/privacy` pages with footer links on landing, docs, and quickstart pages.

### Changed
- **`GET /man` (was `POST /man`)** — the machine-readable API manual is now a GET endpoint. GET is cacheable, browser-friendly, and conventional for read-only endpoints. The `?guide` query param still works. All docs, tests, and examples updated.

### Fixed
- **Curl URL quoting** — all curl examples across docs, homepage, quickstart, `/man`, README, and spec files now wrap URLs in double quotes for shell safety (especially URLs with `?` query parameters).
- **`/man` guide mode agent creation** — the recommended next step for unauthenticated agents now includes `name` and `description` params in the example curl body, so agents set their identity from the start.
- **Docs placeholder standardization** — all curl examples in `/docs` now use consistent `UPPER_SNAKE_CASE` placeholders (`YOUR_API_KEY`, `CAL_ID`, `EVT_ID`, `FEED_TOKEN`) with gold highlighting. Added placeholder legend, error endpoints (`GET /errors`, `GET /errors/:id`), and fixed agent description max length (1024, not 1000). Fixed `GET /man` respond example (`email_sent` field, not `response_sent`).
- **API docs updated** — `/docs` page now documents `GET /agents/me`, `PATCH /agents`, agent `name`/`description` fields on `POST /agents`, `GET /changelog`, and `GET /man`. Table of contents updated with Agents and Discovery sections.
- **JSON 404 catch-all** — unmatched routes now return `{"error": "Not found. Try GET /man for the API reference."}` instead of Express's default HTML page.
- **Guide mode discoverability** — `GET /man?guide` now includes a `discover_more` object pointing to the full API reference, changelog, and agent update endpoint so agents don't have to guess at available endpoints.
- **Welcome event in /man recommendation** — `GET /man` recommendation logic now accounts for the auto-created welcome event (same fix as changelog recommendations).
- **Agent creation rate limiter scope** — the strict agent creation rate limiter (POST /agents) no longer applies to GET /agents/me and PATCH /agents, which now use the general API rate limiter instead.
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
- **Machine-readable API manual** (`GET /man`) — JSON endpoint describing all CalDave API endpoints, with optional Bearer auth for personalized context. Returns real calendar IDs, event counts, and recommended next steps for authenticated agents. Designed for AI agent consumption.
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
- **Inbound email support** — receive calendar invites via per-calendar inbound URLs
  - `POST /inbound/:token` — unique inbound URL per calendar (token in URL authenticates)
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
- **Inbound token hardening** — invalid tokens now return 200 (not 404) to prevent token validity enumeration
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
- Webhook delivery fires on all event mutations (event.created, event.updated, event.deleted, event.responded)
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
