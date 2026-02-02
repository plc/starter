# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Initial project setup
- Express.js server with health check endpoints (`/health`, `/health/db`)
- Status page at `/` showing server and database health
- PostgreSQL database connection
- Docker development environment with auto-database creation
- Fly.io deployment configuration
- Deterministic port generation (`scripts/get-port.sh`) - each project gets a unique port (3000-3999) based on its name

### Notes
- Uses `host.docker.internal` to connect to host PostgreSQL (not a separate container)
- Database auto-created by `init-db` service on `docker compose up`
- Run `fly launch` before `fly deploy` to create the app on Fly.io
- Port is generated from project name hash to avoid conflicts when running multiple projects

---

<!--
TEMPLATE FOR NEW ENTRIES:

## [1.0.0] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Fixed
- Bug fixes

### Removed
- Removed features

### Notes
- Learnings, decisions, or challenges
-->
