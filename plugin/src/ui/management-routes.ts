/**
 * AICQ Management API Routes.
 *
 * REST endpoints served at /plugins/aicq-chat/api/*
 * Used by the management SPA to access AICQ plugin data.
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

/** Well-known LLM providers for simple model configuration */
const MODEL_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4, GPT-3.5 and more",
    apiKeyHint: "sk-...",
    modelHint: "gpt-4o",
    baseUrlHint: "https://api.openai.com/v1",
    configKey: "openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4, Claude 3.5 Sonnet, Haiku",
    apiKeyHint: "sk-ant-...",
    modelHint: "claude-sonnet-4-20250514",
    baseUrlHint: "https://api.anthropic.com",
    configKey: "anthropic",
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini 2.5 Pro, Gemini 2.5 Flash",
    apiKeyHint: "AI...",
    modelHint: "gemini-2.5-pro",
    baseUrlHint: "",
    configKey: "google",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Llama 3, Mixtral — ultra fast inference",
    apiKeyHint: "gsk_...",
    modelHint: "llama-3.3-70b-versatile",
    baseUrlHint: "https://api.groq.com/openai/v1",
    configKey: "groq",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek V3, DeepSeek R1",
    apiKeyHint: "sk-...",
    modelHint: "deepseek-chat",
    baseUrlHint: "https://api.deepseek.com/v1",
    configKey: "deepseek",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally on your machine",
    apiKeyHint: "(no key needed)",
    modelHint: "llama3",
    baseUrlHint: "http://localhost:11434/v1",
    configKey: "ollama",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API for 200+ models",
    apiKeyHint: "sk-or-...",
    modelHint: "openai/gpt-4o",
    baseUrlHint: "https://openrouter.ai/api/v1",
    configKey: "openrouter",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Mistral Large, Medium, Small",
    apiKeyHint: "(your key)",
    modelHint: "mistral-large-latest",
    baseUrlHint: "https://api.mistral.ai/v1",
    configKey: "mistral",
  },
];

/**
 * Find and read the OpenClaw config file.
 * Tries common locations.
 */
function findOpenClawConfig(): string | null {
  const candidates = [
    path.join(process.cwd(), "openclaw.json"),
    path.join(process.cwd(), "stableclaw.json"),
    path.join(os.homedir(), ".config", "openclaw", "openclaw.json"),
    path.join(os.homedir(), ".config", "stableclaw", "stableclaw.json"),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".stableclaw", "stableclaw.json"),
    path.join(os.homedir(), "openclaw.json"),
    path.join(os.homedir(), "stableclaw.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Read and parse OpenClaw config.
 */
function readOpenClawConfig(): Record<string, unknown> | null {
  const configPath = findOpenClawConfig();
  if (!configPath) return null;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Write OpenClaw config back to disk.
 */
function writeOpenClawConfig(config: Record<string, unknown>): boolean {
  const configPath = findOpenClawConfig();
  if (!configPath) return false;
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get model provider configuration status from OpenClaw config.
 */
function getModelConfig(config: Record<string, unknown>) {
  const providers = MODEL_PROVIDERS.map((p) => {
    // Check for provider config in various locations in openclaw.json
    // Common pattern: config.providers.<id> or config.<id>
    const providersSection = config.providers as Record<string, unknown> | undefined;
    const providerConfig = (providersSection?.[p.configKey] ?? config[p.configKey]) as Record<string, unknown> | undefined;
    const apiKey = (providerConfig?.apiKey as string) || "";
    const modelId = (providerConfig?.model as string) || (providerConfig?.defaultModel as string) || "";
    const baseUrl = (providerConfig?.baseUrl as string) || (providerConfig?.baseURL as string) || "";

    return {
      ...p,
      configured: Boolean(apiKey || (p.id === "ollama" && baseUrl)),
      apiKey: apiKey ? apiKey.substring(0, 8) + "..." + apiKey.slice(-4) : "",
      apiKeyHasValue: Boolean(apiKey),
      modelId,
      baseUrl,
    };
  });

  // Build list of currently configured models
  const currentModels: Array<Record<string, unknown>> = [];
  const providersSection = config.providers as Record<string, unknown> | undefined;
  for (const p of MODEL_PROVIDERS) {
    const pc = (providersSection?.[p.configKey] ?? config[p.configKey]) as Record<string, unknown> | undefined;
    if (pc?.apiKey) {
      currentModels.push({
        provider: p.name,
        providerId: p.id,
        modelId: (pc.model as string) || (pc.defaultModel as string) || p.modelHint,
        hasApiKey: true,
        baseUrl: (pc.baseUrl as string) || (pc.baseURL as string) || "",
      });
    }
  }

  return { providers, currentModels };
}

/**
 * Parse the URL pathname to extract the sub-path after the plugin prefix.
 * e.g. "/plugins/aicq-chat/api/friends" → "/api/friends"
 */
function parseSubPath(reqPath: string, prefix: string): string {
  // reqPath is like "/plugins/aicq-chat/api/friends"
  // prefix is like "/aicq-chat"
  const fullPrefix = "/plugins" + prefix;
  if (reqPath.startsWith(fullPrefix)) {
    return reqPath.slice(fullPrefix.length) || "/";
  }
  return "/";
}

/**
 * JSON response helper.
 */
function json(res: Res, data: unknown, status = 200): void {
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  }
  res.end(JSON.stringify(data));
}

/**
 * Read request body as JSON.
 */
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
 * Create the main route handler for all management routes.
 */
export function createManagementHandler(ctx: ManagementContext): (req: Req, res: Res) => Promise<void> {
  const { store, identityService, serverClient, serverUrl, aicqAgentId, logger, html } = ctx;

  return async (req: Req, res: Res) => {
    const subPath = parseSubPath(req.url || "/", "/aicq-chat");
    const rawPath = req.url || "/";

    // ── Serve HTML page (root or /ui) ──
    if (subPath === "/" || subPath === "/ui" || subPath === "" || rawPath === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // ── API Routes ──
    if (!subPath.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const apiPath = subPath.slice(4); // Remove "/api/"
    const method = (req.method || "GET").toUpperCase();

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

      // ── GET /api/agents ──
      if (apiPath === "/agents" && method === "GET") {
        // Get local friends as "agents" in the AICQ context
        const localFriends = Array.from(store.friends.values()).map((f) => ({
          id: f.id,
          name: f.aiName || f.id.substring(0, 8),
          friendType: f.friendType,
          publicKeyFingerprint: f.publicKeyFingerprint,
          permissions: f.permissions || [],
          lastMessageAt: f.lastMessageAt?.toISOString() || null,
          sessionCount: store.sessions.has(f.id) ? (store.sessions.get(f.id)?.messageCount || 0) : 0,
        }));

        // Also get server-side friend list
        let serverFriends: Array<Record<string, unknown>> = [];
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends?nodeId=" + aicqAgentId);
          if (resp.ok) {
            const data = await resp.json() as Record<string, unknown>;
            serverFriends = (data.friends || []) as Array<Record<string, unknown>>;
          }
        } catch {
          // ignore server fetch errors
        }

        // Merge: add server-only friends
        const localIds = new Set(localFriends.map(f => f.id));
        for (const sf of serverFriends) {
          const sfId = sf.nodeId as string;
          if (sfId && !localIds.has(sfId)) {
            localFriends.push({
              id: sfId,
              name: (sf.aiName as string) || sfId.substring(0, 8),
              friendType: (sf.friendType as 'human' | 'ai' | undefined) || undefined,
              publicKeyFingerprint: (sf.publicKeyFingerprint as string) || "",
              permissions: (sf.permissions as ('chat' | 'exec')[]) || [],
              lastMessageAt: (sf.lastMessageAt as string) || null,
              sessionCount: 0,
            });
          }
        }

        return json(res, {
          agents: localFriends,
          currentAgentId: aicqAgentId,
          fingerprint: identityService.getPublicKeyFingerprint(),
          connected: serverClient.isConnected(),
        });
      }

      // ── DELETE /api/agents/:id ──
      if (apiPath.startsWith("/agents/") && method === "DELETE") {
        const friendId = decodeURIComponent(apiPath.slice("/agents/".length));
        if (!friendId) return json(res, { success: false, message: "Missing agent ID" }, 400);

        // Remove from server
        try {
          await fetch(serverUrl + "/api/v1/friends/" + friendId, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId: aicqAgentId }),
          });
        } catch {
          // continue with local cleanup
        }

        // Remove from local store
        store.removeFriend(friendId);
        logger.info("[API] Agent/friend deleted: " + friendId);
        return json(res, { success: true, message: "Agent removed" });
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
          const resolveResp = await fetch(serverUrl + "/api/v1/temp-number/" + target);
          if (!resolveResp.ok) return json(res, { success: false, message: "Temp number not found or expired" });
          const resolveData = await resolveResp.json() as Record<string, unknown>;
          friendId = resolveData.nodeId as string;
        }

        const hsResp = await fetch(serverUrl + "/api/v1/handshake/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterId: aicqAgentId, targetTempNumber: target }),
        });
        if (!hsResp.ok) return json(res, { success: false, message: "Handshake failed: " + await hsResp.text() });

        const hsData = await hsResp.json() as Record<string, unknown>;
        logger.info("[API] Friend request sent to " + friendId);
        return json(res, { success: true, message: "Friend request sent to " + friendId, sessionId: hsData.sessionId, targetNodeId: friendId });
      }

      // ── DELETE /api/friends/:id ──
      if (apiPath.startsWith("/friends/") && !apiPath.includes("/permissions") && !apiPath.includes("/requests") && method === "DELETE") {
        // Check if this is /friends/requests/:id pattern
        if (apiPath.includes("/requests/")) {
          const parts = apiPath.split("/");
          // /friends/requests/:id/accept or /friends/requests/:id/reject
          // These are handled below
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
        const permissions = body.permissions as ('chat' | 'exec')[];
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
          if (!resp.ok) return json(res, { success: false, message: "Failed to update: " + await resp.text() });

          const localFriend = store.getFriend(friendId);
          if (localFriend) {
            localFriend.permissions = permissions;
            store.save();
          }

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
        const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: body.permissions || ["chat"] }),
        });
        if (!resp.ok) return json(res, { success: false, message: "Failed: " + await resp.text() });

        logger.info("[API] Friend request accepted: " + requestId);
        return json(res, { success: true, message: "Friend request accepted" });
      }

      // ── POST /api/friends/requests/:id/reject ──
      if (apiPath.match(/^\/friends\/requests\/[^/]+\/reject$/) && method === "POST") {
        const requestId = decodeURIComponent(apiPath.split("/")[3]);
        if (!requestId) return json(res, { success: false, message: "Missing request ID" }, 400);

        const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resp.ok) return json(res, { success: false, message: "Failed: " + await resp.text() });

        logger.info("[API] Friend request rejected: " + requestId);
        return json(res, { success: true, message: "Friend request rejected" });
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
        const config = readOpenClawConfig();
        const modelData = config ? getModelConfig(config) : { providers: MODEL_PROVIDERS, currentModels: [] };
        return json(res, modelData);
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

        const config = readOpenClawConfig();
        if (!config) {
          return json(res, { success: false, message: "Could not find openclaw.json config file. Make sure OpenClaw is properly configured." }, 400);
        }

        // Ensure providers section exists
        if (!config.providers) {
          config.providers = {};
        }
        const providers = config.providers as Record<string, unknown>;

        if (!providers[provider.configKey]) {
          providers[provider.configKey] = {};
        }
        const provConfig = providers[provider.configKey] as Record<string, unknown>;

        if (apiKey) provConfig.apiKey = apiKey;
        if (modelId) provConfig.model = modelId;
        if (baseUrl) provConfig.baseUrl = baseUrl;

        const written = writeOpenClawConfig(config);
        if (!written) {
          return json(res, { success: false, message: "Failed to write config file" }, 500);
        }

        logger.info("[API] Model config saved for provider: " + providerId);
        return json(res, { success: true, message: "Model configuration saved for " + provider.name });
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
