#!/bin/sh
#
# Database initialization script
#
# Creates the database if it doesn't exist, then runs migrations.
# This runs as a one-shot Docker service before the app starts.
#
# Environment variables:
# - DATABASE_URL: PostgreSQL connection string
# - DB_NAME: Database name (default: myapp)
#
# Usage: Called automatically by docker-compose

set -e

DB_NAME="${DB_NAME:-myapp}"
DATABASE_URL="${DATABASE_URL:-postgres://plc:postgres@host.docker.internal:5432/myapp}"

# Connect to 'postgres' database to create the target database
BASE_URL=$(echo "$DATABASE_URL" | sed 's|/[^/]*$|/postgres|')

echo "Checking if database '$DB_NAME' exists..."

# Check if database exists, create if not
if psql "$BASE_URL" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "Database '$DB_NAME' already exists."
else
  echo "Creating database '$DB_NAME'..."
  psql "$BASE_URL" -c "CREATE DATABASE $DB_NAME"
  echo "Database '$DB_NAME' created."
fi

# Add migrations here
# Example:
# psql "$DATABASE_URL" -f /migrations/001_initial.sql

echo "Database ready."
