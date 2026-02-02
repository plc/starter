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

IMPORTANT: You must create the app on Fly BEFORE running `fly deploy`:

```bash
# 1. Create the app (updates fly.toml with real app name)
fly launch
# - Choose app name and region
# - Say NO to Postgres (we create it separately)
# - Say NO to deploy now

# 2. Create Postgres database
fly postgres create --name PROJECT_NAME-db

# 3. Attach database to app (sets DATABASE_URL secret)
fly postgres attach PROJECT_NAME-db

# 4. Deploy
fly deploy

# 5. Verify
fly open
```

For subsequent deploys: `fly deploy`

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
