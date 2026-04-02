# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- SQLite support as the default database (via `better-sqlite3`)
- Database abstraction layer (`src/db.js`) supporting both SQLite and PostgreSQL
- `docker-compose.postgres.yml` for PostgreSQL mode
- `DB_TYPE` environment variable to choose database backend
- `SQLITE_PATH` environment variable for SQLite file location
- SQLite volume mount option in `fly.toml` for Fly.io deployment
- `.claude/settings.json` with default Claude Code permissions
- `.dockerignore` to speed up Docker builds (excludes node_modules, .git, docs, data)
- `APP_NAME` environment variable for status page display name
- Graceful shutdown handler (SIGTERM/SIGINT) -- closes DB connection and HTTP server cleanly
- `PG_USER` and `PG_PASSWORD` env vars in docker-compose.postgres.yml (no more hardcoded credentials)

### Changed
- Init Step 1 now removes the starter origin (`git remote remove origin`) to prevent accidental commits back to plc/starter
- Claude will file GitHub issues on plc/starter if it finds bugs in the starter repo itself
- Default database is now SQLite (was PostgreSQL)
- `docker-compose.yml` now runs in SQLite mode (no init-db service needed)
- `src/index.js` uses `db.js` abstraction instead of direct `pg` usage
- Status page and health endpoints now show database type
- Updated all documentation for dual-database support
- Replaced `.claude/settings.local.json` with clean `.claude/settings.json`
- SQLite query detection in db.js now uses `stmt.reader` instead of SQL string parsing (correctly handles RETURNING, EXPLAIN, comments, etc.)
- Status page app name comes from `APP_NAME` env var instead of `npm_package_name` (works in Docker CMD)
- Status page HTML escapes app name to prevent XSS
- Fly.io deployment details in CLAUDE.md replaced with reference to fly-deploy.md (saves tokens)
- PostgreSQL init step now includes Dockerfile cleanup (remove native build tool lines)

### Fixed
- SQL injection in `scripts/init-db.sh` -- database name now quoted as identifier
- db.js incorrectly classified RETURNING, EXPLAIN, VALUES queries as write operations
- Status page showed "myapp" in production because `npm_package_name` is only set via `npm start`

### Notes
- Database choice is permanent per project, made at init time (Step 0)
- SQLite uses `?` parameter placeholders; PostgreSQL uses `$1`
- SQLite on Fly.io requires a volume and exactly 1 machine
- `better-sqlite3` requires native build tools in Alpine Docker (handled in Dockerfile)
- Both database drivers ship in package.json; the unused one is removed during project init

---

## [0.1.0] - 2026-03-01

### Added
- Initial project setup
- Express.js server with health check endpoints (`/health`, `/health/db`)
- Status page at `/` showing server and database health
- PostgreSQL database connection
- Docker development environment with auto-database creation
- Fly.io deployment configuration
- Deterministic port generation (`scripts/get-port.sh`) - each project gets a unique port (3000-3999) based on its name
- Comprehensive Fly.io Managed Postgres (MPG) documentation (`fly-deploy.md`)

### Changed
- Changed local PostgreSQL username from `postgres` to `plc` across all config and docs
- Updated Fly.io deployment instructions to use Managed Postgres instead of old Fly Postgres
- Compacted CLAUDE.md to reduce token usage (no info lost)
- Added explicit reminder to update CHANGELOG before committing

### Notes
- Uses `host.docker.internal` to connect to host PostgreSQL (not a separate container)
- Database auto-created by `init-db` service on `docker compose up`
- Run `fly launch` before `fly deploy` to create the app on Fly.io
- Port is generated from project name hash to avoid conflicts when running multiple projects
- **Fly Postgres has two products**: Managed Postgres (MPG) is current/recommended; old Fly Postgres is legacy
- MPG clusters are NOT Fly apps -- use `fly mpg` commands, not `fly postgres` commands

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
