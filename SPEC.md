# SPEC.md

Project-specific details and context. This file is unique to each project.

## Project Overview

This is a Node.js starter template with:
- Express.js web server
- PostgreSQL database
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

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Status page showing server and database health |
| `GET /health` | JSON health check (server only) |
| `GET /health/db` | JSON health check (server + database) |

## Project Structure

```
src/index.js        - Main Express server with routes
src/healthcheck.js  - Health check script
scripts/init-db.sh  - Database initialization (Docker only)
scripts/get-port.sh - Deterministic port generation from project name
Dockerfile          - Production container
docker-compose.yml  - Local development
fly.toml            - Fly.io configuration
```

## Key Files to Modify

When adding features:

- **src/index.js** - Add new routes and endpoints
- **package.json** - Add new dependencies
- **docker-compose.yml** - Add new services or environment variables
- **fly.toml** - Modify deployment settings

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (generated from project name via `scripts/get-port.sh`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_NAME` | Database name for init script |

## Database

- **Local**: PostgreSQL runs on host machine (accessed via `host.docker.internal:5432`)
- **Production**: Fly Postgres (DATABASE_URL set by `fly postgres attach`)

The `scripts/init-db.sh` creates the database if needed and runs migrations.

## Important Notes

1. **Don't modify fly.toml app name manually** - It gets set by `fly launch`
2. **DATABASE_URL format**: `postgres://user:password@host:port/database`
3. **Local uses `host.docker.internal`** - Connects to host PostgreSQL, not a containerized one
4. **One PostgreSQL, many databases** - Each project has its own database name
5. **Deterministic ports** - Each project gets a unique port (3000-3999) based on its name to avoid conflicts
