# CalDave

A calendar-as-a-service API for AI agents. Agents own calendars, create and manage events, and poll for upcoming events via a REST API. Humans can subscribe to agent calendars via standard iCal feeds.

## Documentation

- **[README.md](README.md)** — This file. Setup, usage, and deployment instructions.
- **[SPEC.md](SPEC.md)** — Technical details: endpoints, project structure, environment variables.
- **[CALDAVE_SPEC.md](CALDAVE_SPEC.md)** — Full API specification with schema, auth model, and architecture decisions.
- **[CLAUDE.md](CLAUDE.md)** — Instructions for Claude Code AI assistant.
- **[CHANGELOG.md](CHANGELOG.md)** — Project history and changes.
- **[GOTCHAS.md](GOTCHAS.md)** — Known issues and post-mortems.
- **[fly-deploy.md](fly-deploy.md)** — Fly.io deployment reference and troubleshooting.

## What's Included

- **REST API** for agent provisioning, calendar management, and event CRUD
- **iCal feeds** — subscribe from Google Calendar, Apple Calendar, etc.
- **Bearer token auth** with SHA-256 hashed API keys
- **PostgreSQL** database with auto-initializing schema
- **Docker** setup for local development
- **Fly.io** configuration for production deployment
- **MCP server** for AI agents using the Model Context Protocol
- **Status page** at `/` showing server and database health

## Prerequisites

- [Docker](https://www.docker.com/) (required)
- [Node.js](https://nodejs.org/) v20+ (optional, for local dev without Docker)
- [Fly CLI](https://fly.io/docs/flyctl/install/) (for production deployment)
- PostgreSQL running locally on port 5432

## Quick Start

```bash
git clone <this-repo>
cd caldave
docker compose up --build
```

Open http://127.0.0.1:3720 to see the status page.

The database and schema are created automatically.

### Create an agent and start using the API:

```bash
# Create an agent (returns API key — save it!)
curl -s -X POST http://127.0.0.1:3720/agents | jq

# Create a calendar
curl -s -X POST http://127.0.0.1:3720/calendars \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"name": "Work Schedule", "timezone": "America/Denver"}' | jq

# Create an event
curl -s -X POST http://127.0.0.1:3720/calendars/CAL_ID/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"title": "Daily standup", "start": "2025-03-01T09:00:00-07:00", "end": "2025-03-01T09:15:00-07:00"}' | jq

# Check upcoming events
curl -s http://127.0.0.1:3720/calendars/CAL_ID/upcoming \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | No | Status page |
| `GET /health` | No | Server health check |
| `GET /health/db` | No | Database health check |
| `POST /agents` | No | Create agent (returns API key) |
| `POST /calendars` | Yes | Create calendar |
| `GET /calendars` | Yes | List agent's calendars |
| `GET /calendars/:id` | Yes | Get calendar details |
| `PATCH /calendars/:id` | Yes | Update calendar |
| `DELETE /calendars/:id` | Yes | Delete calendar + events |
| `POST /calendars/:id/events` | Yes | Create event |
| `GET /calendars/:id/events` | Yes | List events (filterable by start, end, status) |
| `GET /calendars/:id/events/:eid` | Yes | Get single event |
| `PATCH /calendars/:id/events/:eid` | Yes | Update event |
| `DELETE /calendars/:id/events/:eid` | Yes | Delete event |
| `GET /calendars/:id/upcoming` | Yes | Next N events from now |
| `GET /calendars/:id/view` | Yes | Plain text table of upcoming events |
| `POST /calendars/:id/events/:eid/respond` | Yes | Accept/decline invite |
| `GET /feeds/:id.ics?token=TOKEN` | Feed token | iCal feed (subscribable) |
| `POST /inbound/:token` | Token in URL | Inbound email webhook (per-calendar) |

Auth = `Authorization: Bearer <api_key>` (except feeds and inbound webhook)

See [CALDAVE_SPEC.md](CALDAVE_SPEC.md) for full request/response examples.

## Project Structure

```
├── src/
│   ├── index.js              # Express server, routes, status page
│   ├── healthcheck.js        # Health check script (npm test)
│   ├── db.js                 # Postgres pool + schema initialization
│   ├── lib/
│   │   ├── ids.js            # nanoid-based ID generation (agt_, cal_, evt_, inb_)
│   │   ├── keys.js           # SHA-256 API key hashing
│   │   └── recurrence.js     # RRULE parsing + instance materialization
│   ├── middleware/
│   │   ├── auth.js           # Bearer token auth
│   │   └── rateLimit.js      # Rate limiting (express-rate-limit)
│   └── routes/
│       ├── agents.js         # POST /agents
│       ├── calendars.js      # Calendar CRUD
│       ├── events.js         # Event CRUD + upcoming + respond
│       ├── feeds.js          # iCal feed generation
│       └── inbound.js        # Inbound email webhook (per-calendar token URL)
│   └── mcp.mjs              # MCP server (STDIO transport, 8 tools)
├── scripts/
│   ├── init-db.sh            # Creates database if it doesn't exist
│   └── get-port.sh           # Generates deterministic port from project name
├── Dockerfile                # Production container image
├── docker-compose.yml        # Local development setup
├── fly.toml                  # Fly.io deployment configuration
├── package.json              # Node.js dependencies and scripts
├── .env.example              # Environment variable template
└── CLAUDE.md                 # Instructions for AI assistants
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (CalDave uses 3720 via `get-port.sh`) |
| `DATABASE_URL` | `postgres://plc:postgres@host.docker.internal:5432/caldave` | PostgreSQL connection string |
| `DB_NAME` | `caldave` | Database name (used by init script) |
| `CALDAVE_DOMAIN` | `caldave.ai` | Domain for generated calendar email addresses |

## Local Development

### With Docker (Recommended)

```bash
# Start the app (builds and runs in foreground)
docker compose up --build

# Or run in background
docker compose up --build -d

# View logs
docker compose logs -f app

# Stop
docker compose down
```

### Without Docker

```bash
# Install dependencies
npm install

# Create the database
createdb caldave

# Start the server with auto-reload
DATABASE_URL=postgres://plc:postgres@localhost:5432/caldave PORT=3720 npm run dev

# Test the health endpoint
npm test
```

## Deploy to Fly.io

> **See [fly-deploy.md](fly-deploy.md) for complete reference and troubleshooting.**

### First-Time Setup

1. **Install Fly CLI** and login:
   ```bash
   brew install flyctl
   fly auth login
   ```

2. **Launch your app**:
   ```bash
   fly launch
   # - Choose app name and region
   # - Say NO to Postgres (we create it separately)
   # - Say NO to deploy now
   ```

3. **Create Managed Postgres** (via Dashboard):
   - Go to https://fly.io/dashboard → Postgres → Create
   - Choose same region as your app
   - Note the **cluster ID** and copy the **connection string** from Connect tab

4. **Set DATABASE_URL and deploy**:
   ```bash
   fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require"
   fly deploy
   ```

### Subsequent Deploys

```bash
fly deploy
```

## Troubleshooting

### Database connection failed

1. **Local**: Make sure PostgreSQL is running on port 5432
   ```bash
   pg_isready
   ```

2. **Docker**: The init-db script creates the database automatically. Check logs:
   ```bash
   docker compose logs init-db
   ```

3. **Fly.io**: Make sure DATABASE_URL is set:
   ```bash
   fly secrets list
   ```

### Port already in use

Change the port in docker-compose.yml or set a different `PORT` env var.

### Browser redirects to HTTPS

Use `http://127.0.0.1:3720` instead of `localhost`, or use an incognito window.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (Node.js --watch) |
| `npm test` | Run health check against running server |
| `npm run mcp` | Start MCP server (STDIO transport) |

## License

MIT
