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

### Example: PostgreSQL Connection Confusion

**Date**: 2024-01-01

**Problem**: Database connection failed with "connection refused" error.

**Cause**: Assumed PostgreSQL was running in Docker, but this project uses the host machine's PostgreSQL via `host.docker.internal`. Tried to connect to `localhost:5432` from inside the Docker container.

**Solution**: Use `host.docker.internal` instead of `localhost` in DATABASE_URL when running in Docker.

**Prevention**:
- Check docker-compose.yml for `extra_hosts` configuration
- This project connects to HOST PostgreSQL, not a containerized one
- Read SPEC.md's "Database" section before debugging connection issues

---

<!-- Add new post-mortems above this line -->
