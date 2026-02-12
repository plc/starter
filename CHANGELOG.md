# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
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
- Calendar email address generation (deferred inbound email, but addresses created)
- Full API spec in `CALDAVE_SPEC.md`

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
