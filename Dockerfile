# Dockerfile for Node.js application
#
# This builds a minimal production image using Node.js 20 on Alpine Linux.
# The image only includes production dependencies (no devDependencies).
# Supports both SQLite (better-sqlite3) and PostgreSQL (pg) drivers.
#
# Build: docker build -t myapp .
# Run:   docker run -p 3000:3000 myapp

FROM node:20-alpine

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Remove build dependencies to keep image small
RUN apk del python3 make g++

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy application source code
COPY src ./src

# Document the port the app listens on
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]
