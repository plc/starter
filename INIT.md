# INIT.md

One-time initialization steps for setting up a new project from the starter template. **Delete this file after initialization is complete** (Step 8 handles this).

## CRITICAL: Never Commit to the Starter Repo

This is a **template repository**. After cloning it for a new project, you MUST immediately change the git remote so that commits go to the NEW project's repo, not back to `plc/starter`. This happens in Step 1 below.

**If you encounter bugs or issues with the starter repo itself** (e.g., db.js abstraction problems, Docker issues, documentation errors), do NOT fix them in the new project. Instead, file a GitHub issue:

```bash
gh issue create --repo plc/starter --title "Brief description" --body "Details of the issue"
```

## Steps

Follow these steps IN ORDER.

**Project name:** If the user has already specified a project name, use it. If they haven't, come up with a short, descriptive name yourself based on what the project does (lowercase, hyphenated, e.g. `meal-planner`, `invoice-api`). Mention the name you chose so the user can override it, but don't block on confirmation -- just proceed.

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

Use the project name provided by the user, or the name you chose (see "Project name" note above).

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

### Step 4: Rewrite SPEC.md

- Update the project name and description
- Keep the structure (Common Tasks, Project Structure, Environment Variables, etc.)
- The goal: future Claude sessions should understand this specific project

### Step 5: Rewrite README.md

- Change title from "Starter" to the project name
- Write a clear description of what THIS project does
- Keep the Documentation links section
- Remove "Customizing for Your Project" section

### Step 6: Update CHANGELOG.md with initial project setup

### Step 7: Clear GOTCHAS.md example content (keep the template structure)

### Step 8: Rewrite CLAUDE.md and delete INIT.md

**Replace the entire contents of CLAUDE.md** with project-specific instructions. Remove the "Fresh Clone" pointer to INIT.md and all starter repo context. The new CLAUDE.md should contain:

- Project name and what it does
- How to run locally (the correct `docker compose` command)
- Which database this project uses (SQLite or PostgreSQL) and relevant connection details
- Key files and where to add new features
- Deployment instructions relevant to THIS project
- The Documentation Maintenance table (keep as-is from current CLAUDE.md)
- The Git Workflow section (keep as-is from current CLAUDE.md)
- Any project-specific conventions or constraints

The goal: a future Claude session opening this project should understand it completely without any starter repo noise.

Then delete this file:

```bash
rm INIT.md
```

### Step 9: Start the server

```bash
docker compose up --build
```

### Step 10: Verify at http://127.0.0.1:$PORT
