/**
 * Client configuration — loads values from environment variables with
 * sensible defaults.
 */

import * as path from 'path';
import * as os from 'os';
import type { ClientConfig } from './types.js';

const DEFAULT_SERVER_URL = 'https://aicq.online';
const DEFAULT_MAX_FRIENDS = 200;
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.aicq-client');

/**
 * Load configuration from environment variables, falling back to defaults.
 *
 * Env vars:
 *   AICQ_SERVER_URL   — server base URL
 *   AICQ_DATA_DIR     — local persistence directory
 *   AICQ_MAX_FRIENDS  — maximum friend count
 */
export function loadConfig(overrides?: Partial<ClientConfig>): ClientConfig {
  const serverUrl =
    overrides?.serverUrl ??
    process.env.AICQ_SERVER_URL ??
    DEFAULT_SERVER_URL;

  const wsUrl = overrides?.wsUrl ?? serverUrl.replace(/^https?/, 'wss');

  const maxFriends =
    overrides?.maxFriends ??
    (process.env.AICQ_MAX_FRIENDS
      ? parseInt(process.env.AICQ_MAX_FRIENDS, 10)
      : DEFAULT_MAX_FRIENDS);

  const dataDir =
    overrides?.dataDir ?? process.env.AICQ_DATA_DIR ?? DEFAULT_DATA_DIR;

  return {
    serverUrl,
    wsUrl,
    maxFriends,
    dataDir,
  };
}

/** Resolve the path to the JSON store file inside dataDir. */
export function getStorePath(dataDir: string): string {
  return path.join(dataDir, 'client-store.json');
}
