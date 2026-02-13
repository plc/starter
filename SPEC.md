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
| `POST /man` | Optional | Machine-readable API manual (JSON), personalized if authenticated |
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
| `GET /feeds/:id.ics?token=TOKEN` | Feed token | iCal feed (subscribable) |
| `POST /inbound/:token` | Token in URL | Inbound email webhook (per-calendar) |

Auth = `Authorization: Bearer <api_key>` (except feeds, which use `?token=` query param)

## Project Structure

```
src/
├── index.js              — Express server, routes, status page
├── healthcheck.js        — Health check script (npm test)
├── db.js                 — Postgres pool + schema init
├── lib/
│   ├── ids.js            — nanoid-based ID generation (agt_, cal_, evt_, inb_)
│   ├── keys.js           — SHA-256 API key hashing
│   └── recurrence.js     — RRULE parsing, materialization, horizon management
├── middleware/
│   ├── auth.js           — Bearer token auth
│   └── rateLimitStub.js  — Stub rate limit headers
└── routes/
    ├── agents.js         — POST /agents
    ├── man.js            — POST /man (machine-readable API manual)
    ├── calendars.js      — Calendar CRUD
    ├── events.js         — Event CRUD + upcoming + respond
    ├── feeds.js          — iCal feed generation
    └── inbound.js        — Inbound email webhook (per-calendar token URL)
scripts/
├── init-db.sh            — Creates DB if not exists (Docker)
└── get-port.sh           — Deterministic port from project name
```

## Database Schema

Three tables: `agents`, `calendars`, `events`. Schema auto-created on startup.

See `CALDAVE_SPEC.md` for full column definitions.

Key indexes: `events(calendar_id, start_time)`, `events(calendar_id, status)`, `calendars(email)`, `calendars(agent_id)`, `calendars(inbound_token)` (partial), `events(parent_event_id)`, `events(parent_event_id, occurrence_date)` (unique, partial), `events(calendar_id, ical_uid)` (partial, for inbound email updates).

## Recurring Events

Events can include a `recurrence` field (RFC 5545 RRULE string, e.g. `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR`). When set, the event becomes a "parent" with `status = 'recurring'`, and individual occurrences are materialized as separate rows linked via `parent_event_id`.

- Parent rows are excluded from list/upcoming/feed queries
- Instances materialize 90 days ahead; a daily job extends the horizon
- Individual instances can be modified (become exceptions) or cancelled
- DELETE supports `?mode=single|future|all` for recurring events
- Max 1000 instances per 90-day window (rejects very high-frequency rules)
- Inbound email invites with RRULE are created as recurring events (same materialization as API-created)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (CalDave uses 3720) |
| `DATABASE_URL` | — | Postgres connection string |
| `DB_NAME` | `caldave` | Database name for init script |
| `CALDAVE_DOMAIN` | `caldave.ai` | Domain for calendar email addresses |

## Auth Model

- API keys: `sk_live_` prefix + 32 alphanumeric chars
- Stored as SHA-256 hash (direct DB lookup, no iteration)
- Agent scoping: each agent only sees their own calendars/events

## Deferred

- DST-aware recurrence (times currently repeat at same UTC offset, may drift ±1h across DST)
- iCal feed with RRULE + EXDATE (currently emits individual VEVENTs)
- Webhooks / push notifications (pg-boss)
- MCP tools
- Real rate limiting (headers are stubbed)
