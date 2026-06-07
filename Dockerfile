# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install all dependencies (including dev) for the build.
COPY package*.json ./
RUN npm ci

# Compile TypeScript to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output and static web assets.
COPY --from=build /app/dist ./dist
COPY public ./public
COPY docs/CommunityResources/Docs/en-US.json /opt/ficsit-docs/en-US.json
COPY docker-entrypoint.sh /usr/local/bin/ficsit-entrypoint.sh
RUN chmod +x /usr/local/bin/ficsit-entrypoint.sh

# Default runtime configuration (override via compose / env).
# DATA_DIR is the single internal data root; state/ and docs/ live under it.
# SAVES_DIR is a separate bind to the Satisfactory server's save folder.
ENV DATA_DIR=/data \
    SAVES_DIR=/saves \
    WEB_PORT=8080 \
    WEB_ENABLED=true \
    WATCH_USE_POLLING=true \
    POST_TO_DISCORD=false

EXPOSE 8080

# Persist all app data (snapshots + db.json + config.json + optional docs).
VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/ficsit-entrypoint.sh"]
CMD ["node", "dist/index.js"]
