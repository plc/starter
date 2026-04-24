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
| `DATABASE_URL` | - | PostgreSQL connection string (auto-constructed in compose file) |
| `DB_NAME` | `myapp` | Database name for PostgreSQL init script |
| `PG_USER` | `postgres` | PostgreSQL username (docker-compose.postgres.yml only) |
| `PG_PASSWORD` | `postgres` | PostgreSQL password (docker-compose.postgres.yml only) |
| `PG_PORT` | `5432` | Host port for PostgreSQL (change if 5432 is already in use) |

## Database

The app uses `src/db.js` as a thin abstraction over SQLite or PostgreSQL. The `DB_TYPE` env var controls which backend is used.

**SQLite (default):**
- File-based, stored at `SQLITE_PATH` (default: `./data/myapp.db`)
- WAL mode enabled for better concurrent read performance
- No external database server needed
- Parameter placeholders: `?`

**PostgreSQL:**
- Connection via `DATABASE_URL` environment variable
- Uses connection pooling (`pg.Pool`)
- Parameter placeholders: `$1`, `$2`, etc.

### db.js API

```javascript
const db = require('./db');

// Query -- returns { rows } for reads, { rows, changes, lastInsertRowid } for writes
const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

// Health check (returns { time, version })
const health = await db.healthCheck();

// Close connection
await db.close();

// Check type
console.log(db.dbType); // 'sqlite' or 'postgres'
```

See [fly-deploy.md](fly-deploy.md) for Fly deployment with either database.

## Docker

### SQLite Mode (default)

```
docker compose up
+----------------------------------+
|                                  |
|       app (node.js)              |
|         port $PORT               |
|           |                      |
+-----------|----------------------+
            |
            v
     ./data/myapp.db (volume)
```

Single service. SQLite file persisted via volume mount.

### PostgreSQL Mode

```
docker compose up
+---------------------------------------------------------+
|                                                         |
|  postgres (5432) <- init-db (one-shot) <- app (node.js) |
|     |                  migrations          port $PORT   |
|     v                                         |         |
|   pgdata (volume)                             |         |
+---------------------------------------------------------+
                                                |
                                                v
                                          localhost:$PORT
                                           (for browser)
```

Three services, all in Docker. PostgreSQL data persists in a named volume. Matches the Fly.io production setup where Postgres also runs as its own app.

Connect from host: `psql postgres://postgres:postgres@localhost:5432/myapp`

### Key Principles

1. **SQLite mode**: No external database needed. Data stored in `./data/` directory.
2. **PostgreSQL mode**: All services run in Docker. Postgres data persists in a named volume.
3. **One compose file per mode** -- `docker-compose.yml` (SQLite) or `docker-compose.postgres.yml` (PostgreSQL)
4. **During init, remove the unused compose file** to avoid confusion

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Connection refused" (pg mode) | Postgres container not ready | Check `docker compose logs postgres`; healthcheck should handle this |
| "Database does not exist" (pg mode) | init-db didn't run | Check init-db logs |
| Port 5432 already in use | Host PostgreSQL running | Stop host Postgres or change `PG_PORT` in `.env` |
| SQLite "database is locked" | Multiple writers | Use WAL mode (enabled by default in db.js) |

## Important Notes

1. **Don't modify fly.toml app name manually** - It gets set by `fly launch`
2. **DB choice is permanent per project** - Chosen at init time, not runtime-switchable
3. **SQLite on Fly.io requires a volume** and exactly 1 machine
4. **Deterministic ports** - Each project gets a unique port (3000-3999) based on its name to avoid conflicts
