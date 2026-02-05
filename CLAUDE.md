# CLAUDE.md

Instructions for Claude Code when working with this codebase. This file contains generic workflow guidance that can be synced across projects.

For project-specific details, see [SPEC.md](SPEC.md).

## Initializing a New Project

When a user clones this repo to start a new project, you MUST:

1. **Rename `myapp` to the project name**:
   ```bash
   sed -i '' 's/myapp/PROJECT_NAME/g' package.json docker-compose.yml .env.example
   ```

2. **Set a deterministic port** (avoids conflicts when running multiple projects):
   ```bash
   PORT=$(./scripts/get-port.sh PROJECT_NAME)
   sed -i '' "s/PORT=3000/PORT=$PORT/" .env.example
   cp .env.example .env
   ```

3. **Rewrite SPEC.md** with project-specific content:
   - Update the project name and description
   - Keep the structure (Common Tasks, Project Structure, Environment Variables, etc.)
   - The goal: future Claude sessions should understand this specific project

4. **Rewrite README.md**:
   - Change title from "Starter" to the project name
   - Write a clear description of what THIS project does
   - Keep the Documentation links section
   - Remove "Customizing for Your Project" section

5. **Update CHANGELOG.md** with initial project setup

6. **Clear GOTCHAS.md** example content (keep the template structure)

7. **Start the server**:
   ```bash
   docker compose up --build
   ```

8. **Verify at http://127.0.0.1:$PORT** (use the port from step 2)

## Documentation Maintenance

**IMPORTANT: Keep documentation updated as you work, not after.**

### Files to Update

| File | When to Update | What to Update |
|------|----------------|----------------|
| **CHANGELOG.md** | After EVERY significant change | New features, fixes, changes, learnings |
| **SPEC.md** | When project details change | Endpoints, structure, env vars, commands |
| **README.md** | When user-facing details change | Setup steps, API docs, prerequisites |
| **GOTCHAS.md** | When you encounter problems | Post-mortems, confusing behaviors, fixes |

### CHANGELOG.md Format

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- What changed and why

### Fixed
- Bug that was fixed

### Removed
- What was removed

### Notes
- Important learnings or decisions
```

Include dates for releases: `## [1.0.0] - 2024-01-15`

### GOTCHAS.md Format

When you encounter a problem, add:
- **Date**: When it happened
- **Problem**: What went wrong
- **Cause**: Why it happened
- **Solution**: How it was fixed
- **Prevention**: How to avoid it in the future

## Git Workflow

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
4. Go to **Extensions** tab → enable any needed extensions (e.g., "vector" for pgvector)
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

### ⚠️ Fly Postgres: Two Different Products

Fly has **two separate Postgres products** with different CLI commands:

|                    | Managed Postgres (MPG)      | Old Fly Postgres           |
|--------------------|-----------------------------|-----------------------------|
| **Status**         | Current, recommended        | Legacy                      |
| **Created via**    | Dashboard or `fly mpg create` | `fly postgres create`     |
| **Is a Fly app?**  | ❌ No                       | ✅ Yes                      |
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
docker exec PROJECT_NAME-db-1 pg_dump -U postgres --clean --if-exists DATABASE_NAME > backup.sql
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db" < backup.sql
```

### Troubleshooting Fly Postgres

| Error | Cause | Solution |
|-------|-------|----------|
| "App not found" on `fly postgres attach` | You have MPG, not old Fly Postgres | Use `fly secrets set DATABASE_URL` instead |
| `fly postgres list` shows nothing | MPG clusters aren't apps | Use `fly mpg list` |
| Can't connect with `fly proxy` | MPG uses different command | Use `fly mpg connect <cluster-id> --port 15432` |
| "role postgres does not exist" on deploy | DATABASE_URL secret not set | Run `fly secrets set DATABASE_URL="..."` |

## Docker Best Practices

### Architecture

```
docker compose up
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

### Key Principles

1. **PostgreSQL runs on HOST machine** - shared across all projects
   - Use `host.docker.internal:5432` for container-to-host connections
   - Each project uses a different database NAME (not a different PostgreSQL instance)

2. **Service dependencies**:
   - `init-db` creates the database if it doesn't exist, runs migrations, then exits
   - `app` waits for `init-db` to complete successfully

3. **One PostgreSQL, many databases**:
   - Host runs single PostgreSQL instance on port 5432
   - Each project creates its own database (e.g., `myapp`, `project2`, etc.)
   - No port conflicts, no wasted resources

4. **`host.docker.internal`**:
   - Special DNS name that resolves to the host machine from inside Docker
   - Requires `extra_hosts: ["host.docker.internal:host-gateway"]` in docker-compose

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Connection refused" | PostgreSQL not running on host | Start host PostgreSQL |
| "Database does not exist" | init-db didn't run | Check init-db logs |
| Init script not running | Wrong entrypoint | Check volume mount and executable permissions |

## PostgreSQL Best Practices

1. **Connection strings**: `postgres://user:password@host:port/database`
2. **Default credentials** (local dev only): `postgres:postgres`
3. **One database per project**: Each project gets its own database name on the shared PostgreSQL
4. **Migrations**: Put in `scripts/` folder, run via init-db service
