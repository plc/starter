# SPEC.md — CalDave

Calendar-as-a-service API for AI agents. Agents own calendars, create events, and poll for upcoming events via REST API.

## Common Tasks

```bash
# Start local dev server (requires Postgres on host)
docker compose up --build
# Or without Docker:
DATABASE_URL=postgres://plc:postgres@localhost:5432/caldave PORT=3720 npm run dev

# Test health
curl http://127.0.0.1:3720/health

# Create an agent
curl -X POST http://127.0.0.1:3720/agents

# Deploy
fly deploy
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
| `GET /calendars/:id/events` | Yes | List events (filterable) |
| `GET /calendars/:id/events/:eid` | Yes | Get single event |
| `PATCH /calendars/:id/events/:eid` | Yes | Update event |
| `DELETE /calendars/:id/events/:eid` | Yes | Delete event |
| `GET /calendars/:id/upcoming` | Yes | Next N events from now |
| `POST /calendars/:id/events/:eid/respond` | Yes | Accept/decline invite |

Auth = `Authorization: Bearer <api_key>`

## Project Structure

```
src/
├── index.js              — Express server, routes, status page
├── healthcheck.js        — Health check script (npm test)
├── db.js                 — Postgres pool + schema init
├── lib/
│   ├── ids.js            — nanoid-based ID generation (agt_, cal_, evt_)
│   └── keys.js           — SHA-256 API key hashing
├── middleware/
│   ├── auth.js           — Bearer token auth
│   └── rateLimitStub.js  — Stub rate limit headers
└── routes/
    ├── agents.js         — POST /agents
    ├── calendars.js      — Calendar CRUD
    └── events.js         — Event CRUD + upcoming + respond
scripts/
├── init-db.sh            — Creates DB if not exists (Docker)
└── get-port.sh           — Deterministic port from project name
```

## Database Schema

Three tables: `agents`, `calendars`, `events`. Schema auto-created on startup.

See `CALDAVE_SPEC.md` for full column definitions.

Key indexes: `events(calendar_id, start_time)`, `events(calendar_id, status)`, `calendars(email)`, `calendars(agent_id)`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (CalDave uses 3720) |
| `DATABASE_URL` | — | Postgres connection string |
| `DB_NAME` | `caldave` | Database name for init script |
| `CALDAVE_DOMAIN` | `caldave.fly.dev` | Domain for calendar email addresses |

## Auth Model

- API keys: `sk_live_` prefix + 32 alphanumeric chars
- Stored as SHA-256 hash (direct DB lookup, no iteration)
- Agent scoping: each agent only sees their own calendars/events

## Deferred (not in v1)

- Recurring events / RRULE expansion
- Inbound email parsing
- Webhooks / push notifications (pg-boss)
- iCal feed generation
- MCP tools
- Real rate limiting (headers are stubbed)
