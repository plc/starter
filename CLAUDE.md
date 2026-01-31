# CLAUDE.md

This file provides instructions for AI assistants (like Claude) working with this codebase.

## Project Overview

This is a Node.js starter template with:
- Express.js web server
- PostgreSQL database
- Docker for local development
- Fly.io for production deployment

## Common Tasks

### Initialize the Project

When a user asks to "init" or "set up" this project:

1. **Rename the project** (if they provide a name):
   ```bash
   # Replace 'myapp' with the new project name in these files:
   # - package.json (name field)
   # - docker-compose.yml (DB_NAME and DATABASE_URL)
   # - .env.example (DB_NAME and DATABASE_URL)
   sed -i '' 's/myapp/NEW_PROJECT_NAME/g' package.json docker-compose.yml .env.example
   ```

2. **Start the local server**:
   ```bash
   docker compose up --build
   ```

3. **Verify it works**:
   ```bash
   curl http://127.0.0.1:3000/health
   curl http://127.0.0.1:3000/health/db
   ```

### Start Local Development Server

```bash
docker compose up --build
```

The server runs at http://127.0.0.1:3000

### Deploy to Fly.io

For first-time deployment:

```bash
# 1. Launch the app (creates fly.toml config)
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

## Important Notes

1. **Don't modify fly.toml app name** - It gets set by `fly launch`
2. **DATABASE_URL format**: `postgres://user:password@host:port/database`
3. **Local dev uses host.docker.internal** to connect from Docker to host PostgreSQL
4. **The init-db service only runs locally** - Fly.io doesn't need it because `fly postgres attach` creates the database
