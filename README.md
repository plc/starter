# Starter

A minimal Node.js starter template with SQLite/PostgreSQL, Docker, and Fly.io deployment.

## Documentation

- **[README.md](README.md)** - This file. Setup, usage, and deployment instructions.
- **[SPEC.md](SPEC.md)** - Project-specific details: endpoints, structure, environment variables.
- **[CLAUDE.md](CLAUDE.md)** - Instructions for Claude Code AI assistant. Workflow and maintenance guidelines.
- **[CHANGELOG.md](CHANGELOG.md)** - Project history, changes, and learnings.
- **[GOTCHAS.md](GOTCHAS.md)** - Known issues, confusing behaviors, and post-mortems.
- **[fly-deploy.md](fly-deploy.md)** - Fly.io deployment reference and troubleshooting.

## What's Included

- **Express.js** server with health check endpoints
- **SQLite** database (default) or **PostgreSQL** (optional)
- **Docker** setup for local development
- **Fly.io** configuration for production deployment
- **Status page** at `/` showing server and database health

## Prerequisites

- [Docker](https://www.docker.com/) (required)
- [Node.js](https://nodejs.org/) v20+ (optional, for local dev without Docker)
- [Fly CLI](https://fly.io/docs/flyctl/install/) (for production deployment)
- PostgreSQL running locally on port 5432 (only if using PostgreSQL mode)

## Quick Start

```bash
git clone <this-repo> my-project
cd my-project
docker compose up --build
```

Open http://127.0.0.1:3000 to see the status page.

That's it! SQLite is the default -- no external database needed.

## Database Options

This starter supports two database backends, chosen at project init time:

| | SQLite (default) | PostgreSQL |
|---|---|---|
| **Best for** | Simple apps, prototypes, MVPs | Multi-user apps, complex queries |
| **Setup** | Zero config | Requires PostgreSQL on host |
| **Compose file** | `docker-compose.yml` | `docker-compose.postgres.yml` |
| **Fly.io** | Volume + 1 machine | Managed Postgres (MPG) |

See CLAUDE.md "Step 0: Choose Database" for decision criteria.

## Project Structure

```
src/
  index.js          # Express server with routes and status page
  db.js             # Database abstraction (SQLite/PostgreSQL)
  healthcheck.js    # Health check script for testing
scripts/
  init-db.sh        # Creates PostgreSQL database if needed
  get-port.sh       # Generates deterministic port from project name
Dockerfile          # Production container image
docker-compose.yml          # Local dev (SQLite mode)
docker-compose.postgres.yml # Local dev (PostgreSQL mode)
fly.toml            # Fly.io deployment configuration
.claude/            # Claude Code settings
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (use `./scripts/get-port.sh` for deterministic port) |
| `DB_TYPE` | `sqlite` | Database backend: `sqlite` or `postgres` |
| `SQLITE_PATH` | `./data/myapp.db` | SQLite database file path |
| `DATABASE_URL` | - | PostgreSQL connection string (when DB_TYPE=postgres) |
| `DB_NAME` | `myapp` | Database name for PostgreSQL init script |

### Customizing for Your Project

Replace `myapp` with your project name and set a deterministic port:

```bash
# On macOS
sed -i '' 's/myapp/my-project-name/g' package.json docker-compose.yml .env.example

# Generate a deterministic port (avoids conflicts when running multiple projects)
PORT=$(./scripts/get-port.sh my-project-name)
sed -i '' "s/PORT=3000/PORT=$PORT/" .env.example

# Create your .env file
cp .env.example .env
```

Or manually update `package.json`, `docker-compose.yml`, and `.env.example`.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Status page showing server and database health |
| `GET /health` | JSON health check (server only) |
| `GET /health/db` | JSON health check (server + database, shows DB type) |

## Local Development

### With Docker (Recommended)

```bash
# SQLite mode (default)
docker compose up --build

# PostgreSQL mode
docker compose -f docker-compose.postgres.yml up --build

# View logs
docker compose logs -f app

# Stop
docker compose down
```

### Without Docker

```bash
# Install dependencies
npm install

# Create and configure .env
cp .env.example .env

# Start the server with auto-reload
npm run dev

# Test the health endpoint
npm test
```

## Deploy to Fly.io

> **See [fly-deploy.md](fly-deploy.md) for complete reference and troubleshooting.**

### SQLite Deployment

```bash
fly launch                              # Create app (say NO to Postgres, NO to deploy)
fly volumes create data --size 1        # Create volume for SQLite
# Uncomment [mounts] section in fly.toml
fly scale count 1                       # SQLite needs exactly 1 machine
fly deploy
```

### PostgreSQL Deployment

```bash
fly launch                              # Create app (say NO to Postgres, NO to deploy)
# Create Managed Postgres via Fly Dashboard
fly secrets set DATABASE_URL="..."      # Set connection string
fly deploy
```

See [fly-deploy.md](fly-deploy.md) for details.

## Troubleshooting

### Database connection failed (PostgreSQL mode)

1. Make sure PostgreSQL is running on port 5432: `pg_isready`
2. Check init-db logs: `docker compose -f docker-compose.postgres.yml logs init-db`
3. On Fly.io, check DATABASE_URL: `fly secrets list`

### Port already in use

Change the port in your `.env` file or docker-compose.yml.

### Browser redirects to HTTPS

Use `http://127.0.0.1:PORT` instead of `localhost`. Or use an incognito window.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (Node.js --watch) |
| `npm test` | Run health check against running server |

## License

MIT
