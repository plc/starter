#!/bin/sh
#
# Database initialization script
#
# Creates the database if it doesn't already exist.
# This runs as a Docker service before the main app starts.
#
# Environment variables:
# - DATABASE_URL: PostgreSQL connection string
# - DB_NAME: Name of database to create (default: myapp)
#
# Usage: Called automatically by docker-compose

set -e

DB_NAME="${DB_NAME:-myapp}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@host.docker.internal:5432/postgres}"

# Connect to 'postgres' database to create the target database
# (Can't connect to a database that doesn't exist yet)
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

echo "Database ready."
