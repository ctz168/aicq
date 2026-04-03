import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { startPeriodicCleanup } from './db/memoryStore';
import apiRoutes from './api/routes';
import { setupWebSocketHandler } from './api/wsHandler';
import { generalLimiter } from './middleware/rateLimit';

const app = express();

// ─── Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// ─── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    domain: config.domain,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// ─── API Routes ────────────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── HTTP Server + WebSocket Server ────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ─── WebSocket Handler ────────────────────────────────────────────
setupWebSocketHandler(wss);

// ─── Start Server ──────────────────────────────────────────────────
const PORT = config.port;

server.listen(PORT, () => {
  console.log(`[aicq-server] HTTP + WebSocket server running on port ${PORT}`);
  console.log(`[aicq-server] Domain: ${config.domain}`);
  console.log(`[aicq-server] Max friends per node: ${config.maxFriends}`);
  console.log(`[aicq-server] Temp number TTL: ${config.tempNumberTtlHours}h`);

  // Start periodic cleanup of expired records
  startPeriodicCleanup();
});

// ─── Graceful Shutdown ─────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[aicq-server] SIGTERM received, shutting down...');
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('[aicq-server] SIGINT received, shutting down...');
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});

export { app, server, wss };
