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

# Default runtime configuration (override via compose / env).
ENV SAVES_DIR=/data/saves \
    STATE_DIR=/app/state \
    DOCS_PATH=/data/docs \
    WEB_PORT=8080 \
    WEB_ENABLED=true \
    WATCH_USE_POLLING=true \
    POST_TO_DISCORD=false

EXPOSE 8080

# Persist snapshots + config + db across container restarts.
VOLUME ["/app/state"]

CMD ["node", "dist/index.js"]
