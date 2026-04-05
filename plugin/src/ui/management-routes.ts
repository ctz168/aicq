/**
 * AICQ Management API Routes.
 *
 * REST endpoints for the management SPA.
 * Handles: Dashboard status, Agent config (from openclaw.json/stableclaw.json),
 * Friend management (via remote AICQ server), Model configuration, System settings.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { PluginStore } from "../store.js";
import type { IdentityService } from "../services/identityService.js";
import type { ServerClient } from "../services/serverClient.js";
import type { Logger } from "../types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = any;

interface ManagementContext {
  store: PluginStore;
  identityService: IdentityService;
  serverClient: ServerClient;
  serverUrl: string;
  aicqAgentId: string;
  logger: Logger;
  html: string;
}

/** Well-known LLM providers */
const MODEL_PROVIDERS = [
  { id: "openai", name: "OpenAI", description: "GPT-4o, GPT-4, GPT-3.5, o1, o3", apiKeyHint: "sk-...", modelHint: "gpt-4o", baseUrlHint: "https://api.openai.com/v1", configKey: "openai" },
  { id: "anthropic", name: "Anthropic", description: "Claude 4, Claude 3.5 Sonnet, Haiku, Opus", apiKeyHint: "sk-ant-...", modelHint: "claude-sonnet-4-20250514", baseUrlHint: "https://api.anthropic.com", configKey: "anthropic" },
  { id: "google", name: "Google AI", description: "Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini Pro", apiKeyHint: "AI...", modelHint: "gemini-2.5-pro", baseUrlHint: "", configKey: "google" },
  { id: "groq", name: "Groq", description: "Llama 3.3, Mixtral — ultra fast inference", apiKeyHint: "gsk_...", modelHint: "llama-3.3-70b-versatile", baseUrlHint: "https://api.groq.com/openai/v1", configKey: "groq" },
  { id: "deepseek", name: "DeepSeek", description: "DeepSeek V3, DeepSeek R1 — strong reasoning", apiKeyHint: "sk-...", modelHint: "deepseek-chat", baseUrlHint: "https://api.deepseek.com/v1", configKey: "deepseek" },
  { id: "ollama", name: "Ollama (Local)", description: "Run models locally — Llama, Mistral, Phi, etc.", apiKeyHint: "(no key needed)", modelHint: "llama3", baseUrlHint: "http://localhost:11434/v1", configKey: "ollama" },
  { id: "openrouter", name: "OpenRouter", description: "Unified API for 200+ open-source and commercial models", apiKeyHint: "sk-or-...", modelHint: "openai/gpt-4o", baseUrlHint: "https://openrouter.ai/api/v1", configKey: "openrouter" },
  { id: "mistral", name: "Mistral AI", description: "Mistral Large, Medium, Small, Codestral", apiKeyHint: "(your key)", modelHint: "mistral-large-latest", baseUrlHint: "https://api.mistral.ai/v1", configKey: "mistral" },
  { id: "together", name: "Together AI", description: "Open-source models with fast inference", apiKeyHint: "...", modelHint: "meta-llama/Llama-3-70b-chat-hf", baseUrlHint: "https://api.together.xyz/v1", configKey: "together" },
  { id: "fireworks", name: "Fireworks AI", description: "Fast open-source model serving", apiKeyHint: "...", modelHint: "accounts/fireworks/models/llama-v3-70b-instruct", baseUrlHint: "https://api.fireworks.ai/inference/v1", configKey: "fireworks" },
];

/**
 * Find the config file. Priority: openclaw.json > stableclaw.json.
 * Searches CWD, home dir, and config directories.
 */
function findConfigPath(): string | null {
  // openclaw.json candidates first (higher priority)
  const openclawPaths = [
    path.join(process.cwd(), "openclaw.json"),
    path.join(os.homedir(), ".config", "openclaw", "openclaw.json"),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), "openclaw.json"),
  ];
  for (const p of openclawPaths) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }

  // Then stableclaw.json
  const stableclawPaths = [
    path.join(process.cwd(), "stableclaw.json"),
    path.join(os.homedir(), ".config", "stableclaw", "stableclaw.json"),
    path.join(os.homedir(), ".stableclaw", "stableclaw.json"),
    path.join(os.homedir(), "stableclaw.json"),
  ];
  for (const p of stableclawPaths) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }

  return null;
}

function readConfig(): { config: Record<string, unknown>; configPath: string } | null {
  const configPath = findConfigPath();
  if (!configPath) return null;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    return { config, configPath };
  } catch {
    return null;
  }
}

function writeConfig(config: Record<string, unknown>): boolean {
  const configPath = findConfigPath();
  if (!configPath) return false;
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract agents from config file.
 * Handles multiple possible structures:
 * - config.agents (array)
 * - config.agent (single object)
 * - config.agents.entries (array)
 */
function extractAgentsFromConfig(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const agents: Array<Record<string, unknown>> = [];

  // Try config.agents as array
  const agentsVal = config.agents;
  if (Array.isArray(agentsVal)) {
    for (const a of agentsVal) {
      if (typeof a === "object" && a !== null) {
        agents.push(a as Record<string, unknown>);
      }
    }
  }

  // Try config.agent as single object
  const agentVal = config.agent;
  if (typeof agentVal === "object" && agentVal !== null && !Array.isArray(agentVal)) {
    agents.unshift(agentVal as Record<string, unknown>);
  }

  // If no agents found via specific keys, look for any top-level entries that look like agents
  if (agents.length === 0) {
    for (const [key, val] of Object.entries(config)) {
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        const v = val as Record<string, unknown>;
        if (v.model || v.systemPrompt || v.provider || v.apiKey) {
          agents.push({ _configKey: key, ...v });
        }
      }
    }
  }

  return agents;
}

/**
 * Get model provider config status.
 * Checks multiple locations: config.providers.<id>, config.<id>, config.model.providers.<id>
 */
function getModelProviders(config: Record<string, unknown>) {
  // Try multiple locations for providers
  let providersSection = config.providers as Record<string, unknown> | undefined;
  if (!providersSection || typeof providersSection !== "object") {
    const model = config.model as Record<string, unknown> | undefined;
    if (model?.providers) providersSection = model.providers as Record<string, unknown>;
  }

  const providers = MODEL_PROVIDERS.map((p) => {
    const pc = (providersSection?.[p.configKey] ?? config[p.configKey]) as Record<string, unknown> | undefined;
    const apiKey = (pc?.apiKey as string) || "";
    const modelId = (pc?.model as string) || (pc?.defaultModel as string) || "";
    const baseUrl = (pc?.baseUrl as string) || (pc?.baseURL as string) || "";

    return {
      ...p,
      configured: Boolean(apiKey || (p.id === "ollama" && baseUrl)),
      apiKey: apiKey ? apiKey.substring(0, 6) + "••••••" + apiKey.slice(-4) : "",
      apiKeyHasValue: Boolean(apiKey),
      modelId,
      baseUrl,
    };
  });

  const currentModels: Array<Record<string, unknown>> = [];
  for (const p of MODEL_PROVIDERS) {
    const pc = (providersSection?.[p.configKey] ?? config[p.configKey]) as Record<string, unknown> | undefined;
    if (pc?.apiKey) {
      currentModels.push({
        provider: p.name,
        providerId: p.id,
        modelId: (pc.model as string) || (pc.defaultModel as string) || p.modelHint,
        hasApiKey: true,
        baseUrl: (pc.baseUrl as string) || (pc.baseURL as string) || p.baseUrlHint,
      });
    }
  }

  return { providers, currentModels };
}

/**
 * Parse the request URL to extract the API sub-path.
 * Handles both standalone HTTP server (root /) and gateway (/plugins/aicq-chat/) paths.
 */
function parseApiPath(reqUrl: string): string {
  if (!reqUrl) return "/";
  // Strip query string
  const urlPath = reqUrl.split("?")[0];
  // If accessed via gateway prefix
  const gatewayPrefix = "/plugins/aicq-chat";
  if (urlPath.startsWith(gatewayPrefix)) {
    return urlPath.slice(gatewayPrefix.length) || "/";
  }
  return urlPath;
}

function json(res: Res, data: unknown, status = 200): void {
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  }
  res.end(JSON.stringify(data));
}

function corsHeaders(res: Res): void {
  if (!res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

/**
 * Create the main route handler.
 */
export function createManagementHandler(ctx: ManagementContext): (req: Req, res: Res) => Promise<void> {
  const { store, identityService, serverClient, serverUrl, aicqAgentId, logger, html } = ctx;

  return async (req: Req, res: Res) => {
    const urlPath = parseApiPath(req.url || "/");
    const method = (req.method || "GET").toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      corsHeaders(res);
      res.end();
      return;
    }

    // Serve HTML for root path
    if (urlPath === "/" || urlPath === "/ui" || urlPath === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // API routes must start with /api/
    if (!urlPath.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const apiPath = urlPath.slice(4); // Remove "/api/"

    try {
      // ── GET /api/status ──
      if (apiPath === "/status" && method === "GET") {
        return json(res, {
          connected: serverClient.isConnected(),
          agentId: aicqAgentId,
          fingerprint: identityService.getPublicKeyFingerprint(),
          friendCount: store.getFriendCount(),
          sessionCount: store.sessions.size,
          serverUrl,
        });
      }

      // ── GET /api/identity ──
      if (apiPath === "/identity" && method === "GET") {
        return json(res, {
          agentId: aicqAgentId,
          publicKeyFingerprint: identityService.getPublicKeyFingerprint(),
          connected: serverClient.isConnected(),
          serverUrl,
          friendCount: store.getFriendCount(),
          sessionCount: store.sessions.size,
        });
      }

      // ── GET /api/config ──
      if (apiPath === "/config" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { error: "No config file found. Create openclaw.json or stableclaw.json." });
        const stats = fs.statSync(result.configPath);
        return json(res, {
          configPath: result.configPath,
          configSize: stats.size,
          configModified: stats.mtime.toISOString(),
        });
      }

      // ── GET /api/agents (from config file, not AICQ friends) ──
      if (apiPath === "/agents" && method === "GET") {
        const result = readConfig();
        if (!result) {
          return json(res, {
            agents: [],
            configSource: "none",
            currentAgentId: aicqAgentId,
            fingerprint: identityService.getPublicKeyFingerprint(),
            connected: serverClient.isConnected(),
          });
        }

        const agents = extractAgentsFromConfig(result.config);
        // Store for view/detail API
        (globalThis as any).__aicq_agents = agents;

        return json(res, {
          agents,
          configSource: path.basename(result.configPath),
          configPath: result.configPath,
          currentAgentId: aicqAgentId,
          fingerprint: identityService.getPublicKeyFingerprint(),
          connected: serverClient.isConnected(),
        });
      }

      // ── DELETE /api/agents/:index ──
      if (apiPath.startsWith("/agents/") && method === "DELETE") {
        const idxStr = decodeURIComponent(apiPath.slice("/agents/".length));
        const idx = parseInt(idxStr, 10);
        if (isNaN(idx) || idx < 0) return json(res, { success: false, message: "Invalid agent index" }, 400);

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;
        let agentsArr: Array<unknown> | undefined;

        if (Array.isArray(config.agents)) {
          agentsArr = config.agents;
        } else if (typeof config.agent === "object" && config.agent !== null && idx === 0) {
          delete config.agent;
          const written = writeConfig(config);
          if (written) { logger.info("[API] Agent deleted from config"); return json(res, { success: true, message: "Agent removed" }); }
          return json(res, { success: false, message: "Failed to write config" }, 500);
        }

        if (!agentsArr || idx >= agentsArr.length) {
          return json(res, { success: false, message: "Agent index out of range" }, 400);
        }

        agentsArr.splice(idx, 1);
        const written = writeConfig(config);
        if (written) {
          logger.info("[API] Agent deleted at index " + idx);
          return json(res, { success: true, message: "Agent removed" });
        }
        return json(res, { success: false, message: "Failed to write config" }, 500);
      }

      // ── GET /api/friends ──
      if (apiPath === "/friends" && method === "GET") {
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends?nodeId=" + aicqAgentId);
          if (!resp.ok) return json(res, { error: "Server error: " + await resp.text() }, 502);
          const data = await resp.json() as Record<string, unknown>;
          const friends = ((data.friends || []) as Array<Record<string, unknown>>).map((f) => {
            const local = store.getFriend(f.nodeId as string);
            return {
              id: f.nodeId,
              publicKeyFingerprint: f.publicKeyFingerprint || local?.publicKeyFingerprint || "",
              permissions: f.permissions || local?.permissions || [],
              addedAt: f.addedAt || local?.addedAt?.toISOString() || null,
              lastMessageAt: f.lastMessageAt || local?.lastMessageAt?.toISOString() || null,
              friendType: f.friendType || local?.friendType || null,
              aiName: f.aiName || local?.aiName || null,
            };
          });
          return json(res, { friends });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { error: msg }, 500);
        }
      }

      // ── POST /api/friends (Add friend) ──
      if (apiPath === "/friends" && method === "POST") {
        const body = await readBody(req);
        const target = body.target as string;
        if (!target) return json(res, { success: false, message: "Missing target" }, 400);

        const isTempNumber = /^\d{6}$/.test(target);
        let friendId = target;

        if (isTempNumber) {
          try {
            const resolveResp = await fetch(serverUrl + "/api/v1/temp-number/" + target);
            if (!resolveResp.ok) return json(res, { success: false, message: "Temp number not found or expired" });
            const resolveData = await resolveResp.json() as Record<string, unknown>;
            friendId = resolveData.nodeId as string;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return json(res, { success: false, message: "Failed to resolve temp number: " + msg }, 502);
          }
        }

        try {
          const hsResp = await fetch(serverUrl + "/api/v1/handshake/initiate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: aicqAgentId, targetTempNumber: target }),
          });
          if (!hsResp.ok) return json(res, { success: false, message: "Handshake failed: " + await hsResp.text() });
          const hsData = await hsResp.json() as Record<string, unknown>;
          logger.info("[API] Friend request sent to " + friendId);
          return json(res, { success: true, message: "Friend request sent to " + friendId, sessionId: hsData.sessionId, targetNodeId: friendId });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { success: false, message: "Handshake request failed: " + msg }, 502);
        }
      }

      // ── DELETE /api/friends/:id ──
      if (apiPath.startsWith("/friends/") && method === "DELETE") {
        if (apiPath.includes("/requests/")) {
          // Handled below
        } else if (apiPath.includes("/permissions")) {
          // Handled below
        } else {
          const friendId = decodeURIComponent(apiPath.slice("/friends/".length));
          if (!friendId) return json(res, { success: false, message: "Missing friend ID" }, 400);
          try {
            const rmResp = await fetch(serverUrl + "/api/v1/friends/" + friendId, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nodeId: aicqAgentId }),
            });
            if (!rmResp.ok) return json(res, { success: false, message: "Failed to remove friend: " + await rmResp.text() });
            store.removeFriend(friendId);
            logger.info("[API] Friend removed: " + friendId);
            return json(res, { success: true, message: "Friend removed" });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return json(res, { success: false, message: msg }, 500);
          }
        }
      }

      // ── PUT /api/friends/:id/permissions ──
      if (apiPath.match(/^\/friends\/[^/]+\/permissions$/) && method === "PUT") {
        const friendId = decodeURIComponent(apiPath.split("/")[2]);
        const body = await readBody(req);
        const permissions = body.permissions as ("chat" | "exec")[];
        if (!friendId) return json(res, { success: false, message: "Missing friend ID" }, 400);
        if (!permissions || !Array.isArray(permissions)) {
          return json(res, { success: false, message: "Invalid permissions" }, 400);
        }
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends/" + friendId + "/permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId: aicqAgentId, permissions }),
          });
          if (!resp.ok) return json(res, { success: false, message: "Failed: " + await resp.text() });
          const localFriend = store.getFriend(friendId);
          if (localFriend) { localFriend.permissions = permissions; store.save(); }
          logger.info("[API] Permissions updated for " + friendId);
          return json(res, { success: true, message: "Permissions updated" });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { success: false, message: msg }, 500);
        }
      }

      // ── GET /api/friends/requests ──
      if (apiPath === "/friends/requests" && method === "GET") {
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends/requests?nodeId=" + aicqAgentId);
          if (!resp.ok) return json(res, { error: "Server error: " + await resp.text() }, 502);
          const data = await resp.json() as Record<string, unknown>;
          return json(res, { requests: data.requests || [] });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { error: msg }, 500);
        }
      }

      // ── POST /api/friends/requests/:id/accept ──
      if (apiPath.match(/^\/friends\/requests\/[^/]+\/accept$/) && method === "POST") {
        const requestId = decodeURIComponent(apiPath.split("/")[3]);
        if (!requestId) return json(res, { success: false, message: "Missing request ID" }, 400);
        const body = await readBody(req);
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permissions: body.permissions || ["chat"] }),
          });
          if (!resp.ok) return json(res, { success: false, message: "Failed: " + await resp.text() });
          logger.info("[API] Friend request accepted: " + requestId);
          return json(res, { success: true, message: "Friend request accepted" });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { success: false, message: msg }, 500);
        }
      }

      // ── POST /api/friends/requests/:id/reject ──
      if (apiPath.match(/^\/friends\/requests\/[^/]+\/reject$/) && method === "POST") {
        const requestId = decodeURIComponent(apiPath.split("/")[3]);
        if (!requestId) return json(res, { success: false, message: "Missing request ID" }, 400);
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!resp.ok) return json(res, { success: false, message: "Failed: " + await resp.text() });
          logger.info("[API] Friend request rejected: " + requestId);
          return json(res, { success: true, message: "Friend request rejected" });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(res, { success: false, message: msg }, 500);
        }
      }

      // ── GET /api/sessions ──
      if (apiPath === "/sessions" && method === "GET") {
        const sessions = Array.from(store.sessions.values()).map((s) => ({
          peerId: s.peerId,
          createdAt: s.createdAt.toISOString(),
          messageCount: s.messageCount,
        }));
        return json(res, { sessions });
      }

      // ── GET /api/models ──
      if (apiPath === "/models" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { providers: MODEL_PROVIDERS, currentModels: [], error: "No config file found" });
        return json(res, getModelProviders(result.config));
      }

      // ── PUT /api/models/:providerId ──
      if (apiPath.match(/^\/models\/[^/]+$/) && method === "PUT") {
        const providerId = decodeURIComponent(apiPath.slice("/models/".length));
        const body = await readBody(req);
        const apiKey = body.apiKey as string;
        const modelId = body.modelId as string;
        const baseUrl = body.baseUrl as string;

        const provider = MODEL_PROVIDERS.find((p) => p.id === providerId);
        if (!provider) return json(res, { success: false, message: "Unknown provider: " + providerId }, 400);

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found. Create openclaw.json or stableclaw.json." }, 400);

        const config = result.config;
        if (!config.providers || typeof config.providers !== "object") {
          config.providers = {};
        }
        const providers = config.providers as Record<string, unknown>;

        if (!providers[provider.configKey] || typeof providers[provider.configKey] !== "object") {
          providers[provider.configKey] = {};
        }
        const provConfig = providers[provider.configKey] as Record<string, unknown>;

        if (apiKey) provConfig.apiKey = apiKey;
        if (modelId) provConfig.model = modelId;
        if (baseUrl) provConfig.baseUrl = baseUrl;

        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config file" }, 500);

        logger.info("[API] Model config saved for provider: " + providerId);
        return json(res, { success: true, message: "Model configuration saved for " + provider.name });
      }

      // ── GET /api/settings ──
      if (apiPath === "/settings" && method === "GET") {
        // Read current plugin settings from config file (config.aicq section)
        // Falls back to runtime defaults
        const result = readConfig();
        const aicqSection = (result?.config?.aicq ?? {}) as Record<string, unknown>;

        // Also check plugins.aicq-chat
        const pluginsSection = result?.config?.plugins as Record<string, unknown> | undefined;
        const pluginSection = pluginsSection?.["aicq-chat"] as Record<string, unknown> | undefined;

        // Merge: plugin section > aicq section > defaults
        const merged = { ...aicqSection, ...pluginSection };

        return json(res, {
          serverUrl: (merged.serverUrl as string) || serverUrl,
          maxFriends: (merged.maxFriends as number) || 200,
          autoAcceptFriends: Boolean(merged.autoAcceptFriends),
          agentId: aicqAgentId,
          publicKeyFingerprint: identityService.getPublicKeyFingerprint(),
          connected: serverClient.isConnected(),
          configSource: result ? path.basename(result.configPath) : "none",
          configPath: result?.configPath || null,
          // Runtime info
          friendCount: store.getFriendCount(),
          sessionCount: store.sessions.size,
        });
      }

      // ── PUT /api/settings ──
      if (apiPath === "/settings" && method === "PUT") {
        const body = await readBody(req);

        const newServerUrl = body.serverUrl as string | undefined;
        const newMaxFriends = body.maxFriends as number | undefined;
        const newAutoAccept = body.autoAcceptFriends as boolean | undefined;

        // Validate
        if (newServerUrl !== undefined && typeof newServerUrl !== "string") {
          return json(res, { success: false, message: "serverUrl must be a string" }, 400);
        }
        if (newMaxFriends !== undefined && (typeof newMaxFriends !== "number" || newMaxFriends < 1 || newMaxFriends > 10000)) {
          return json(res, { success: false, message: "maxFriends must be a number between 1 and 10000" }, 400);
        }
        if (newAutoAccept !== undefined && typeof newAutoAccept !== "boolean") {
          return json(res, { success: false, message: "autoAcceptFriends must be a boolean" }, 400);
        }

        const result = readConfig();
        if (!result) {
          return json(res, { success: false, message: "No config file found. Create openclaw.json first." }, 400);
        }

        const config = result.config;

        // Use plugins.aicq-chat section for cleaner namespacing
        if (!config.plugins || typeof config.plugins !== "object") {
          config.plugins = {};
        }
        const plugins = config.plugins as Record<string, unknown>;
        if (!plugins["aicq-chat"] || typeof plugins["aicq-chat"] !== "object") {
          plugins["aicq-chat"] = {};
        }
        const aicqConfig = plugins["aicq-chat"] as Record<string, unknown>;

        // Apply changes
        if (newServerUrl !== undefined) aicqConfig.serverUrl = newServerUrl;
        if (newMaxFriends !== undefined) aicqConfig.maxFriends = newMaxFriends;
        if (newAutoAccept !== undefined) aicqConfig.autoAcceptFriends = newAutoAccept;

        const written = writeConfig(config);
        if (!written) {
          return json(res, { success: false, message: "Failed to write config file" }, 500);
        }

        logger.info("[API] Settings saved: " + JSON.stringify({ serverUrl: newServerUrl, maxFriends: newMaxFriends, autoAcceptFriends: newAutoAccept }));
        return json(res, { success: true, message: "Settings saved successfully" });
      }

      // ── Fallback ──
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found: " + apiPath }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[API] Unhandled error: " + msg);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error: " + msg }));
    }
  };
}
