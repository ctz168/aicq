import WebSocket from 'ws';

interface WsRateLimitEntry {
  timestamps: number[];
  lastWarning?: number;
}

const wsRateLimits = new Map<WebSocket, WsRateLimitEntry>();

const WINDOW_MS = 10_000; // 10 second window
const MAX_MESSAGES = 30; // Max 30 messages per 10 seconds per connection
const MAX_MESSAGE_SIZE = 256 * 1024; // 256KB max message size
const WARN_INTERVAL = 5_000; // Don't warn more than once per 5 seconds

/**
 * Check if a WebSocket message should be rate-limited.
 * Call this before processing each message.
 * Returns true if the message should be rejected.
 */
export function isWsRateLimited(ws: WebSocket): boolean {
  const entry = wsRateLimits.get(ws) || { timestamps: [] };
  const now = Date.now();

  // Clean old timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_MESSAGES) {
    // Send warning (throttled)
    if (!entry.lastWarning || now - entry.lastWarning > WARN_INTERVAL) {
      entry.lastWarning = now;
      try {
        ws.send(JSON.stringify({ type: 'error', error: '消息过于频繁，请稍后再试', code: 'RATE_LIMITED' }));
      } catch { /* ignore */ }
    }
    wsRateLimits.set(ws, entry);
    return true;
  }

  entry.timestamps.push(now);
  wsRateLimits.set(ws, entry);
  return false;
}

/**
 * Check if a raw message exceeds the size limit.
 */
export function isWsMessageTooLarge(size: number): boolean {
  return size > MAX_MESSAGE_SIZE;
}

/**
 * Clean up rate limit entry when a connection closes.
 */
export function cleanupWsRateLimit(ws: WebSocket): void {
  wsRateLimits.delete(ws);
}

/**
 * Get current connection count for monitoring.
 */
export function getWsConnectionCount(): number {
  return wsRateLimits.size;
}
