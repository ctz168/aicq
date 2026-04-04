# ─── Build stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared crypto lib first (dependency)
COPY shared/crypto/package.json shared/crypto/tsconfig.json shared/crypto/
COPY shared/crypto/src/ shared/crypto/src/

# Copy server
COPY server/package.json server/tsconfig.json server/
COPY server/src/ server/src/

# Copy web UI
COPY client/web/package.json client/web/tsconfig.json client/web/vite.config.ts client/web/
COPY client/web/index.html client/web/
COPY client/web/src/ client/web/src/

# Install dependencies and build
RUN cd shared/crypto && npm install && npm run build
RUN cd server && npm install && npm run build
RUN cd client/web && npm install && npm run build

# ─── Runtime stage ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy server runtime
COPY --from=builder /app/server/dist/ server/dist/
COPY --from=builder /app/server/node_modules/ server/node_modules/
COPY --from=builder /app/shared/crypto/dist/ shared/crypto/dist/
COPY --from=builder /app/shared/crypto/node_modules/ shared/crypto/node_modules/

# Copy web static files
COPY --from=builder /app/client/web/dist/ web/dist/

# Copy config
COPY server/.env.example server/.env
COPY server/docker/nginx.conf /etc/nginx/conf.d/default.conf

# Install nginx
RUN apk add --no-cache nginx

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose ports
EXPOSE 80 443 3000

# Copy entrypoint
COPY server/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
