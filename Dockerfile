# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S worker -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code and build files
COPY tsconfig.json ./
COPY src/ ./src/

# Build the application
RUN npm run build

# Remove source code and dev dependencies to reduce image size
RUN rm -rf src/ tsconfig.json node_modules/ && \
    npm ci --only=production && \
    npm cache clean --force

# Change ownership to non-root user
RUN chown -R worker:nodejs /app
USER worker

# Expose port (configurable via PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

# Start the application
CMD ["node", "dist/index.js"]
