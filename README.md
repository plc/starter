# Starter

A minimal Node.js starter template with PostgreSQL, Docker, and Fly.io deployment.

## Documentation

- **[README.md](README.md)** - This file. Setup, usage, and deployment instructions.
- **[SPEC.md](SPEC.md)** - Project-specific details: endpoints, structure, environment variables.
- **[CLAUDE.md](CLAUDE.md)** - Instructions for Claude Code AI assistant. Workflow and maintenance guidelines.
- **[CHANGELOG.md](CHANGELOG.md)** - Project history, changes, and learnings.
- **[GOTCHAS.md](GOTCHAS.md)** - Known issues, confusing behaviors, and post-mortems.

## What's Included

- **Express.js** server with health check endpoints
- **PostgreSQL** database connection
- **Docker** setup for local development
- **Fly.io** configuration for production deployment
- **Status page** at `/` showing server and database health

## Prerequisites

- [Docker](https://www.docker.com/) (required)
- [Node.js](https://nodejs.org/) v20+ (optional, for local dev without Docker)
- [Fly CLI](https://fly.io/docs/flyctl/install/) (for production deployment)
- PostgreSQL running locally on port 5432

## Quick Start

```bash
git clone <this-repo> my-project
cd my-project
docker compose up --build
```

Open http://127.0.0.1:3000 to see the status page.

That's it! The database is created automatically.

## Project Structure

```
├── src/
│   ├── index.js          # Express server with routes and status page
│   └── healthcheck.js    # Health check script for testing
├── scripts/
│   ├── init-db.sh        # Creates database if it doesn't exist
│   └── get-port.sh       # Generates deterministic port from project name
├── Dockerfile            # Production container image
├── docker-compose.yml    # Local development setup
├── fly.toml              # Fly.io deployment configuration
├── package.json          # Node.js dependencies and scripts
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore rules
└── CLAUDE.md             # Instructions for AI assistants
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (use `./scripts/get-port.sh` for deterministic port) |
| `DATABASE_URL` | `postgres://postgres:postgres@host.docker.internal:5432/myapp` | PostgreSQL connection string |
| `DB_NAME` | `myapp` | Database name (used by init script) |

### Customizing for Your Project

Replace `myapp` with your project name and set a deterministic port:

```bash
# On macOS
sed -i '' 's/myapp/my-project-name/g' package.json docker-compose.yml .env.example

# Generate a deterministic port (avoids conflicts when running multiple projects)
PORT=$(./scripts/get-port.sh my-project-name)
sed -i '' "s/PORT=3000/PORT=$PORT/" .env.example

# Create your .env file
cp .env.example .env
```

```bash
# On Linux
sed -i 's/myapp/my-project-name/g' package.json docker-compose.yml .env.example
PORT=$(./scripts/get-port.sh my-project-name)
sed -i "s/PORT=3000/PORT=$PORT/" .env.example
cp .env.example .env
```

Or manually update these files:
- `package.json` - change `"name": "myapp"`
- `docker-compose.yml` - change `DB_NAME` and database name in `DATABASE_URL`
- `.env.example` - change database name in `DATABASE_URL`, `DB_NAME`, and `PORT`

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Status page showing server and database health |
| `GET /health` | JSON health check (server only) |
| `GET /health/db` | JSON health check (server + database) |

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

# Create and configure .env
cp .env.example .env
# Edit .env: change host.docker.internal to localhost

# Create the database manually
createdb myapp

# Start the server with auto-reload
npm run dev

# Test the health endpoint
npm test
```

## Deploy to Fly.io

### First-Time Setup

1. **Install Fly CLI**:
   ```bash
   # macOS
   brew install flyctl

   # Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Login to Fly**:
   ```bash
   fly auth login
   ```

3. **Launch your app**:
   ```bash
   fly launch
   ```
   When prompted:
   - Choose your app name and region
   - Say **No** to creating a Postgres database now
   - Say **No** to deploying now

4. **Create a Postgres database**:
   ```bash
   fly postgres create --name my-project-db
   ```
   - Choose the same region as your app
   - Choose "Development" for testing

5. **Attach the database to your app**:
   ```bash
   fly postgres attach my-project-db
   ```
   This automatically sets the `DATABASE_URL` secret.

6. **Deploy**:
   ```bash
   fly deploy
   ```

### Verify Deployment

```bash
# Check status
fly status

# View logs
fly logs

# Open in browser
fly open

# Test endpoints
curl https://your-app-name.fly.dev/health
curl https://your-app-name.fly.dev/health/db
```

### Subsequent Deploys

```bash
fly deploy
```

## Troubleshooting

### Database connection failed

1. **Local**: Make sure PostgreSQL is running on port 5432
   ```bash
   # Check if postgres is running
   pg_isready
   ```

2. **Docker**: The init-db script creates the database automatically. Check logs:
   ```bash
   docker compose logs init-db
   ```

3. **Fly.io**: Make sure you attached the database:
   ```bash
   fly postgres attach <db-name>
   ```

### Port already in use

Change the port in docker-compose.yml:
```yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Browser redirects to HTTPS

Your browser may have cached an HTTPS redirect. Try:
- Use `http://127.0.0.1:3000` instead of `localhost`
- Use an incognito/private window
- Clear HSTS settings for localhost

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (Node.js --watch) |
| `npm test` | Run health check against running server |

## License

MIT
