#!/bin/sh
# Creates the database if it doesn't exist

DB_NAME="${DB_NAME:-myapp}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@host.docker.internal:5432/postgres}"

# Extract connection info (connect to 'postgres' db to create the target db)
BASE_URL=$(echo "$DATABASE_URL" | sed 's|/[^/]*$|/postgres|')

echo "Checking if database '$DB_NAME' exists..."

# Check if database exists, create if not
psql "$BASE_URL" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || {
  echo "Creating database '$DB_NAME'..."
  psql "$BASE_URL" -c "CREATE DATABASE $DB_NAME"
  echo "Database '$DB_NAME' created."
}

echo "Database ready."
