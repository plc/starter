# CLAUDE.md

Instructions for Claude Code. For project-specific details, see [SPEC.md](SPEC.md).

## Fresh Clone from plc/starter?

If this is a fresh clone of the starter template, follow [INIT.md](INIT.md) before doing anything else. INIT.md contains the full initialization steps and gets deleted once the project is set up.

**Never commit back to plc/starter.** If you find a bug in the starter, file an issue:

```bash
gh issue create --repo plc/starter --title "Brief description" --body "Details"
```

## Documentation Maintenance

**Keep docs updated as you work, not after.**

| File | When to Update |
|------|----------------|
| **CHANGELOG.md** | After every significant change |
| **SPEC.md** | When project details change |
| **README.md** | When user-facing details change |
| **GOTCHAS.md** | When you encounter problems |

## Git Workflow

- **Update CHANGELOG.md before committing** -- include it in the same commit as your changes
- **Commit** changes locally after completing work
- **DO NOT push** to origin without explicit user permission
- After committing, remind the user to push if they want to update the remote

## API Key Conventions

If the project generates or uses API keys, **never use the `sk_live_` or `sk_test_` prefix**. GitHub's secret scanner matches these as Stripe API keys and will block pushes -- even if the values are dummy/example strings.

Recommended prefixes:
- `key_live_` / `key_test_` -- generic, no collision with known providers
- A project-specific prefix (e.g. `cd_live_` for CalDave, `xx_live_` for XX)

This applies to application code, example values in docs, `.env.example`, and seed data.

## Deploying to Fly.io

See [fly-deploy.md](fly-deploy.md) for full deployment instructions, troubleshooting, and the Fly Postgres vs Managed Postgres comparison.

**Quick reference:**

- `fly launch` -- say NO to Postgres, NO to deploy now
- **SQLite**: Create volume, uncomment `[mounts]` in fly.toml, scale to 1 machine, deploy
- **PostgreSQL (default)**: Use `fly postgres create` then `fly postgres attach` (auto-sets DATABASE_URL), deploy
- **PostgreSQL (data-heavy)**: For data-heavy projects, ask user to confirm, then use Managed Postgres (MPG) via Fly Dashboard instead
- **Backups**: Configure nightly backups to Fly Tigris (see fly-deploy.md for details)
- **Key gotcha**: Fly has two Postgres products. Fly Postgres app (`fly postgres`) is default. Managed Postgres (`fly mpg`) is for data-heavy workloads
