# ─── Build stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared crypto lib first (dependency)
COPY aicq-crypto/package.json aicq-crypto/tsconfig.json aicq-crypto/
COPY aicq-crypto/src/ aicq-crypto/src/

# Copy server
COPY aicq-server/package.json aicq-server/tsconfig.json aicq-server/
COPY aicq-server/src/ aicq-server/src/

# Copy web UI
COPY aicq-web/package.json aicq-web/tsconfig.json aicq-web/vite.config.ts aicq-web/
COPY aicq-web/index.html aicq-web/
COPY aicq-web/src/ aicq-web/src/
COPY aicq-web/src/App.css aicq-web/src/

# Install dependencies and build
RUN cd aicq-crypto && npm install && npm run build
RUN cd aicq-server && npm install && npm run build
RUN cd aicq-web && npm install && npm run build

# ─── Runtime stage ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy server runtime
COPY --from=builder /app/aicq-server/dist/ aicq-server/dist/
COPY --from=builder /app/aicq-server/node_modules/ aicq-server/node_modules/
COPY --from=builder /app/aicq-crypto/dist/ aicq-crypto/dist/
COPY --from=builder /app/aicq-crypto/node_modules/ aicq-crypto/node_modules/

# Copy web static files
COPY --from=builder /app/aicq-web/dist/ web/dist/

# Copy config
COPY aicq-server/.env.example aicq-server/.env
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Install nginx
RUN apk add --no-cache nginx

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose ports
EXPOSE 80 443 3000

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
