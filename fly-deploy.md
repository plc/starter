# Fly.io Deployment Reference

## Quick Deploy Checklist

- [ ] `fly launch` (say NO to Postgres, NO to deploy)
- [ ] Create Managed Postgres via dashboard
- [ ] Enable extensions in dashboard (Extensions tab)
- [ ] Copy connection string (Connect tab)
- [ ] `fly secrets set DATABASE_URL="..."`
- [ ] `fly deploy`

## Key Differences: Managed Postgres vs Old Fly Postgres

Managed Postgres (MPG) clusters are **not** Fly apps. They won't appear in `fly apps list` or `fly postgres list`.

| Task | MPG Command |
|------|-------------|
| List clusters | `fly mpg list` |
| Connect | `fly mpg connect <cluster-id>` |
| Proxy | `fly mpg connect <cluster-id> --port 15432` |
| Set DB URL | `fly secrets set DATABASE_URL="..."` (manual) |

## Connection String Format

```
postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require
```

- Database name is always `fly-db` (not customizable)
- Use the pooler hostname from dashboard Connect tab
- `sslmode=require` is required

## Troubleshooting

### "App not found" on `fly postgres attach`
You have Managed Postgres. Use `fly secrets set DATABASE_URL` instead.

### `fly postgres list` shows nothing
MPG clusters aren't apps. Use `fly mpg list`.

### Can't connect with `fly proxy`
Use `fly mpg connect <cluster-id> --port 15432` instead.

### "role postgres does not exist" on deploy
DATABASE_URL secret not set. Run `fly secrets set DATABASE_URL="..."`.

### Extensions not available (e.g., pgvector)
Enable extensions in the Fly dashboard: Postgres → your cluster → Extensions tab.

## Syncing Local Database to Fly

```bash
# Terminal 1: Start proxy
fly mpg connect <cluster-id> --port 15432

# Terminal 2: Dump local and restore to Fly
pg_dump -U plc --clean --if-exists YOUR_LOCAL_DB > backup.sql
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db" < backup.sql
```

## Full Deployment Walkthrough

### 1. Create App
```bash
fly launch
# Choose app name and region
# Say NO to Postgres
# Say NO to deploy now
```

### 2. Create Managed Postgres
1. Go to https://fly.io/dashboard
2. Click **Postgres** → **Create**
3. Choose name and region (same region as app)
4. Note the **cluster ID** (e.g., `abc123xyz`)

### 3. Configure Database
1. Go to your cluster in the dashboard
2. **Extensions** tab: Enable any needed extensions
3. **Connect** tab: Copy the connection string

### 4. Set Secret and Deploy
```bash
fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require" -a YOUR_APP
fly deploy
fly open
```

### 5. Verify
```bash
# Check logs
fly logs

# Connect to database
fly mpg connect <cluster-id>
```
