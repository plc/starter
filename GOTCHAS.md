# Gotchas

This file documents confusing issues, mistakes, and lessons learned. When Claude Code gets stuck, has to undo work, or discovers unexpected behavior, write a post-mortem here.

## Post-Mortem Template

```markdown
### Title of the Issue

**Date**: YYYY-MM-DD

**Problem**: What went wrong

**Cause**: Why it happened

**Solution**: How it was fixed

**Prevention**: How to avoid it in the future
```

---

## Post-Mortems

### better-sqlite3 Requires Native Build Tools in Alpine Docker

**Date**: 2026-04-02

**Problem**: Docker build fails with `better-sqlite3` on Alpine Linux.

**Cause**: `better-sqlite3` compiles native C++ code. Alpine lacks build tools by default.

**Solution**: Install `python3 make g++` before `npm install` in the Dockerfile, then remove them after to keep the image small.

**Prevention**: The Dockerfile already handles this. If you switch base images, ensure native build dependencies are available.

### SQLite on Fly.io Requires Volume and Single Machine

**Date**: 2026-04-02

**Problem**: SQLite data is lost on redeploy, or "database is locked" errors with multiple machines.

**Cause**: Fly.io containers are ephemeral. Without a volume mount, the SQLite file lives only in the container's filesystem. Multiple machines each get their own volume, causing data divergence.

**Solution**:
1. Create a Fly volume: `fly volumes create data --size 1`
2. Uncomment `[mounts]` in `fly.toml`
3. Scale to exactly 1 machine: `fly scale count 1`

**Prevention**: Always use a volume for SQLite on Fly.io. Never run more than 1 machine with SQLite.

### Parameter Placeholder Syntax Differs Between SQLite and PostgreSQL

**Date**: 2026-04-02

**Problem**: Queries fail with wrong parameter syntax.

**Cause**: SQLite uses `?` placeholders, PostgreSQL uses `$1`, `$2`, etc.

**Solution**: Use the correct syntax for your project's chosen database. The choice is permanent per project.

**Prevention**: Check `db.dbType` if unsure. The database choice is set at init time via `DB_TYPE` env var.

---

<!-- Add new post-mortems above this line -->
