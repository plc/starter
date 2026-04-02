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
sed -i '' 's/myapp/PROJECT_NAME/g' package.json docker-compose.yml .env.example
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

// Query (returns { rows: [...] })
const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

// Health check (returns { time, version })
const health = await db.healthCheck();

// Close connection
await db.close();

// Check type
console.log(db.dbType); // 'sqlite' or 'postgres'
```

## Deploying to Fly.io

### Step 1: Create the App

```bash
fly launch
# - Choose app name and region
# - Say NO to Postgres (we set it up separately if needed)
# - Say NO to deploy now
```

### SQLite on Fly.io

1. Create a volume for the SQLite file:
   ```bash
   fly volumes create data --size 1 --region sjc
   ```

2. Uncomment the `[mounts]` section in `fly.toml`:
   ```toml
   [mounts]
     source = "data"
     destination = "/app/data"
   ```

3. Scale to exactly 1 machine (SQLite does not support multiple writers):
   ```bash
   fly scale count 1
   ```

4. Deploy:
   ```bash
   fly deploy
   ```

### PostgreSQL on Fly.io

**Use the Fly Dashboard (not CLI) for Managed Postgres:**

1. Go to https://fly.io/dashboard -> Postgres -> Create
2. Choose a name and region (same region as your app)
3. Note the **cluster ID** (e.g., `abc123xyz`) -- needed for CLI access
4. Go to **Extensions** tab -> enable any needed extensions (e.g., "vector" for pgvector)
5. Go to **Connect** tab -> copy the connection string

```bash
fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require" -a YOUR_APP
fly deploy
```

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

- **Don't use `fly postgres attach`** -- Only works with old Fly Postgres, not MPG
- **Don't expect `fly postgres list` to show MPG clusters** -- Use `fly mpg list` instead
- **Don't use `fly proxy` with MPG** -- Use `fly mpg connect <cluster-id>` instead
- **The database name is `fly-db`** -- Not the cluster name, not your app name

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
docker exec PROJECT_NAME-db-1 pg_dump -U plc --clean --if-exists DATABASE_NAME > backup.sql
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db" < backup.sql
```

### Troubleshooting Fly Postgres

| Error | Cause | Solution |
|-------|-------|----------|
| "App not found" on `fly postgres attach` | You have MPG, not old Fly Postgres | Use `fly secrets set DATABASE_URL` instead |
| `fly postgres list` shows nothing | MPG clusters aren't apps | Use `fly mpg list` |
| Can't connect with `fly proxy` | MPG uses different command | Use `fly mpg connect <cluster-id> --port 15432` |
| "role postgres does not exist" on deploy | DATABASE_URL secret not set | Run `fly secrets set DATABASE_URL="..."` |

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
