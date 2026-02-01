# CLAUDE.md

This file provides instructions for Claude Code when working with this codebase.

## Project Overview

This is a Node.js starter template with:
- Express.js web server
- PostgreSQL database
- Docker for local development
- Fly.io for production deployment

## Initializing a New Project

When a user clones this repo to start a new project, you MUST:

1. **Rename `myapp` to the project name**:
   ```bash
   sed -i '' 's/myapp/PROJECT_NAME/g' package.json docker-compose.yml .env.example
   ```

2. **Rewrite this CLAUDE.md file** - Replace it entirely with project-specific content:
   - Remove ALL "starter template" references
   - Write a clear "Project Overview" section describing what THIS project does
   - Keep the "Common Tasks" section (start server, deploy, test commands)
   - Keep the "Project Structure" section but update if files change
   - Keep the "Key Files to Modify" section
   - Add a "Change Log" section to track significant changes
   - The goal: future Claude sessions should understand this specific project, not think it's a starter template

3. **Rewrite README.md** - Replace it entirely:
   - Change title from "Starter" to the project name
   - Write a clear description of what THIS project does (not "a starter template")
   - Include a "Documentation" section with links to:
     - README.md - Setup and usage
     - CLAUDE.md - AI assistant instructions and project context
     - CHANGELOG.md - Project history and learnings
     - GOTCHAS.md - Known issues and post-mortems
   - Remove the "Customizing for Your Project" section (no longer relevant)
   - Keep: Prerequisites, Quick Start, API Endpoints, Local Development, Deploy to Fly.io, Troubleshooting
   - Update any placeholder text (like `my-project-name`) to the actual project name

4. **Create CHANGELOG.md** to track changes, learnings, and challenges:
   ```markdown
   # Changelog

   All notable changes to this project will be documented in this file.

   ## [Unreleased]

   ### Added
   - Initial project setup from starter template
   - Express.js server with health check endpoints
   - PostgreSQL database connection
   - Docker development environment
   - Fly.io deployment configuration

   ### Notes
   - (Record any important learnings, challenges encountered, or decisions made during development)
   ```

5. **Create GOTCHAS.md** for tracking issues and post-mortems:
   ```markdown
   # Gotchas

   This file documents confusing issues, mistakes, and lessons learned during development.

   ## Post-Mortems

   (Add entries when you encounter problems, get stuck, or have to undo work)
   ```

6. **Start the server**:
   ```bash
   docker compose up --build
   ```

7. **Verify at http://127.0.0.1:3000**

## Common Tasks

### Start Local Development Server

```bash
docker compose up --build
```

The server runs at http://127.0.0.1:3000

### Deploy to Fly.io

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

For subsequent deploys:
```bash
fly deploy
```

### Run Tests

```bash
# With server running
npm test

# Or use curl
curl http://127.0.0.1:3000/health
```

## Project Structure

```
src/index.js        - Main Express server with routes
src/healthcheck.js  - Health check script
scripts/init-db.sh  - Database initialization (Docker only)
Dockerfile          - Production container
docker-compose.yml  - Local development
fly.toml            - Fly.io configuration
```

## Key Files to Modify

When adding features, these are the main files:

- **src/index.js** - Add new routes and endpoints here
- **package.json** - Add new dependencies here
- **docker-compose.yml** - Add new services or environment variables
- **fly.toml** - Modify deployment settings

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_NAME` | Database name for init script |

## Database

- Local: Uses PostgreSQL running on the host machine (accessed via `host.docker.internal`)
- Production: Uses Fly Postgres (DATABASE_URL set automatically by `fly postgres attach`)

The `scripts/init-db.sh` script automatically creates the database if it doesn't exist when running locally with Docker.

## Ongoing Project Maintenance

**IMPORTANT: Keep documentation updated as you work, not after.**

When making changes to projects created from this starter:

1. **Update CHANGELOG.md** - Do this IMMEDIATELY after completing each change:
   - `### Added` - new features
   - `### Changed` - changes to existing features
   - `### Fixed` - bug fixes
   - `### Removed` - removed features
   - `### Notes` - important learnings, challenges encountered, or architectural decisions
   - Include dates for releases (use `## [1.0.0] - 2024-01-15` format)

2. **Update CLAUDE.md** when:
   - Adding new endpoints or features (document them in Project Overview)
   - Changing project structure (update the tree)
   - Adding new environment variables (add to the table)
   - Adding new common tasks or commands
   - Encountering important gotchas or learnings (add to Important Notes)

3. **Update README.md** when:
   - Adding new API endpoints
   - Changing setup/deployment steps
   - Adding new prerequisites or dependencies

4. **Update GOTCHAS.md** when:
   - You get stuck in a loop or have to undo work
   - Something doesn't work as expected
   - You discover confusing behavior or edge cases
   - Write a brief post-mortem: what happened, why, and how to avoid it

5. **Git commits**: Commit changes locally but DO NOT push to origin without explicit user permission. After committing, remind the user to push if they want to update the remote repository.

## Important Notes

1. **Don't modify fly.toml app name manually** - It gets set by `fly launch`
2. **DATABASE_URL format**: `postgres://user:password@host:port/database`
3. **Local dev uses host.docker.internal** to connect from Docker to host PostgreSQL
4. **The init-db service only runs locally** - Fly.io doesn't need it because `fly postgres attach` creates the database
