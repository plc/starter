# Starter

Node.js starter repo with PostgreSQL, Docker, and Fly.io deployment.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Docker](https://www.docker.com/)
- [Fly CLI](https://fly.io/docs/flyctl/install/) (for deployment)

## Setup

After cloning this repo, rename `myapp` to your project name in the following files:

| File | What to change |
|------|----------------|
| `package.json` | `"name": "myapp"` |
| `docker-compose.yml` | Database name in `DATABASE_URL` and `POSTGRES_DB` |
| `.env.example` | Database name in `DATABASE_URL` |
| `fly.toml` | `app = "REPLACE_WITH_YOUR_APP_NAME"` |

Or run this command to replace all instances at once:

```bash
# Replace 'myapp' with your project name (e.g., 'my-cool-project')
sed -i '' 's/myapp/my-cool-project/g' package.json docker-compose.yml .env.example
```

## Quick Start (Docker)

```bash
# Start the app and database
docker compose up --build

# Verify it works
curl http://localhost:3000/health
curl http://localhost:3000/health/db
```

## Local Development (without Docker)

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start PostgreSQL (via Docker or locally)
docker compose up db -d

# Run the app
npm run dev

# Verify it works
npm test
```

## API Endpoints

| Endpoint     | Description                    |
| ------------ | ------------------------------ |
| `GET /`      | App info and available routes  |
| `GET /health`| Server health check            |
| `GET /health/db` | Database connection check  |

## Deploy to Fly.io

### First-time setup

1. **Install the Fly CLI** (if you haven't already):
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

3. **Launch your app** (creates the app on Fly and updates `fly.toml`):
   ```bash
   fly launch
   ```
   - When prompted, choose your app name and region
   - Say **no** to creating a Postgres database (we'll do it separately)
   - Say **no** to deploying now

4. **Create a Postgres database**:
   ```bash
   fly postgres create --name myapp-db
   ```
   - Choose the same region as your app
   - Choose "Development" for testing, or a larger size for production

5. **Attach the database to your app** (this sets `DATABASE_URL` automatically):
   ```bash
   fly postgres attach myapp-db
   ```

6. **Deploy**:
   ```bash
   fly deploy
   ```

### Verify deployment

```bash
# Check app status
fly status

# View logs
fly logs

# Test endpoints
curl https://<your-app>.fly.dev/health
curl https://<your-app>.fly.dev/health/db

# Open in browser
fly open
```

### Subsequent deploys

After the initial setup, just run:
```bash
fly deploy
```

## Project Structure

```
├── src/
│   ├── index.js        # Express server with routes
│   └── healthcheck.js  # Health check script
├── Dockerfile          # Production container
├── docker-compose.yml  # Local development setup
├── fly.toml            # Fly.io configuration
├── package.json
└── .env.example
```

## Verify Everything Works

### Local (Docker)
```bash
docker compose up --build -d
curl http://localhost:3000/health      # Should return {"status":"ok",...}
curl http://localhost:3000/health/db   # Should show database connected
docker compose down
```

### Production (Fly.io)
```bash
fly deploy
curl https://<your-app>.fly.dev/health
curl https://<your-app>.fly.dev/health/db
```
