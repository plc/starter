# Fly.io Deployment Reference

## SQLite Deployment

### Quick Checklist

- [ ] `fly launch` (say NO to Postgres, NO to deploy)
- [ ] `fly volumes create data --size 1 --region YOUR_REGION`
- [ ] Uncomment `[mounts]` section in `fly.toml`
- [ ] `fly scale count 1`
- [ ] `fly deploy`

### Important Limitations

- SQLite on Fly.io requires exactly **1 machine** (no horizontal scaling)
- Data is stored on a Fly volume -- volumes are region-specific
- If the machine is destroyed, the volume persists (data is safe)
- For backup strategy, see "Nightly Backups to Fly Tigris" below

---

## PostgreSQL Deployment

### Default: Fly Postgres App

For most projects, create PostgreSQL as a Fly app using `fly postgres create`. This approach is simpler and gives you more control.

**When to consider Managed Postgres (MPG) instead:**
- Data-heavy workloads (large databases, high transaction volume)
- Need for automated failover and point-in-time recovery
- Enterprise-grade availability requirements

If your project fits the above criteria, ask the user whether they'd prefer Managed Postgres. Otherwise, use the Fly Postgres app approach below.

### Quick Checklist (Fly Postgres App)

- [ ] `fly launch` (say NO to Postgres, NO to deploy)
- [ ] `fly postgres create --name APP_NAME-db --region YOUR_REGION`
- [ ] `fly postgres attach APP_NAME-db` (auto-sets DATABASE_URL)
- [ ] `fly deploy`

### Full Deployment Walkthrough (Fly Postgres App)

#### 1. Create App
```bash
fly launch
# Choose app name and region
# Say NO to Postgres
# Say NO to deploy now
```

#### 2. Create Postgres as Fly App
```bash
fly postgres create --name YOUR_APP-db --region YOUR_REGION
# Choose configuration (Development is fine for most projects)
```

#### 3. Attach to Your App
```bash
fly postgres attach YOUR_APP-db
# This automatically sets DATABASE_URL secret
```

#### 4. Deploy
```bash
fly deploy
fly open
```

#### 5. Verify
```bash
# Check logs
fly logs

# Connect to database
fly postgres connect -a YOUR_APP-db
```

### Managing Fly Postgres Apps

| Task | Command |
|------|---------|
| List Postgres apps | `fly postgres list` |
| Connect | `fly postgres connect -a APP-db` |
| View users | `fly postgres users list -a APP-db` |
| View databases | `fly postgres db list -a APP-db` |
| Backup | `fly postgres backup -a APP-db` |

---

## Alternative: Managed Postgres (MPG)

For data-heavy projects requiring enterprise features, Managed Postgres offers automated failover and point-in-time recovery.

### Quick Checklist (MPG)

- [ ] `fly launch` (say NO to Postgres, NO to deploy)
- [ ] Create Managed Postgres via dashboard
- [ ] Enable extensions in dashboard (Extensions tab)
- [ ] Copy connection string (Connect tab)
- [ ] `fly secrets set DATABASE_URL="..."`
- [ ] `fly deploy`

### Key Differences: MPG vs Fly Postgres Apps

Managed Postgres (MPG) clusters are **not** Fly apps. They won't appear in `fly apps list` or `fly postgres list`.

| Task | MPG Command |
|------|-------------|
| List clusters | `fly mpg list` |
| Connect | `fly mpg connect <cluster-id>` |
| Proxy | `fly mpg connect <cluster-id> --port 15432` |
| Set DB URL | `fly secrets set DATABASE_URL="..."` (manual) |

### Connection String Format (MPG)

```
postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require
```

- Database name is always `fly-db` (not customizable)
- Use the pooler hostname from dashboard Connect tab
- `sslmode=require` is required

### Full MPG Deployment Walkthrough

#### 1. Create App
```bash
fly launch
# Choose app name and region
# Say NO to Postgres
# Say NO to deploy now
```

#### 2. Create Managed Postgres
1. Go to https://fly.io/dashboard
2. Click **Postgres** -> **Create**
3. Choose name and region (same region as app)
4. Note the **cluster ID** (e.g., `abc123xyz`)

#### 3. Configure Database
1. Go to your cluster in the dashboard
2. **Extensions** tab: Enable any needed extensions
3. **Connect** tab: Copy the connection string

#### 4. Set Secret and Deploy
```bash
fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@CLUSTER.pooler.fly.io:5432/fly-db?sslmode=require" -a YOUR_APP
fly deploy
fly open
```

#### 5. Verify
```bash
# Check logs
fly logs

# Connect to database
fly mpg connect <cluster-id>
```

---

## Nightly Backups to Fly Tigris

Fly Tigris provides S3-compatible object storage for backups. It's geo-distributed, so backups are available in all regions.

### Setup: Create Tigris Bucket

```bash
fly storage create --name APP_NAME-backups
```

This automatically injects credentials as secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ENDPOINT_URL_S3`
- `BUCKET_NAME`

### SQLite Backups to Tigris

#### Option 1: SSH-Based Backup Script

Create a backup script inside your app that runs via cron or Fly Machines scheduled task:

```bash
#!/bin/sh
# backup.sh - Run inside Fly machine

BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).db"

# Copy SQLite file
cp /app/data/myapp.db "/tmp/$BACKUP_FILE"

# Upload to Tigris using AWS CLI or curl
aws s3 cp "/tmp/$BACKUP_FILE" "s3://$BUCKET_NAME/$BACKUP_FILE" \
  --endpoint-url "$AWS_ENDPOINT_URL_S3"

# Clean up
rm "/tmp/$BACKUP_FILE"

# Optional: Keep only last 7 days
aws s3 ls "s3://$BUCKET_NAME/" --endpoint-url "$AWS_ENDPOINT_URL_S3" \
  | awk '{print $4}' \
  | sort \
  | head -n -7 \
  | xargs -I {} aws s3 rm "s3://$BUCKET_NAME/{}" --endpoint-url "$AWS_ENDPOINT_URL_S3"
```

Run via cron inside the machine:
```bash
# Add to Dockerfile or run via fly ssh console
echo "0 2 * * * /app/backup.sh" | crontab -
```

#### Option 2: External Scheduled Task

Use an external cron service or GitHub Actions to run:

```bash
# Pull SQLite file from Fly
fly sftp get /app/data/myapp.db ./backup.db -a YOUR_APP

# Upload to Tigris
aws s3 cp backup.db "s3://YOUR_BUCKET/backup-$(date +%Y%m%d).db" \
  --endpoint-url https://fly.storage.tigris.dev
```

### PostgreSQL Backups to Tigris

#### Fly Postgres App Backups

```bash
#!/bin/sh
# pg-backup.sh - Run on a machine with access to DATABASE_URL

BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).sql.gz"

# Dump database and compress
pg_dump "$DATABASE_URL" | gzip > "/tmp/$BACKUP_FILE"

# Upload to Tigris
aws s3 cp "/tmp/$BACKUP_FILE" "s3://$BUCKET_NAME/$BACKUP_FILE" \
  --endpoint-url "$AWS_ENDPOINT_URL_S3"

# Clean up local file
rm "/tmp/$BACKUP_FILE"

# Optional: Retain only last 7 backups
aws s3 ls "s3://$BUCKET_NAME/" --endpoint-url "$AWS_ENDPOINT_URL_S3" \
  | grep '\.sql\.gz$' \
  | awk '{print $4}' \
  | sort \
  | head -n -7 \
  | xargs -I {} aws s3 rm "s3://$BUCKET_NAME/{}" --endpoint-url "$AWS_ENDPOINT_URL_S3"
```

Run this script:
- As a scheduled Fly Machine (create a separate backup machine)
- Via external cron or GitHub Actions
- Inside your app container with a cron job

#### Managed Postgres (MPG) Backups

For MPG, use the same approach but connect via proxy:

```bash
# Terminal 1: Start proxy
fly mpg connect <cluster-id> --port 15432

# Terminal 2: Backup script
BACKUP_FILE="backup-$(date +%Y%m%d).sql.gz"
pg_dump "postgres://postgres:PASSWORD@localhost:15432/fly-db" | gzip > "$BACKUP_FILE"
aws s3 cp "$BACKUP_FILE" "s3://$BUCKET_NAME/$BACKUP_FILE" --endpoint-url "$AWS_ENDPOINT_URL_S3"
```

### Backup Retention Recommendations

- Keep at least **7 days** of daily backups
- Use date-stamped filenames: `backup-YYYYMMDD-HHMMSS.{db,sql.gz}`
- Automate cleanup of old backups (keep last N files)
- Test restoration periodically to verify backup integrity

---

## Syncing Local PostgreSQL to Fly

### Fly Postgres App

```bash
# Get connection string
fly postgres connect -a YOUR_APP-db

# Dump local and restore to Fly
pg_dump -U postgres --clean --if-exists YOUR_LOCAL_DB > backup.sql
psql "$(fly postgres proxy -a YOUR_APP-db)" < backup.sql
```

### Managed Postgres (MPG)

```bash
# Terminal 1: Start proxy
fly mpg connect <cluster-id> --port 15432

# Terminal 2: Dump local and restore to Fly
pg_dump -U postgres --clean --if-exists YOUR_LOCAL_DB > backup.sql
psql "postgres://postgres:PASSWORD@localhost:15432/fly-db" < backup.sql
```

---

## Troubleshooting

### Fly Postgres App Issues

#### "App not found" on `fly postgres attach`
The Postgres app doesn't exist. Run `fly postgres create` first.

#### Can't connect to database
Check the Postgres app is running: `fly status -a YOUR_APP-db`

#### Database extensions not available
Connect to the database and enable manually:
```bash
fly postgres connect -a YOUR_APP-db
# Inside psql:
CREATE EXTENSION IF NOT EXISTS pgvector;
```

### Managed Postgres (MPG) Issues

#### "App not found" on `fly postgres attach`
You have Managed Postgres. Use `fly secrets set DATABASE_URL` instead.

#### `fly postgres list` shows nothing
MPG clusters aren't apps. Use `fly mpg list`.

#### Can't connect with `fly proxy`
Use `fly mpg connect <cluster-id> --port 15432` instead.

#### "role postgres does not exist" on deploy
DATABASE_URL secret not set. Run `fly secrets set DATABASE_URL="..."`.

#### Extensions not available (e.g., pgvector)
Enable extensions in the Fly dashboard: Postgres -> your cluster -> Extensions tab.

### SQLite Issues

#### SQLite data lost on redeploy
You need a volume. Run `fly volumes create data --size 1` and uncomment `[mounts]` in `fly.toml`.

#### "database is locked" errors
SQLite doesn't handle multiple writers well. Ensure you're scaled to exactly 1 machine: `fly scale count 1`

### Tigris Backup Issues

#### Credentials not available
Verify secrets are set: `fly secrets list`. If missing, recreate the storage bucket.

#### Upload fails with 403
Check `AWS_ENDPOINT_URL_S3` is set correctly. Should be `https://fly.storage.tigris.dev` or similar.

#### Backup script doesn't run
- For cron inside Fly: Ensure cron daemon is running and script has execute permissions
- For external cron: Check service logs and verify Fly API access

#### Can't restore from backup
Test restoration regularly:
```bash
# SQLite
aws s3 cp "s3://$BUCKET_NAME/backup-20260424.db" ./restored.db --endpoint-url "$AWS_ENDPOINT_URL_S3"
sqlite3 restored.db "SELECT * FROM your_table LIMIT 5;"

# PostgreSQL
aws s3 cp "s3://$BUCKET_NAME/backup-20260424.sql.gz" - --endpoint-url "$AWS_ENDPOINT_URL_S3" | gunzip | psql YOUR_DB
```
