# CLAUDE.md

Instructions for Claude Code. For project-specific details, see [SPEC.md](SPEC.md).

## CRITICAL: Never Commit to the Starter Repo

This is a **template repository**. After cloning it for a new project, you MUST immediately change the git remote so that commits go to the NEW project's repo, not back to `plc/starter`. This happens in Step 1 below.

**If you encounter bugs or issues with the starter repo itself** (e.g., db.js abstraction problems, Docker issues, documentation errors), do NOT fix them in the new project. Instead, file a GitHub issue:

```bash
gh issue create --repo plc/starter --title "Brief description" --body "Details of the issue"
```

## Initializing a New Project

When a user clones this repo to start a new project, you MUST follow these steps IN ORDER:

### Step 0: Choose Database

Ask the user whether to use SQLite or PostgreSQL. **Default to SQLite** unless the project clearly needs PostgreSQL.

**Use PostgreSQL when:**
- Multi-server / horizontal scaling needed
- Complex relational queries, joins, full-text search
- Multiple concurrent writers
- Deploying to Fly.io with multiple machines

**Use SQLite when (default):**
- Simpler app, single-server deployment
- Low to medium traffic
- Prototyping or MVPs
- No strong reason for PostgreSQL

**If SQLite chosen:**
- Remove `docker-compose.postgres.yml` and `scripts/init-db.sh`
- `npm uninstall pg`
- In `.env.example`, remove the commented-out PostgreSQL lines

**If PostgreSQL chosen:**
- Replace `docker-compose.yml` with `docker-compose.postgres.yml` (rename it)
- `npm uninstall better-sqlite3`
- In `Dockerfile`, remove the `apk add` and `apk del` lines (no native build tools needed)
- In `.env.example`, uncomment PostgreSQL vars and remove SQLite vars
- In `fly.toml`, change `DB_TYPE` to `"postgres"` and remove the `[mounts]` comment block

### Step 1: Disconnect from the starter repo

**This step is non-negotiable.** Remove the starter origin immediately so no commits ever go back to `plc/starter`:

```bash
git remote remove origin
```

If the user has already created a new repo for this project, set it now:

```bash
git remote add origin https://github.com/USER/NEW_PROJECT.git
```

Otherwise, remind the user to add a remote later.

### Step 2: Rename `myapp` to the project name

```bash
sed -i '' 's/myapp/PROJECT_NAME/g' package.json docker-compose.yml .env.example .dockerignore
```

(If PostgreSQL: also rename in `docker-compose.postgres.yml`)

### Step 3: Set a deterministic port

```bash
PORT=$(./scripts/get-port.sh PROJECT_NAME)
sed -i '' "s/PORT=3000/PORT=$PORT/" .env.example
cp .env.example .env
```

### Step 4: Rewrite CLAUDE.md (this file)

**Replace the entire contents of this file** with project-specific instructions. Remove all starter repo context (init steps, database choice logic, Fly Postgres two-products table, etc.). The new CLAUDE.md should contain:

- Project name and what it does
- How to run locally (the correct `docker compose` command)
- Which database this project uses (SQLite or PostgreSQL) and relevant connection details
- Key files and where to add new features
- Deployment instructions relevant to THIS project
- The Documentation Maintenance table (keep as-is)
- The Git Workflow section (keep as-is, but remove the "file GitHub issues on plc/starter" note)
- Any project-specific conventions or constraints

The goal: a future Claude session opening this project should understand it completely without any starter repo noise.

### Step 5: Rewrite SPEC.md

- Update the project name and description
- Keep the structure (Common Tasks, Project Structure, Environment Variables, etc.)
- The goal: future Claude sessions should understand this specific project

### Step 6: Rewrite README.md

- Change title from "Starter" to the project name
- Write a clear description of what THIS project does
- Keep the Documentation links section
- Remove "Customizing for Your Project" section

### Step 7: Update CHANGELOG.md with initial project setup

### Step 8: Clear GOTCHAS.md example content (keep the template structure)

### Step 9: Start the server

```bash
docker compose up --build
```

### Step 10: Verify at http://127.0.0.1:$PORT

## Documentation Maintenance

**Keep docs updated as you work, not after.**

| File | When to Update |
|------|----------------|
| **CHANGELOG.md** | After every significant change |
| **SPEC.md** | When project details change |
| **README.md** | When user-facing details change |
| **GOTCHAS.md** | When you encounter problems |

## Git Workflow

- **Update CHANGELOG.md before committing** -- include it in the same commit as your changes
- **Commit** changes locally after completing work
- **DO NOT push** to origin without explicit user permission
- After committing, remind the user to push if they want to update the remote

## Database

### Architecture

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

## Deploying to Fly.io

See [fly-deploy.md](fly-deploy.md) for full deployment instructions, troubleshooting, and the MPG vs legacy Fly Postgres comparison.

**Quick reference:**

- `fly launch` -- say NO to Postgres, NO to deploy now
- **SQLite**: Create volume, uncomment `[mounts]` in fly.toml, scale to 1 machine, deploy
- **PostgreSQL**: Create Managed Postgres via Fly Dashboard, `fly secrets set DATABASE_URL="..."`, deploy
- **Key gotcha**: Fly has two Postgres products. Use `fly mpg` commands (not `fly postgres`) for Managed Postgres

## Docker

### SQLite Mode (default)

```
docker compose up
┌──────────────────────────────────┐
│                                  │
│       app (node.js)              │
│         port $PORT               │
│           │                      │
└───────────│──────────────────────┘
            │
            ▼
     ./data/myapp.db (volume)
```

Single service. SQLite file persisted via volume mount.

### PostgreSQL Mode

```
docker compose -f docker-compose.postgres.yml up
┌─────────────────────────────────────────────────────────┐
│                                                         │
│       init-db (one-shot) ──────→ app (node.js)         │
│          migrations               port $PORT            │
│              │                        │                 │
└──────────────│────────────────────────│─────────────────┘
               │                        │
               ▼                        ▼
      host.docker.internal:5432   localhost:$PORT
         (host PostgreSQL)         (for browser)
```

Two services. PostgreSQL runs on HOST machine, shared across projects.

### Key Principles

1. **SQLite mode**: No external database needed. Data stored in `./data/` directory.
2. **PostgreSQL mode**: PostgreSQL runs on HOST machine, shared via `host.docker.internal:5432`
3. **One compose file per mode** -- `docker-compose.yml` (SQLite) or `docker-compose.postgres.yml` (PostgreSQL)
4. **During init, remove the unused compose file** to avoid confusion

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Connection refused" (pg mode) | PostgreSQL not running on host | Start host PostgreSQL |
| "Database does not exist" (pg mode) | init-db didn't run | Check init-db logs |
| SQLite "database is locked" | Multiple writers | Use WAL mode (enabled by default in db.js) |
