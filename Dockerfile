# Dockerfile for CalDave
#
# Builds a minimal production image using Node.js 20 on Alpine Linux.
# Only includes production dependencies (no devDependencies).
#
# Build: docker build -t caldave .
# Run:   docker run -p 3720:3720 -e DATABASE_URL=... -e PORT=3720 caldave

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application source code
COPY src ./src

# Document the port the app listens on
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]
