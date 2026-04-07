import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { store, startPeriodicCleanup, setClickHouseAvailable, isClickHouseAvailable } from './db/memoryStore';
import { initClickHouseSchema, closeClickHouse } from './db/clickhouse';
import apiRoutes from './api/routes';
import authRoutes from './api/authRoutes';
import groupRoutes from './api/groupRoutes';
import friendsRoutes from './api/friendsRoutes';
import subAgentRoutes from './api/subAgentRoutes';
import adminRoutes from './api/adminRoutes';
import { setupWebSocketHandler } from './api/wsHandler';
import { generalLimiter } from './middleware/rateLimit';

const app = express();
app.set('trust proxy', true);

// ─── Health Check (before rate limiter) ───────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    domain: config.domain,
    uptime: process.uptime(),
    timestamp: Date.now(),
    storage: isClickHouseAvailable() ? 'clickhouse' : 'memory-only',
  });
});

// ─── Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// ─── API Routes ────────────────────────────────────────────────────
app.use('/api/v1', apiRoutes);
app.use('/api/v1', authRoutes);
app.use('/api/v1', groupRoutes);
app.use('/api/v1/friends', friendsRoutes);
app.use('/api/v1', subAgentRoutes);
app.use('/api/v1', adminRoutes);

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

async function startServer() {
  console.log(`[aicq-server] Connecting to ClickHouse at ${config.clickhouseUrl}...`);

  try {
    // Initialize ClickHouse schema
    await initClickHouseSchema();
    console.log('[aicq-server] ClickHouse schema ready');

    // Load data from ClickHouse into memory
    await store.loadFromClickHouse();
    console.log('[aicq-server] All data loaded from ClickHouse');

    // Mark ClickHouse as available for async writes
    setClickHouseAvailable(true);
  } catch (err) {
    console.error('[aicq-server] ClickHouse connection/initialization failed:', err instanceof Error ? err.message : err);
    console.error('[aicq-server] Please ensure ClickHouse is running and accessible.');
    console.error('[aicq-server] Server will start with empty data store (memory-only mode). Data will NOT persist without ClickHouse.');
    // Keep ClickHouse disabled — asyncWrite will silently skip
  }

  // Prevent unhandled promise rejections from crashing the process
  process.on('unhandledRejection', (reason) => {
    console.error('[aicq-server] Unhandled promise rejection (non-fatal):', reason);
  });

  server.listen(PORT, () => {
    console.log(`[aicq-server] HTTP + WebSocket server running on port ${PORT}`);
    console.log(`[aicq-server] Domain: ${config.domain}`);
    console.log(`[aicq-server] Storage: ClickHouse (${config.clickhouseUrl})${isClickHouseAvailable() ? ' [connected]' : ' [memory-only mode - data will not persist]'}`);
    console.log(`[aicq-server] Max friends per node: ${config.maxFriends}`);
    console.log(`[aicq-server] Temp number TTL: ${config.tempNumberTtlHours}h`);
    console.log(`[aicq-server] Max HTTP connections: ${config.maxConnections}`);
    console.log(`[aicq-server] Max WS connections: ${config.maxWsConnections}`);

    // Start periodic cleanup of expired records
    startPeriodicCleanup();
  });
}

startServer().catch((err) => {
  console.error('[aicq-server] Fatal error during startup:', err);
  process.exit(1);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`[aicq-server] ${signal} received, shutting down...`);
  wss.close(() => {
    server.close(async () => {
      try {
        await closeClickHouse();
        console.log('[aicq-server] ClickHouse connection closed');
      } catch (err) {
        console.warn('[aicq-server] Error closing ClickHouse:', err);
      }
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server, wss };
