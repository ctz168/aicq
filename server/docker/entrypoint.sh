#!/bin/sh
set -e

echo "=== AICQ Deployment ==="
echo "Starting services for aicq.online..."

# Create SSL directory if not exists
mkdir -p /etc/nginx/ssl

# Generate self-signed cert if no cert exists
if [ ! -f /etc/nginx/ssl/aicq.online.crt ]; then
    echo "Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/aicq.online.key \
        -out /etc/nginx/ssl/aicq.online.crt \
        -subj "/CN=aicq.online" 2>/dev/null || true
    echo "WARNING: Using self-signed certificate. Replace with Let's Encrypt for production."
fi

# Start Node.js server (background) on port 443
echo "Starting AICQ server on port 443..."
cd /app/server
node dist/index.js &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
for i in $(seq 1 30); do
    if wget -q -O /dev/null http://127.0.0.1:443/health 2>/dev/null; then
        echo "Server is ready!"
        break
    fi
    sleep 1
done

# Start Admin panel (Next.js standalone) on port 80
echo "Starting Admin panel on port 80..."
cd /app/admin
AICQ_SERVER_URL=http://localhost:443 node server.js &
ADMIN_PID=$!

# Wait for admin to be ready
echo "Waiting for admin panel to start..."
for i in $(seq 1 30); do
    if wget -q -O /dev/null http://127.0.0.1:80/ 2>/dev/null; then
        echo "Admin panel is ready!"
        break
    fi
    sleep 1
done

# Start Nginx (foreground)
echo "Starting Nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $ADMIN_PID 2>/dev/null
    kill $SERVER_PID 2>/dev/null
    kill $NGINX_PID 2>/dev/null
    wait
}
trap cleanup SIGTERM SIGINT

echo "=== AICQ is running ==="
echo "  Admin UI:  https://aicq.online/"
echo "  API:       https://aicq.online/api/v1/"
echo "  WebSocket: wss://aicq.online/ws"
echo "  Server:    http://localhost:61018 (internal)"
echo ""

wait