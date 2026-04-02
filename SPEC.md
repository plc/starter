# SPEC.md

Project-specific details and context. This file is unique to each project.

## Project Overview

This is a Node.js starter template with:
- Express.js web server
- Database support (SQLite default, PostgreSQL optional)
- Docker for local development
- Fly.io for production deployment

## Common Tasks

### Start Local Development Server

```bash
docker compose up --build
```

The server runs at http://127.0.0.1:$PORT (port is set in .env)

### Run Tests

```bash
# With server running
npm test

# Or use curl
curl http://127.0.0.1:3000/health
```

### Deploy

```bash
fly deploy
```

For first-time setup, see [fly-deploy.md](fly-deploy.md).

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Status page showing server and database health |
| `GET /health` | JSON health check (server only) |
| `GET /health/db` | JSON health check (server + database) |

## Project Structure

```
src/index.js              - Main Express server with routes
src/db.js                 - Database abstraction (SQLite/PostgreSQL)
src/healthcheck.js        - Health check script
scripts/init-db.sh        - PostgreSQL database initialization (Docker only)
scripts/get-port.sh       - Deterministic port generation from project name
Dockerfile                - Production container
docker-compose.yml        - Local development (SQLite mode)
docker-compose.postgres.yml - Local development (PostgreSQL mode)
fly.toml                  - Fly.io configuration
```

## Key Files to Modify

When adding features:

- **src/index.js** - Add new routes and endpoints
- **src/db.js** - Database queries use this module
- **package.json** - Add new dependencies
- **docker-compose.yml** - Add new services or environment variables
- **fly.toml** - Modify deployment settings

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `myapp` | Application name (shown on status page) |
| `PORT` | `3000` | Server port (generated from project name via `scripts/get-port.sh`) |
| `DB_TYPE` | `sqlite` | Database type: `sqlite` or `postgres` |
| `SQLITE_PATH` | `./data/myapp.db` | Path to SQLite database file |
| `DATABASE_URL` | - | PostgreSQL connection string (when DB_TYPE=postgres) |
| `DB_NAME` | `myapp` | Database name for PostgreSQL init script |
| `PG_USER` | `plc` | PostgreSQL username (docker-compose.postgres.yml only) |
| `PG_PASSWORD` | `postgres` | PostgreSQL password (docker-compose.postgres.yml only) |

## Database

- **SQLite (default)**: File-based, stored at `SQLITE_PATH`. No external database needed.
- **PostgreSQL**: Connects via `DATABASE_URL`. Local dev uses host PostgreSQL via `host.docker.internal:5432`.

The `src/db.js` module provides a uniform `query()` interface for both backends.

Parameter placeholders differ: SQLite uses `?`, PostgreSQL uses `$1`.

See [fly-deploy.md](fly-deploy.md) for Fly deployment with either database.

## Important Notes

1. **Don't modify fly.toml app name manually** - It gets set by `fly launch`
2. **DB choice is permanent per project** - Chosen at init time, not runtime-switchable
3. **SQLite on Fly.io requires a volume** and exactly 1 machine
4. **Deterministic ports** - Each project gets a unique port (3000-3999) based on its name to avoid conflicts
