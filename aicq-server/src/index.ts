import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { startPeriodicCleanup } from './db/memoryStore';
import apiRoutes from './api/routes';
import authRoutes from './api/authRoutes';
import groupRoutes from './api/groupRoutes';
import friendsRoutes from './api/friendsRoutes';
import subAgentRoutes from './api/subAgentRoutes';
import { setupWebSocketHandler } from './api/wsHandler';
import { generalLimiter } from './middleware/rateLimit';

const app = express();
app.set('trust proxy', true);

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
app.use('/api/v1', authRoutes);
app.use('/api/v1', groupRoutes);
app.use('/api/v1/friends', friendsRoutes);
app.use('/api/v1', subAgentRoutes);

// ─── Global Error Handler ──────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[aicq-server] Unhandled error on ${req.method} ${req.path}:`, err.message);

  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── HTTP Server + WebSocket Server ────────────────────────────────
const server = http.createServer(app);

// Set max connections to prevent resource exhaustion
server.maxConnections = config.maxConnections;

// Add keep-alive timeout
server.keepAliveTimeout = 65_000; // 65 seconds
server.headersTimeout = 66_000; // Must be > keepAliveTimeout

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
  console.log(`[aicq-server] Max HTTP connections: ${config.maxConnections}`);
  console.log(`[aicq-server] Max WS connections: ${config.maxWsConnections}`);

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
