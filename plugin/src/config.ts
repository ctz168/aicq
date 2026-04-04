/**
 * Configuration loader for the AICQ plugin.
 *
 * Merges defaults from openclaw.plugin.json configSchema with environment
 * variables and any user-provided overrides.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type { PluginConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = process.env.AICQ_SERVER_URL || "https://aicq.online";

/**
 * Load the plugin configuration.
 *
 * Precedence (highest → lowest):
 *   1. Explicit `overrides` parameter
 *   2. Environment variables
 *   3. Values from openclaw.plugin.json `configSchema` defaults
 *   4. Hardcoded fallbacks
 */
export function loadConfig(overrides?: Partial<PluginConfig>): PluginConfig {
  // Try to read the plugin manifest for schema defaults
  let schemaDefaults: Partial<PluginConfig> = {};
  try {
    const manifestPath = path.resolve(__dirname, "..", "openclaw.plugin.json");
    const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw);
    const schema = manifest.configSchema;

    if (schema) {
      if (schema.serverUrl?.default) schemaDefaults.serverUrl = schema.serverUrl.default;
      if (schema.maxFriends?.default) schemaDefaults.maxFriends = schema.maxFriends.default;
      if (schema.autoAcceptFriends?.default) schemaDefaults.autoAcceptFriends = schema.autoAcceptFriends.default;
    }
  } catch {
    // Manifest not found or unreadable – use hardcoded defaults
  }

  const config: PluginConfig = {
    serverUrl: overrides?.serverUrl ?? process.env.AICQ_SERVER_URL ?? schemaDefaults.serverUrl ?? SERVER_URL,
    agentId: overrides?.agentId ?? process.env.AICQ_AGENT_ID ?? schemaDefaults.agentId ?? "",
    maxFriends: overrides?.maxFriends ?? (process.env.AICQ_MAX_FRIENDS ? parseInt(process.env.AICQ_MAX_FRIENDS, 10) : undefined) ?? schemaDefaults.maxFriends ?? 200,
    autoAcceptFriends: overrides?.autoAcceptFriends ??
      (process.env.AICQ_AUTO_ACCEPT === "true" ? true :
        schemaDefaults.autoAcceptFriends ?? false),
  };

  // Auto-generate agentId if not set
  if (!config.agentId) {
    config.agentId = generateAgentId();
  }

  return config;
}

/**
 * Generate a random agent ID (UUID v4 without dashes for compactness).
 */
function generateAgentId(): string {
  return uuidv4().replace(/-/g, "");
}

export { SERVER_URL };
