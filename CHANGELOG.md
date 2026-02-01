# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Express.js server with health check endpoints (`/health`, `/health/db`)
- Status page at `/` showing server and database connection health
- PostgreSQL database connection via `pg` package
- Docker development environment with auto-database creation
- Fly.io deployment configuration
- CLAUDE.md with comprehensive instructions for AI assistants
- CHANGELOG.md for tracking project history
- GOTCHAS.md for documenting issues and post-mortems
- Documentation links in README.md

### Notes
- Uses `host.docker.internal` to connect Docker containers to host PostgreSQL (avoids running separate Postgres container)
- Database is auto-created by `init-db` service on `docker compose up`
- `fly launch` must be run before `fly deploy` to create the app on Fly.io
