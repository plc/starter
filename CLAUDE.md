# CLAUDE.md

Instructions for Claude Code. For project-specific details, see [SPEC.md](SPEC.md). For the full API spec, see [CALDAVE_SPEC.md](CALDAVE_SPEC.md).

## Project Overview

CalDave is a calendar-as-a-service API for AI agents. The stack is Node.js + Express + PostgreSQL + Docker, deployed on Fly.io.

### Key Architecture Details

- **Schema-on-startup**: Tables are created via `CREATE TABLE IF NOT EXISTS` in `src/db.js` — no migration tool
- **Auth**: API keys are SHA-256 hashed and looked up directly by hash (not bcrypt)
- **IDs**: nanoid with prefixes (`agt_`, `cal_`, `evt_`, `feed_`, `inb_`, `sk_live_`)
- **Database**: PostgreSQL runs on the **host machine**, not in Docker — accessed via `host.docker.internal:5432`
- **Port**: 3720 (generated from `./scripts/get-port.sh caldave`)

## QA Testing

Use the credentials in `.env.test` (not committed) to test the API after making changes. The server must be running locally.

```bash
# Load credentials
source .env.test

# Health check
curl -s http://127.0.0.1:3720/health

# List calendars (verifies auth + DB)
curl -s http://127.0.0.1:3720/calendars \
  -H "Authorization: Bearer $CALDAVE_API_KEY"

# Create a test event
curl -s -X POST http://127.0.0.1:3720/calendars/$CALDAVE_CALENDAR_ID/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CALDAVE_API_KEY" \
  -d '{"title": "QA test", "start": "2099-01-01T00:00:00Z", "end": "2099-01-01T01:00:00Z"}'

# Check upcoming
curl -s http://127.0.0.1:3720/calendars/$CALDAVE_CALENDAR_ID/upcoming \
  -H "Authorization: Bearer $CALDAVE_API_KEY"
```

## Common Tasks

```bash
# Start local dev server
docker compose up --build
# Or without Docker:
DATABASE_URL=postgres://plc:postgres@localhost:5432/caldave PORT=3720 npm run dev

# Test health
curl http://127.0.0.1:3720/health

# Create an agent
curl -s -X POST http://127.0.0.1:3720/agents

# Deploy to Fly.io
fly deploy
```

## Documentation Maintenance

**Keep docs updated as you work, not after.**

| File | When to Update |
|------|----------------|
| **CHANGELOG.md** | After every significant change |
| **SPEC.md** | When project structure, endpoints, or env vars change |
| **CALDAVE_SPEC.md** | When API contract changes (new endpoints, schema changes) |
| **README.md** | When user-facing details change |
| **GOTCHAS.md** | When you encounter problems |

**IMPORTANT: When adding or changing public API endpoints, you MUST update ALL of these:**
1. **`src/routes/docs.js`** — the HTML docs page at `/docs` (endpoint card + table of contents)
2. **`src/routes/changelog.js`** — the structured `CHANGELOG` array served by `GET /changelog`
3. **`src/routes/man.js`** — the `getEndpoints()` array served by `POST /man`
4. **`CHANGELOG.md`** — the human-readable changelog
5. **`CALDAVE_SPEC.md`** — the full API spec

These are all separate and must be kept in sync. Missing any one means agents or humans won't discover the new endpoint.

## Git Workflow

- **Update CHANGELOG.md before committing** — include it in the same commit as your changes
- **Commit** changes locally after completing work
- **DO NOT push** to origin without explicit user permission
- After committing, remind the user to push if they want to update the remote

## Deploying to Fly.io

### Step 1: Create the App

```bash
fly launch
# - Choose app name and region
# - Say NO to Postgres (we create it separately)
# - Say NO to deploy now
```

### Step 2: Create Managed Postgres

**Use the Fly Dashboard (not CLI) for Managed Postgres:**

1. Go to https://fly.io/dashboard → Postgres → Create
2. Choose a name and region (same region as your app)
3. Note the **cluster ID** (e.g., `abc123xyz`) — needed for CLI access
4. Go to **Extensions** tab → enable any needed extensions
5. Go to **Connect** tab → copy the connection string

### Step 3: Set DATABASE_URL Secret

```bash
fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require" -a YOUR_APP
```

### Step 4: Deploy

```bash
fly deploy
fly open  # Verify
```

For subsequent deploys: `fly deploy`

### Fly Postgres: Two Different Products

Fly has **two separate Postgres products** with different CLI commands:

|                    | Managed Postgres (MPG)      | Old Fly Postgres           |
|--------------------|-----------------------------|-----------------------------|
| **Status**         | Current, recommended        | Legacy                      |
| **Created via**    | Dashboard or `fly mpg create` | `fly postgres create`     |
| **Is a Fly app?**  | No                          | Yes                         |
| **Listed by**      | `fly mpg list`              | `fly postgres list`         |
| **Connect via**    | `fly mpg connect <cluster-id>` | `fly postgres connect -a <app>` |
| **Attach to app**  | Manual `fly secrets set`    | `fly postgres attach`       |
| **Default DB name**| `fly-db`                    | User-specified              |

### Common Mistakes to Avoid

- **Don't use `fly postgres attach`** — Only works with old Fly Postgres, not MPG
- **Don't expect `fly postgres list` to show MPG clusters** — Use `fly mpg list` instead
- **Don't use `fly proxy` with MPG** — Use `fly mpg connect <cluster-id>` instead
- **The database name is `fly-db`** — Not the cluster name, not your app name

### Connecting to Managed Postgres

```bash
# Interactive psql session
fly mpg connect <cluster-id>

# Proxy for local tools (runs in foreground)
fly mpg connect <cluster-id> --port 15432

# Then in another terminal:
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db"
```

### Syncing Local Database to Fly

```bash
# Terminal 1: Start proxy
fly mpg connect <cluster-id> --port 15432

# Terminal 2: Dump and restore
pg_dump -U plc --clean --if-exists caldave > backup.sql
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db" < backup.sql
```

### Troubleshooting Fly Postgres

| Error | Cause | Solution |
|-------|-------|----------|
| "App not found" on `fly postgres attach` | You have MPG, not old Fly Postgres | Use `fly secrets set DATABASE_URL` instead |
| `fly postgres list` shows nothing | MPG clusters aren't apps | Use `fly mpg list` |
| Can't connect with `fly proxy` | MPG uses different command | Use `fly mpg connect <cluster-id> --port 15432` |
| "role postgres does not exist" on deploy | DATABASE_URL secret not set | Run `fly secrets set DATABASE_URL="..."` |

## Docker Architecture

```
docker compose up
┌─────────────────────────────────────────────────────────┐
│                                                         │
│       init-db (one-shot) ──────→ app (node.js)         │
│          creates DB               port $PORT            │
│              │                        │                 │
└──────────────│────────────────────────│─────────────────┘
               │                        │
               ▼                        ▼
      host.docker.internal:5432   localhost:$PORT
         (host PostgreSQL)         (for browser)
```

### Key Principles

1. **PostgreSQL runs on HOST machine** — shared across all projects via `host.docker.internal:5432`
2. **One PostgreSQL, many databases** — each project uses a different database NAME
3. **init-db service** — creates database, then exits
4. **app service** — waits for init-db to complete before starting
5. **Schema init** — tables created by the app on startup, not by init-db

## PostgreSQL

- **Connection strings**: `postgres://user:password@host:port/database`
- **Default credentials** (local dev only): `plc:postgres`
- **Database name**: `caldave`
- **Schema**: Auto-created on app startup — see `src/db.js`
