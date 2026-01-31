# Dockerfile for Node.js application
#
# This builds a minimal production image using Node.js 20 on Alpine Linux.
# The image only includes production dependencies (no devDependencies).
#
# Build: docker build -t myapp .
# Run:   docker run -p 3000:3000 -e DATABASE_URL=... myapp

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
