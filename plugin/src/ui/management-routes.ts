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
  chatChannel?: { cleanup?: () => void };
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
  // Chinese / local providers
  { id: "modelscope", name: "ModelScope (魔搭)", description: "ZhipuAI GLM-5, Kimi-K2.5, MiniMax, Step models", apiKeyHint: "ms-...", modelHint: "Qwen/Qwen3-235B-A22B", baseUrlHint: "https://api-inference.modelscope.cn/v1", configKey: "modelscope" },
  { id: "zhipu", name: "Zhipu AI (智谱)", description: "GLM-5, GLM-4, CogView, CogVideoX", apiKeyHint: "...", modelHint: "glm-5", baseUrlHint: "https://open.bigmodel.cn/api/paas/v4", configKey: "zhipu" },
  { id: "qwen", name: "Alibaba Qwen (通义千问)", description: "Qwen3-235B, Qwen3-32B, Qwen-VL", apiKeyHint: "sk-...", modelHint: "qwen3-235b-a22b", baseUrlHint: "https://dashscope.aliyuncs.com/compatible-mode/v1", configKey: "qwen" },
  { id: "doubao", name: "ByteDance Doubao (豆包)", description: "Doubao Pro, Doubao Lite — ByteDance LLMs", apiKeyHint: "...", modelHint: "doubao-pro-32k", baseUrlHint: "https://ark.cn-beijing.volces.com/api/v3", configKey: "doubao" },
  { id: "moonshot", name: "Moonshot/Kimi (月之暗面)", description: "Kimi-K2.5, Moonshot-v1 — strong Chinese reasoning", apiKeyHint: "sk-...", modelHint: "moonshot-v1-128k", baseUrlHint: "https://api.moonshot.cn/v1", configKey: "moonshot" },
  { id: "minimax", name: "MiniMax", description: "MiniMax-M2.5, abab — multimodal AI", apiKeyHint: "...", modelHint: "MiniMax-M2.5", baseUrlHint: "https://api.minimax.chat/v1", configKey: "minimax" },
  { id: "stepfun", name: "StepFun (阶跃星辰)", description: "Step-3.5, Step-2 — reasoning models", apiKeyHint: "...", modelHint: "step-3.5-flash", baseUrlHint: "https://api.stepfun.com/v1", configKey: "stepfun" },
  { id: "baidu", name: "Baidu Wenxin (百度文心)", description: "ERNIE 4.0, ERNIE 3.5 — Baidu LLMs", apiKeyHint: "...", modelHint: "ernie-4.0-8k", baseUrlHint: "https://aip.baidubce.com/rpc/2.0/ai_custom", configKey: "baidu" },
  { id: "spark", name: "iFlytek Spark (讯飞星火)", description: "Spark 4.0 Ultra, Spark 3.5 — iFlytek LLMs", apiKeyHint: "...", modelHint: "spark-4.0-ultra", baseUrlHint: "https://spark-api-open.xf-yun.com/v1", configKey: "spark" },
];

/**
 * Find the config file. Priority: openclaw.json > stableclaw.json.
 * Searches CWD, parent directories (up to root), home dir, and config directories.
 */
function findConfigPath(): string | null {
  // Helper to walk up directories from cwd looking for a filename
  function searchUpward(fileName: string): string | null {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, fileName);
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
      const parent = path.dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
    return null;
  }

  // openclaw.json candidates first (higher priority)
  const fromCwd = searchUpward("openclaw.json");
  if (fromCwd) return fromCwd;

  const openclawHomePaths = [
    path.join(os.homedir(), ".config", "openclaw", "openclaw.json"),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), "openclaw.json"),
  ];
  for (const p of openclawHomePaths) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }

  // Then stableclaw.json
  const fromCwdStable = searchUpward("stableclaw.json");
  if (fromCwdStable) return fromCwdStable;

  const stableclawHomePaths = [
    path.join(os.homedir(), ".config", "stableclaw", "stableclaw.json"),
    path.join(os.homedir(), ".stableclaw", "stableclaw.json"),
    path.join(os.homedir(), "stableclaw.json"),
  ];
  for (const p of stableclawHomePaths) {
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
 *
 * OpenClaw native format:
 *   - config.agents.list[] (array of agent objects with id, default, workspace, skills)
 *   - config.agents.defaults (default settings for all agents)
 *   - config.agent.model.primary (the primary model string, e.g. "anthropic/claude-sonnet-4-6")
 *   - config.agent (single agent object)
 *
 * Legacy / compatible format:
 *   - config.agents (array)
 *   - config.models.providers.<id>.models[]
 *   - fallback: any top-level entries that look like agents
 */
function extractAgentsFromConfig(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const agents: Array<Record<string, unknown>> = [];

  // ── OpenClaw native: config.agents.list[] ──
  const agentsObj = config.agents;
  if (typeof agentsObj === "object" && agentsObj !== null && !Array.isArray(agentsObj)) {
    const agentsRecord = agentsObj as Record<string, unknown>;
    // Add defaults info if present
    if (typeof agentsRecord.defaults === "object" && agentsRecord.defaults !== null) {
      agents.push({
        _source: "agents-defaults",
        name: "(Defaults)",
        ...agentsRecord.defaults as Record<string, unknown>,
      });
    }
    // Add list entries
    const listArr = agentsRecord.list;
    if (Array.isArray(listArr)) {
      for (const a of listArr) {
        if (typeof a === "object" && a !== null) {
          agents.push({
            _source: "agents-list",
            ...a as Record<string, unknown>,
          });
        }
      }
    }
  }

  // ── Legacy: config.agents as array ──
  if (agents.length === 0 && Array.isArray(config.agents)) {
    for (const a of config.agents) {
      if (typeof a === "object" && a !== null) {
        agents.push(a as Record<string, unknown>);
      }
    }
  }

  // ── OpenClaw: config.agent (single object) — extract primary model ──
  const agentVal = config.agent;
  if (typeof agentVal === "object" && agentVal !== null && !Array.isArray(agentVal)) {
    const agentRecord = agentVal as Record<string, unknown>;
    // If the agent object has model info, add it as the primary agent
    if (agentRecord.model) {
      const existingPrimary = agents.find((a) => (a.default === true) || (a.isDefault === true));
      if (!existingPrimary) {
        agents.unshift({
          _source: "agent-primary",
          name: "Primary Agent",
          default: true,
          ...agentRecord,
        });
      }
    } else if (agents.length === 0) {
      agents.unshift({
        _source: "agent-single",
        ...agentRecord,
      });
    }
  }

  // ── Extract from models.providers.<providerId>.models[] structure ──
  const modelsSection = config.models as Record<string, unknown> | undefined;
  const defaultModel = (modelsSection?.defaultModel as string) || "";
  if (modelsSection && typeof modelsSection === "object") {
    const providersSection = modelsSection.providers as Record<string, unknown> | undefined;
    if (providersSection && typeof providersSection === "object") {
      for (const [providerId, providerConfig] of Object.entries(providersSection)) {
        if (typeof providerConfig !== "object" || providerConfig === null) continue;
        const pc = providerConfig as Record<string, unknown>;
        const modelsArr = pc.models;
        if (Array.isArray(modelsArr)) {
          for (let mi = 0; mi < modelsArr.length; mi++) {
            const m = modelsArr[mi];
            if (typeof m === "object" && m !== null) {
              const mObj = m as Record<string, unknown>;
              const agentEntry: Record<string, unknown> = {
                _source: "provider-model",
                _providerId: providerId,
                _modelIndex: mi,
                _configPath: "models.providers." + providerId + ".models." + mi,
                name: mObj.name || mObj.id || providerId + "/" + mi,
                model: mObj.id || "",
                provider: providerId,
                enabled: true,
                isDefault: defaultModel === (mObj.id as string),
              };
              agents.push(agentEntry);
            }
          }
        }
      }
    }
  }

  // ── Fallback: any top-level entries that look like agents ──
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
 * Supports multiple config formats:
 *
 * OpenClaw native:
 *   - config.agent.model.primary (e.g. "anthropic/claude-sonnet-4-6")
 *   - config.auth.profiles (API key authentication profiles)
 *   - config.env (environment variables for API keys)
 *
 * Legacy / compatible:
 *   - config.providers.<id>
 *   - config.models.providers.<id>
 *   - config.<id> (top-level provider keys)
 *
 * Handles both single-model (provider.model) and multi-model (provider.models[]) structures.
 */
function getModelProviders(config: Record<string, unknown>) {
  // Try multiple locations for providers
  let providersSection = config.providers as Record<string, unknown> | undefined;
  if (!providersSection || typeof providersSection !== "object") {
    const model = config.model as Record<string, unknown> | undefined;
    if (model?.providers) providersSection = model.providers as Record<string, unknown>;
  }
  // Also try config.models.providers
  if (!providersSection || typeof providersSection !== "object") {
    const models = config.models as Record<string, unknown> | undefined;
    if (models?.providers) providersSection = models.providers as Record<string, unknown>;
  }

  // Read defaultModel from config.models.defaultModel or config.agent.model.primary
  const modelsSection = config.models as Record<string, unknown> | undefined;
  let defaultModel = (modelsSection?.defaultModel as string) || "";

  // ── OpenClaw native: parse agent.model.primary ──
  const agentObj = config.agent as Record<string, unknown> | undefined;
  const agentModel = agentObj?.model as Record<string, unknown> | string | undefined;
  if (typeof agentModel === "string" && !defaultModel) {
    // Format: "provider/model-id" e.g. "anthropic/claude-sonnet-4-6"
    defaultModel = agentModel;
  } else if (typeof agentModel === "object" && agentModel) {
    if (!defaultModel) defaultModel = (agentModel.primary as string) || "";
  }

  // ── OpenClaw native: extract auth profiles ──
  const authProfiles: Record<string, { provider: string; mode: string }> = {};
  const authObj = config.auth as Record<string, unknown> | undefined;
  if (authObj && typeof authObj === "object") {
    const profiles = authObj.profiles as Record<string, unknown> | undefined;
    if (profiles && typeof profiles === "object") {
      for (const [profileKey, profileVal] of Object.entries(profiles)) {
        if (typeof profileVal !== "object" || profileVal === null) continue;
        const pv = profileVal as Record<string, unknown>;
        authProfiles[profileKey] = {
          provider: (pv.provider as string) || "",
          mode: (pv.mode as string) || "",
        };
      }
    }
  }

  // ── OpenClaw native: extract env vars for API keys ──
  const envVars: Record<string, string> = {};
  const envObj = config.env as Record<string, unknown> | undefined;
  if (envObj && typeof envObj === "object") {
    const vars = envObj.vars as Record<string, unknown> | undefined;
    if (vars && typeof vars === "object") {
      for (const [key, val] of Object.entries(vars)) {
        if (typeof val === "string") {
          envVars[key] = val;
        }
      }
    }
    // Also top-level keys in env that look like API key references
    for (const [key, val] of Object.entries(envObj)) {
      if (key === "vars" || key === "shellEnv") continue;
      if (typeof val === "string" && (key.includes("API_KEY") || key.includes("_KEY") || key.toLowerCase().includes("apikey"))) {
        envVars[key] = val;
      }
    }
  }

  // --- Built-in providers ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: any[] = MODEL_PROVIDERS.map((p) => {
    const pc = (providersSection?.[p.configKey] ?? config[p.configKey]) as Record<string, unknown> | undefined;
    let apiKey = (pc?.apiKey as string) || "";

    // Check OpenClaw auth profiles for matching provider API key
    if (!apiKey) {
      for (const [profileKey, profile] of Object.entries(authProfiles)) {
        if (profile.provider === p.configKey && profile.mode === "api_key") {
          // Auth profiles reference secrets stored in auth-profiles.json, not direct keys
          // Just note that a profile exists
          apiKey = "__auth_profile__";
        }
      }
    }

    // Check OpenClaw env vars for matching provider API keys
    if (apiKey === "" || apiKey === "__auth_profile__") {
      for (const [envKey, envVal] of Object.entries(envVars)) {
        if (
          envKey.toUpperCase().includes(p.configKey.toUpperCase()) ||
          (p.configKey === "openai" && envKey.toUpperCase().includes("OPENAI")) ||
          (p.configKey === "anthropic" && envKey.toUpperCase().includes("ANTHROPIC")) ||
          (p.configKey === "google" && envKey.toUpperCase().includes("GOOGLE")) ||
          (p.configKey === "groq" && envKey.toUpperCase().includes("GROQ")) ||
          (p.configKey === "deepseek" && envKey.toUpperCase().includes("DEEPSEEK")) ||
          (p.configKey === "openrouter" && envKey.toUpperCase().includes("OPENROUTER")) ||
          (p.configKey === "zhipu" && envKey.toUpperCase().includes("ZHIPU")) ||
          (p.configKey === "qwen" && envKey.toUpperCase().includes("QWEN")) ||
          (p.configKey === "moonshot" && envKey.toUpperCase().includes("MOONSHOT")) ||
          (p.configKey === "doubao" && envKey.toUpperCase().includes("DOUBAO")) ||
          (p.configKey === "stepfun" && envKey.toUpperCase().includes("STEPFUN"))
        ) {
          apiKey = envVal;
          break;
        }
      }
    }

    // If defaultModel is set (e.g., "anthropic/claude-sonnet-4-6"), check if this provider matches
    let singleModelId = (pc?.model as string) || (pc?.defaultModel as string) || "";
    if (!singleModelId && defaultModel && defaultModel.startsWith(p.configKey + "/")) {
      singleModelId = defaultModel.split("/").slice(1).join("/");
    }
    const baseUrl = (pc?.baseUrl as string) || (pc?.baseURL as string) || "";

    // Handle multi-model array: provider.models[]
    let modelsList: Array<Record<string, unknown>> = [];
    const modelsArr = pc?.models;
    if (Array.isArray(modelsArr)) {
      modelsList = modelsArr.filter((m) => typeof m === "object" && m !== null).map((m) => m as Record<string, unknown>);
    }

    // If multi-model, use defaultModel as the primary modelId
    let modelId = singleModelId;
    if (modelsList.length > 0 && !modelId) {
      modelId = defaultModel || modelsList[0]?.id as string || "";
    }

    return {
      ...p,
      configured: Boolean(apiKey || (p.id === "ollama" && baseUrl)),
      apiKey: apiKey ? apiKey.substring(0, 6) + "••••••" + apiKey.slice(-4) : "",
      apiKeyHasValue: Boolean(apiKey),
      modelId,
      baseUrl,
      models: modelsList,
      modelCount: modelsList.length,
      isCustom: false,
    };
  });

  // --- Custom providers (stored under config.providers.custom[]) ---
  const customProvidersSection = providersSection?.custom;
  const customProviders: Array<Record<string, unknown>> = [];
  if (Array.isArray(customProvidersSection)) {
    for (let i = 0; i < customProvidersSection.length; i++) {
      const cp = customProvidersSection[i];
      if (typeof cp !== "object" || cp === null) continue;
      const cpObj = cp as Record<string, unknown>;
      const cApiKey = (cpObj.apiKey as string) || "";
      const cModelId = (cpObj.modelId as string) || (cpObj.model as string) || "";
      const cBaseUrl = (cpObj.baseUrl as string) || (cpObj.baseURL as string) || "";
      const cId = (cpObj.id as string) || ("custom-" + i);

      // Handle multi-model array for custom providers
      let cModelsList: Array<Record<string, unknown>> = [];
      const cModelsArr = cpObj.models;
      if (Array.isArray(cModelsArr)) {
        cModelsList = cModelsArr.filter((m) => typeof m === "object" && m !== null).map((m) => m as Record<string, unknown>);
      }

      providers.push({
        id: cId,
        name: (cpObj.name as string) || cId,
        description: (cpObj.description as string) || "Custom provider",
        configured: Boolean(cApiKey || cBaseUrl),
        apiKey: cApiKey ? cApiKey.substring(0, 6) + "••••••" + cApiKey.slice(-4) : "",
        apiKeyHasValue: Boolean(cApiKey),
        apiKeyHint: "sk-...",
        modelId: cModelsList.length > 0 ? (defaultModel || cModelsList[0]?.id as string || "") : cModelId,
        modelHint: cModelId || "model-name",
        baseUrl: cBaseUrl,
        baseUrlHint: cBaseUrl || "https://...",
        models: cModelsList,
        modelCount: cModelsList.length,
        isCustom: true,
      } as Record<string, unknown>);
    }
  }

  // --- Build currentModels (all providers with API keys) ---
  const currentModels: Array<Record<string, unknown>> = [];
  for (const p of providers) {
    if (!p.apiKeyHasValue) continue;
    const pId = p.id as string;
    const pName = p.name as string;
    const isCustom = p.isCustom as boolean;
    const pModels = p.models as Array<Record<string, unknown>>;
    const pBaseUrl = p.baseUrl as string;
    const pModelHint = (p as Record<string, unknown>).modelHint as string || "";

    if (pModels && pModels.length > 0) {
      for (const m of pModels) {
        if (typeof m === "object" && m !== null) {
          const mObj = m as Record<string, unknown>;
          currentModels.push({
            provider: pName,
            providerId: pId,
            modelId: (mObj.id as string) || "",
            modelName: (mObj.name as string) || "",
            hasApiKey: true,
            baseUrl: pBaseUrl,
            isDefault: defaultModel === (mObj.id as string),
            isCustom,
          });
        }
      }
    } else {
      currentModels.push({
        provider: pName,
        providerId: pId,
        modelId: p.modelId as string || pModelHint,
        hasApiKey: true,
        baseUrl: pBaseUrl,
        isDefault: false,
        isCustom,
      });
    }
  }

  return { providers, currentModels, defaultModel, customProviders: customProvidersSection || [] };
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
  const { store, identityService, serverClient, serverUrl, aicqAgentId, logger, html, chatChannel } = ctx;

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

      // ── DELETE /api/agents/:identifier (supports index or provider-model path) ──
      if (apiPath.startsWith("/agents/") && method === "DELETE") {
        const identifier = decodeURIComponent(apiPath.slice("/agents/".length));

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;

        // Support provider-model path format: e.g. "provider:modelscope:2"
        const providerModelMatch = identifier.match(/^provider:([^:]+):(\d+)$/);
        if (providerModelMatch) {
          const providerId = providerModelMatch[1];
          const modelIdx = parseInt(providerModelMatch[2], 10);
          const modelsSection = config.models as Record<string, unknown> | undefined;
          const providersObj = modelsSection?.providers as Record<string, unknown> | undefined;
          const provConfig = providersObj?.[providerId] as Record<string, unknown> | undefined;
          const modelsArr = provConfig?.models as Array<unknown> | undefined;
          if (!modelsArr || modelIdx >= modelsArr.length) {
            return json(res, { success: false, message: "Provider model index out of range" }, 400);
          }
          modelsArr.splice(modelIdx, 1);
          const written = writeConfig(config);
          if (written) {
            logger.info("[API] Provider model deleted: " + providerId + ".models[" + modelIdx + "]");
            return json(res, { success: true, message: "Model removed from " + providerId });
          }
          return json(res, { success: false, message: "Failed to write config" }, 500);
        }

        // Fallback: numeric index for config.agents array
        const idx = parseInt(identifier, 10);
        if (isNaN(idx) || idx < 0) return json(res, { success: false, message: "Invalid agent identifier" }, 400);

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
          const resp = await fetch(serverUrl + "/api/v1/friends?nodeId=" + aicqAgentId, {
            headers: serverClient.authHeaders(),
          });
          if (!resp.ok) return json(res, { error: "Server error: " + await resp.text() }, 502);
          const data = await resp.json() as Record<string, unknown>;
          const friends = ((data.friends || []) as Array<Record<string, unknown>>).map((f) => {
            const friendId = (f.id || f.nodeId) as string;
            const local = store.getFriend(friendId);
            return {
              id: friendId,
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
          // Offline fallback: return friends from local store cache
          const friends = Array.from(store.friends.values()).map((f) => ({
            id: f.id,
            publicKeyFingerprint: f.publicKeyFingerprint || "",
            permissions: f.permissions || [],
            addedAt: f.addedAt?.toISOString() || null,
            lastMessageAt: f.lastMessageAt?.toISOString() || null,
            friendType: f.friendType || null,
            aiName: f.aiName || null,
          }));
          return json(res, { friends, offline: true });
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
            const resolveResp = await fetch(serverUrl + "/api/v1/temp-number/" + target, {
              headers: serverClient.authHeaders(),
            });
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
            headers: serverClient.authHeaders(),
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
              headers: serverClient.authHeaders(),
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
            headers: serverClient.authHeaders(),
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
          const resp = await fetch(serverUrl + "/api/v1/friends/requests?accountId=" + aicqAgentId, {
            headers: serverClient.authHeaders(),
          });
          if (!resp.ok) return json(res, { error: "Server error: " + await resp.text() }, 502);
          const data = await resp.json() as Record<string, unknown>;
          return json(res, { requests: data.requests || [] });
        } catch (err: unknown) {
          // Offline fallback: return pending requests from local store cache
          const requests = store.pendingRequests.map((p) => ({
            id: p.requesterId,
            fromId: p.requesterId,
            status: "pending",
            createdAt: p.timestamp.toISOString(),
          }));
          return json(res, { requests, offline: true });
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
            headers: serverClient.authHeaders(),
            body: JSON.stringify({ accountId: aicqAgentId, permissions: body.permissions || ["chat"] }),
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
            headers: serverClient.authHeaders(),
            body: JSON.stringify({ accountId: aicqAgentId }),
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
        if (!result) return json(res, { providers: MODEL_PROVIDERS, currentModels: [], defaultModel: "", error: "No config file found" });
        return json(res, getModelProviders(result.config));
      }

      // ── GET /api/models/default ──
      if (apiPath === "/models/default" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { defaultModel: "", error: "No config file found" });
        const modelsSection = result.config.models as Record<string, unknown> | undefined;
        const defaultModel = (modelsSection?.defaultModel as string) || "";

        // Find which provider/model entry the default refers to
        let defaultProvider = "";
        let defaultModelName = "";
        if (defaultModel && modelsSection?.providers) {
          const providersObj = modelsSection.providers as Record<string, unknown>;
          for (const [provId, provConfig] of Object.entries(providersObj)) {
            const pc = provConfig as Record<string, unknown>;
            if (Array.isArray(pc.models)) {
              const found = (pc.models as Array<Record<string, unknown>>).find((m) => m.id === defaultModel);
              if (found) {
                defaultProvider = provId;
                defaultModelName = (found.name as string) || (found.id as string) || "";
                break;
              }
            }
          }
        }

        return json(res, {
          defaultModel,
          defaultProvider,
          defaultModelName,
        });
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

      // ── POST /api/models/custom — Add a custom provider ──
      if (apiPath === "/models/custom" && method === "POST") {
        const body = await readBody(req);
        const name = (body.name as string)?.trim();
        const apiKey = body.apiKey as string;
        const modelId = body.modelId as string;
        const baseUrl = body.baseUrl as string;
        const description = body.description as string;

        if (!name) return json(res, { success: false, message: "Provider name is required" }, 400);
        if (!apiKey && !modelId && !baseUrl) {
          return json(res, { success: false, message: "At least one of API Key, Model ID, or Base URL is required" }, 400);
        }

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;
        if (!config.providers || typeof config.providers !== "object") {
          config.providers = {};
        }
        const providers = config.providers as Record<string, unknown>;

        if (!Array.isArray(providers.custom)) {
          providers.custom = [];
        }
        const customArr = providers.custom as Array<Record<string, unknown>>;

        // Check for duplicate name or id
        const newId = "custom-" + crypto.randomUUID().replace(/-/g, "").substring(0, 8);
        const duplicate = customArr.find((c) => (c.name as string)?.toLowerCase() === name.toLowerCase());
        if (duplicate) {
          return json(res, { success: false, message: "A provider with this name already exists" }, 409);
        }

        const newProvider: Record<string, unknown> = {
          id: newId,
          name,
          createdAt: new Date().toISOString(),
        };
        if (apiKey) newProvider.apiKey = apiKey;
        if (modelId) newProvider.modelId = modelId;
        if (baseUrl) newProvider.baseUrl = baseUrl;
        if (description) newProvider.description = description;

        customArr.push(newProvider);
        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config file" }, 500);

        logger.info("[API] Custom provider added: " + name + " (" + newId + ")");
        return json(res, { success: true, message: "Custom provider '" + name + "' added", providerId: newId });
      }

      // ── PUT /api/models/custom/:id — Update a custom provider ──
      if (apiPath.match(/^\/models\/custom\/[^/]+$/) && method === "PUT") {
        const customId = decodeURIComponent(apiPath.slice("/models/custom/".length));
        const body = await readBody(req);

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;
        const providers = config.providers as Record<string, unknown> | undefined;
        const customArr = providers?.custom as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(customArr)) {
          return json(res, { success: false, message: "No custom providers found" }, 404);
        }

        const idx = customArr.findIndex((c) => (c.id as string) === customId);
        if (idx === -1) {
          return json(res, { success: false, message: "Custom provider not found" }, 404);
        }

        const cp = customArr[idx];
        if (body.name) cp.name = (body.name as string).trim();
        if (body.apiKey !== undefined) cp.apiKey = body.apiKey;
        if (body.modelId !== undefined) cp.modelId = body.modelId;
        if (body.baseUrl !== undefined) cp.baseUrl = body.baseUrl;
        if (body.description !== undefined) cp.description = body.description;

        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config file" }, 500);

        logger.info("[API] Custom provider updated: " + customId);
        return json(res, { success: true, message: "Custom provider updated" });
      }

      // ── DELETE /api/models/custom/:id — Delete a custom provider ──
      if (apiPath.match(/^\/models\/custom\/[^/]+$/) && method === "DELETE") {
        const customId = decodeURIComponent(apiPath.slice("/models/custom/".length));

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;
        const providers = config.providers as Record<string, unknown> | undefined;
        const customArr = providers?.custom as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(customArr)) {
          return json(res, { success: false, message: "No custom providers found" }, 404);
        }

        const idx = customArr.findIndex((c) => (c.id as string) === customId);
        if (idx === -1) {
          return json(res, { success: false, message: "Custom provider not found" }, 404);
        }

        const removed = customArr.splice(idx, 1)[0];
        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config file" }, 500);

        logger.info("[API] Custom provider deleted: " + (removed.name || customId));
        return json(res, { success: true, message: "Custom provider '" + (removed.name || customId) + "' deleted" });
      }

      // ── GET /api/openclaw-config ──
      // Returns the agents, bindings, and channels sections from openclaw.json
      if (apiPath === "/openclaw-config" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { error: "No config file found" }, 400);
        const config = result.config;
        return json(res, {
          agents: config.agents || null,
          bindings: config.bindings || [],
          channels: config.channels || null,
          configPath: result.configPath,
        });
      }

      // ── PUT /api/openclaw-config ──
      // Updates agents, bindings, and/or channels sections
      if (apiPath === "/openclaw-config" && method === "PUT") {
        const body = await readBody(req);
        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);
        const config = result.config;

        if (body.agents !== undefined) config.agents = body.agents;
        if (body.bindings !== undefined) config.bindings = body.bindings;
        if (body.channels !== undefined) config.channels = body.channels;

        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config" }, 500);
        logger.info("[API] OpenClaw config updated");
        return json(res, { success: true, message: "Configuration saved" });
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
          // Connection settings
          serverUrl: (merged.serverUrl as string) || serverUrl,
          wsReconnectInterval: (merged.wsReconnectInterval as number) || 60,
          wsAutoReconnect: merged.wsAutoReconnect !== false,
          connectionTimeout: (merged.connectionTimeout as number) || 30,

          // Friend settings
          maxFriends: (merged.maxFriends as number) || 200,
          autoAcceptFriends: Boolean(merged.autoAcceptFriends),
          defaultPermissions: (merged.defaultPermissions as string[]) || ["chat"],

          // Temp number settings
          tempNumberExpiry: (merged.tempNumberExpiry as number) || 300,

          // File transfer settings
          maxFileSize: (merged.maxFileSize as number) || 104857600,
          enableFileTransfer: merged.enableFileTransfer !== false,
          allowedFileTypes: (merged.allowedFileTypes as string[]) || null,

          // Logging
          logLevel: (merged.logLevel as string) || "info",

          // Security / encryption
          enableP2P: merged.enableP2P !== false,
          handshakeTimeout: (merged.handshakeTimeout as number) || 60,

          // Identity (read-only)
          agentId: aicqAgentId,
          publicKeyFingerprint: identityService.getPublicKeyFingerprint(),
          connected: serverClient.isConnected(),

          // Config file info
          configSource: result ? path.basename(result.configPath) : "none",
          configPath: result?.configPath || null,

          // Runtime info
          friendCount: store.getFriendCount(),
          sessionCount: store.sessions.size,
          uptimeSeconds: Math.floor(process.uptime()),
        });
      }

      // ── PUT /api/settings ──
      if (apiPath === "/settings" && method === "PUT") {
        const body = await readBody(req);

        const newServerUrl = body.serverUrl as string | undefined;
        const newMaxFriends = body.maxFriends as number | undefined;
        const newAutoAccept = body.autoAcceptFriends as boolean | undefined;
        const newWsReconnectInterval = body.wsReconnectInterval as number | undefined;
        const newWsAutoReconnect = body.wsAutoReconnect as boolean | undefined;
        const newConnectionTimeout = body.connectionTimeout as number | undefined;
        const newTempNumberExpiry = body.tempNumberExpiry as number | undefined;
        const newMaxFileSize = body.maxFileSize as number | undefined;
        const newEnableFileTransfer = body.enableFileTransfer as boolean | undefined;
        const newAllowedFileTypes = body.allowedFileTypes as string[] | null | undefined;
        const newLogLevel = body.logLevel as string | undefined;
        const newEnableP2P = body.enableP2P as boolean | undefined;
        const newHandshakeTimeout = body.handshakeTimeout as number | undefined;
        const newDefaultPermissions = body.defaultPermissions as string[] | undefined;

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
        if (newWsReconnectInterval !== undefined && (typeof newWsReconnectInterval !== "number" || newWsReconnectInterval < 5 || newWsReconnectInterval > 600)) {
          return json(res, { success: false, message: "wsReconnectInterval must be between 5 and 600 seconds" }, 400);
        }
        if (newConnectionTimeout !== undefined && (typeof newConnectionTimeout !== "number" || newConnectionTimeout < 5 || newConnectionTimeout > 120)) {
          return json(res, { success: false, message: "connectionTimeout must be between 5 and 120 seconds" }, 400);
        }
        if (newTempNumberExpiry !== undefined && (typeof newTempNumberExpiry !== "number" || newTempNumberExpiry < 60 || newTempNumberExpiry > 3600)) {
          return json(res, { success: false, message: "tempNumberExpiry must be between 60 and 3600 seconds" }, 400);
        }
        if (newMaxFileSize !== undefined && (typeof newMaxFileSize !== "number" || newMaxFileSize < 1024 || newMaxFileSize > 1073741824)) {
          return json(res, { success: false, message: "maxFileSize must be between 1KB and 1GB" }, 400);
        }
        if (newLogLevel !== undefined && !["debug", "info", "warn", "error", "none"].includes(newLogLevel)) {
          return json(res, { success: false, message: "logLevel must be one of: debug, info, warn, error, none" }, 400);
        }
        if (newHandshakeTimeout !== undefined && (typeof newHandshakeTimeout !== "number" || newHandshakeTimeout < 10 || newHandshakeTimeout > 300)) {
          return json(res, { success: false, message: "handshakeTimeout must be between 10 and 300 seconds" }, 400);
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
        if (newWsReconnectInterval !== undefined) aicqConfig.wsReconnectInterval = newWsReconnectInterval;
        if (newWsAutoReconnect !== undefined) aicqConfig.wsAutoReconnect = newWsAutoReconnect;
        if (newConnectionTimeout !== undefined) aicqConfig.connectionTimeout = newConnectionTimeout;
        if (newTempNumberExpiry !== undefined) aicqConfig.tempNumberExpiry = newTempNumberExpiry;
        if (newMaxFileSize !== undefined) aicqConfig.maxFileSize = newMaxFileSize;
        if (newEnableFileTransfer !== undefined) aicqConfig.enableFileTransfer = newEnableFileTransfer;
        if (newAllowedFileTypes !== undefined) aicqConfig.allowedFileTypes = newAllowedFileTypes;
        if (newLogLevel !== undefined) aicqConfig.logLevel = newLogLevel;
        if (newEnableP2P !== undefined) aicqConfig.enableP2P = newEnableP2P;
        if (newHandshakeTimeout !== undefined) aicqConfig.handshakeTimeout = newHandshakeTimeout;
        if (newDefaultPermissions !== undefined) aicqConfig.defaultPermissions = newDefaultPermissions;

        const written = writeConfig(config);
        if (!written) {
          return json(res, { success: false, message: "Failed to write config file" }, 500);
        }

        logger.info("[API] Settings saved: " + JSON.stringify(body));
        return json(res, { success: true, message: "Settings saved successfully" });
      }

      // ── POST /api/settings/test-connection ──
      if (apiPath === "/settings/test-connection" && method === "POST") {
        const body = await readBody(req);
        const testUrl = (body.serverUrl as string) || serverUrl;
        const startTime = Date.now();

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (body.timeout as number) || 10000);

          const resp = await fetch(testUrl + "/api/v1/health", {
            method: "GET",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
          });
          clearTimeout(timeout);

          const latency = Date.now() - startTime;
          let serverInfo: Record<string, unknown> = {};
          try { serverInfo = await resp.json() as Record<string, unknown>; } catch { /* ignore */ }

          if (resp.ok) {
            return json(res, {
              success: true,
              status: "ok",
              statusCode: resp.status,
              latency,
              serverUrl: testUrl,
              serverInfo,
            });
          } else {
            return json(res, {
              success: false,
              status: "error",
              statusCode: resp.status,
              latency,
              serverUrl: testUrl,
              message: "Server returned HTTP " + resp.status,
            });
          }
        } catch (err: unknown) {
          const latency = Date.now() - startTime;
          const msg = err instanceof Error ? err.message : String(err);
          const isTimeout = msg.includes("abort") || msg.includes("timeout");
          return json(res, {
            success: false,
            status: isTimeout ? "timeout" : "unreachable",
            latency,
            serverUrl: testUrl,
            message: isTimeout ? "Connection timed out after " + latency + "ms" : "Cannot reach server: " + msg,
          });
        }
      }

      // ── POST /api/settings/reset-identity ──
      if (apiPath === "/settings/reset-identity" && method === "POST") {
        const body = await readBody(req);
        const confirmReset = body.confirm as boolean;

        if (!confirmReset) {
          return json(res, { success: false, message: "Confirmation required. Set { confirm: true } to proceed." }, 400);
        }

        try {
          // Clear local identity data
          identityService.cleanup();
          chatChannel?.cleanup?.();
          serverClient.disconnectWebSocket();

          // Clear store data
          store.friends.clear();
          store.sessions.clear();
          store.pendingHandshakes.clear();
          store.pendingRequests = [];
          store.tempNumbers = [];
          store.save();

          logger.warn("[API] Agent identity reset by user via settings UI");
          return json(res, {
            success: true,
            message: "Identity reset successfully. All friends, sessions, and keys have been deleted. Restart the plugin to generate a new identity.",
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("[API] Identity reset failed: " + msg);
          return json(res, { success: false, message: "Failed to reset identity: " + msg }, 500);
        }
      }

      // ── GET /api/settings/export ──
      if (apiPath === "/settings/export" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { error: "No config file found" }, 400);

        const pluginsSection = result.config.plugins as Record<string, unknown> | undefined;
        const pluginSection = pluginsSection?.["aicq-chat"] as Record<string, unknown> | undefined;

        return json(res, {
          exportDate: new Date().toISOString(),
          pluginVersion: "1.2.0",
          settings: pluginSection || {},
          fullConfig: result.config,
        });
      }

      // ── POST /api/settings/import ──
      if (apiPath === "/settings/import" && method === "POST") {
        const body = await readBody(req);
        const settings = body.settings as Record<string, unknown> | undefined;
        const merge = body.merge as boolean | undefined;

        if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
          return json(res, { success: false, message: "Invalid settings object. Provide { settings: {...} }" }, 400);
        }

        const result = readConfig();
        if (!result) {
          return json(res, { success: false, message: "No config file found" }, 400);
        }

        const config = result.config;
        if (!config.plugins || typeof config.plugins !== "object") {
          config.plugins = {};
        }
        const plugins = config.plugins as Record<string, unknown>;
        if (!plugins["aicq-chat"] || typeof plugins["aicq-chat"] !== "object" || !merge) {
          plugins["aicq-chat"] = {};
        }
        const aicqConfig = plugins["aicq-chat"] as Record<string, unknown>;

        // Merge settings
        Object.assign(aicqConfig, settings);

        const written = writeConfig(config);
        if (!written) {
          return json(res, { success: false, message: "Failed to write config" }, 500);
        }

        logger.info("[API] Settings imported: " + Object.keys(settings).join(", "));
        return json(res, { success: true, message: "Settings imported successfully" });
      }

      // ── POST /api/settings/section ── (save a single settings section)
      if (apiPath === "/settings/section" && method === "POST") {
        const body = await readBody(req);
        const section = body.section as string;
        const data = body.data as Record<string, unknown>;

        if (!section || !data) {
          return json(res, { success: false, message: "Missing section or data" }, 400);
        }

        const result = readConfig();
        if (!result) {
          return json(res, { success: false, message: "No config file found" }, 400);
        }

        const config = result.config;
        if (!config.plugins || typeof config.plugins !== "object") {
          config.plugins = {};
        }
        const plugins = config.plugins as Record<string, unknown>;
        if (!plugins["aicq-chat"] || typeof plugins["aicq-chat"] !== "object") {
          plugins["aicq-chat"] = {};
        }
        const aicqConfig = plugins["aicq-chat"] as Record<string, unknown>;

        // Write the section data
        for (const [key, value] of Object.entries(data)) {
          aicqConfig[key] = value;
        }

        const written = writeConfig(config);
        if (!written) {
          return json(res, { success: false, message: "Failed to write config" }, 500);
        }

        logger.info("[API] Settings section saved: " + section);
        return json(res, { success: true, message: "Section \"" + section + "\" saved" });
      }

      // ── GET /api/config/raw ──
      if (apiPath === "/config/raw" && method === "GET") {
        const result = readConfig();
        if (!result) return json(res, { error: "No config file found" }, 404);
        const raw = fs.readFileSync(result.configPath, "utf-8");
        return json(res, {
          configPath: result.configPath,
          configSource: path.basename(result.configPath),
          rawJson: raw,
          config: result.config,
        });
      }

      // ── PUT /api/config/raw ──
      if (apiPath === "/config/raw" && method === "PUT") {
        const body = await readBody(req);
        const rawJson = body.rawJson as string;
        if (!rawJson) return json(res, { success: false, message: "Missing rawJson" }, 400);
        let parsed: unknown;
        try { parsed = JSON.parse(rawJson); } catch (e) {
          return json(res, { success: false, message: "Invalid JSON: " + (e instanceof Error ? e.message : String(e)) }, 400);
        }
        const configPath = findConfigPath();
        if (!configPath) return json(res, { success: false, message: "No config file found" }, 400);
        try {
          fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
          logger.info("[API] Config file updated via raw JSON editor");
          return json(res, { success: true, message: "Config file saved", configPath });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json(res, { success: false, message: "Write failed: " + msg }, 500);
        }
      }

      // ── GET /api/mgmt-url ──
      if (apiPath === "/mgmt-url" && method === "GET") {
        // Determine the management UI URL
        const host = (req.headers?.host as string) || "127.0.0.1:6109";
        const protocol = (req.headers?.["x-forwarded-proto"] as string) || "http";
        const mgmtUrl = protocol + "://" + host;
        return json(res, {
          mgmtUrl,
          standaloneUrl: "http://127.0.0.1:6109",
          gatewayPath: "/plugins/aicq-chat/",
        });
      }

      // ── POST /api/agents ──
      if (apiPath === "/agents" && method === "POST") {
        const body = await readBody(req);
        const agent = body.agent as Record<string, unknown> | undefined;
        if (!agent || typeof agent !== "object") {
          return json(res, { success: false, message: "Missing agent object" }, 400);
        }
        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);
        const config = result.config;
        // If config.agent exists as a single object, convert it to an agents array first
        if (!Array.isArray(config.agents)) {
          config.agents = [];
          const singleAgent = config.agent;
          if (typeof singleAgent === "object" && singleAgent !== null && !Array.isArray(singleAgent)) {
            (config.agents as Array<unknown>).push(singleAgent);
            delete config.agent;
          }
        }
        (config.agents as Array<unknown>).push(agent);
        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config" }, 500);
        logger.info("[API] Agent added via UI");
        return json(res, { success: true, message: "Agent added", index: (config.agents as unknown[]).length - 1 });
      }

      // ── PUT /api/agents/:identifier (supports index or provider:model format) ──
      if (apiPath.startsWith("/agents/") && method === "PUT") {
        const identifier = decodeURIComponent(apiPath.slice("/agents/".length));
        const body = await readBody(req);
        const updates = body.agent as Record<string, unknown> | undefined;
        if (!updates || typeof updates !== "object") {
          return json(res, { success: false, message: "Missing agent object" }, 400);
        }
        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);
        const config = result.config;

        // Support provider-model path format: e.g. "provider:modelscope:2"
        const providerModelMatch = identifier.match(/^provider:([^:]+):(\d+)$/);
        if (providerModelMatch) {
          const providerId = providerModelMatch[1];
          const modelIdx = parseInt(providerModelMatch[2], 10);
          const modelsSection = config.models as Record<string, unknown> | undefined;
          const providersObj = modelsSection?.providers as Record<string, unknown> | undefined;
          const provConfig = providersObj?.[providerId] as Record<string, unknown> | undefined;
          const modelsArr = provConfig?.models as Array<Record<string, unknown>> | undefined;
          if (!modelsArr || modelIdx >= modelsArr.length) {
            return json(res, { success: false, message: "Provider model index out of range" }, 400);
          }
          // Merge updates into the model entry
          const modelEntry = modelsArr[modelIdx];
          if (updates.name) modelEntry.name = updates.name;
          if (updates.id) modelEntry.id = updates.id;
          if (updates.provider) modelEntry.provider = updates.provider;
          // Copy any other fields
          for (const [k, v] of Object.entries(updates)) {
            if (!["name", "id", "provider", "_source", "_providerId", "_modelIndex", "_configPath", "isDefault"].includes(k)) {
              modelEntry[k] = v;
            }
          }
          const written = writeConfig(config);
          if (!written) return json(res, { success: false, message: "Failed to write config" }, 500);
          logger.info("[API] Provider model updated: " + providerId + ".models[" + modelIdx + "]");
          return json(res, { success: true, message: "Model updated in " + providerId });
        }

        // Fallback: numeric index for config.agents array
        const idx = parseInt(identifier, 10);
        if (isNaN(idx) || idx < 0) return json(res, { success: false, message: "Invalid agent identifier" }, 400);

        if (!Array.isArray(config.agents)) {
          return json(res, { success: false, message: "No agents array in config" }, 400);
        }
        const agentsArr = config.agents as Array<Record<string, unknown>>;
        if (idx >= agentsArr.length) {
          return json(res, { success: false, message: "Agent index out of range" }, 400);
        }
        // Merge updates
        Object.assign(agentsArr[idx], updates);
        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config" }, 500);
        logger.info("[API] Agent updated at index " + idx);
        return json(res, { success: true, message: "Agent updated" });
      }

      // ── POST /api/config/switch ──
      if (apiPath === "/config/switch" && method === "POST") {
        const body = await readBody(req);
        const target = body.target as string; // "openclaw" or "stableclaw"
        if (target !== "openclaw" && target !== "stableclaw") {
          return json(res, { success: false, message: "target must be 'openclaw' or 'stableclaw'" }, 400);
        }
        const targetFile = target + ".json";
        const currentResult = readConfig();
        if (!currentResult) return json(res, { success: false, message: "No current config file found" }, 400);
        const currentBasename = path.basename(currentResult.configPath);
        if (currentBasename === targetFile) {
          return json(res, { success: false, message: "Already using " + targetFile }, 400);
        }
        const targetPath = path.join(path.dirname(currentResult.configPath), targetFile);
        // Copy current to target (don't delete original)
        try {
          const raw = fs.readFileSync(currentResult.configPath, "utf-8");
          fs.writeFileSync(targetPath, raw, "utf-8");
          logger.info("[API] Config copied to " + targetFile);
          return json(res, { success: true, message: "Config copied to " + targetFile, newPath: targetPath });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json(res, { success: false, message: "Failed: " + msg }, 500);
        }
      }

      // ── GET /api/config-file/raw ──
      if (apiPath === "/config-file/raw" && method === "GET") {
        const configPath = findConfigPath();
        if (!configPath) return json(res, { error: "No config file found" }, 404);
        const configName = path.basename(configPath);
        const raw = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw) as Record<string, unknown>;
        const stats = fs.statSync(configPath);
        return json(res, {
          configPath,
          configName,
          raw,
          config,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      }

      // ── PUT /api/config-file/raw ──
      if (apiPath === "/config-file/raw" && method === "PUT") {
        const body = await readBody(req);
        const content = body.content as string;
        if (!content) return json(res, { success: false, message: "Missing content field" }, 400);
        let parsed: unknown;
        try { parsed = JSON.parse(content); } catch (e) {
          return json(res, { success: false, message: "Invalid JSON: " + (e instanceof Error ? e.message : String(e)) }, 400);
        }
        const configPath = findConfigPath();
        if (!configPath) return json(res, { success: false, message: "No config file found" }, 400);
        try {
          fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
          logger.info("[API] Config file written via /config-file/raw");
          return json(res, { success: true, message: "Config file saved", configPath });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json(res, { success: false, message: "Write failed: " + msg }, 500);
        }
      }

      // ── DELETE /api/models/:providerId ──
      if (apiPath.match(/^\/models\/[^/]+$/) && method === "DELETE") {
        const providerId = decodeURIComponent(apiPath.slice("/models/".length));

        const provider = MODEL_PROVIDERS.find((p) => p.id === providerId);
        if (!provider) return json(res, { success: false, message: "Unknown provider: " + providerId }, 400);

        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const config = result.config;

        // Clear in config.providers section
        const providersSection = config.providers as Record<string, unknown> | undefined;
        if (providersSection && typeof providersSection === "object" && providersSection[provider.configKey]) {
          providersSection[provider.configKey] = {};
        }

        // Clear top-level provider key
        if (config[provider.configKey]) {
          config[provider.configKey] = {};
        }

        const written = writeConfig(config);
        if (!written) return json(res, { success: false, message: "Failed to write config file" }, 500);

        logger.info("[API] Model config cleared for provider: " + providerId);
        return json(res, { success: true, message: "Model configuration cleared for " + provider.name });
      }

      // ── GET /api/version ──
      if (apiPath === "/version" && method === "GET") {
        return json(res, {
          version: "1.2.0",
          name: "AICQ Encrypted Chat",
        });
      }

      // ── POST /api/backup/local - Backup config to local file ──
      if (apiPath === "/backup/local" && method === "POST") {
        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        const configDir = path.dirname(result.configPath);
        const configBasename = path.basename(result.configPath, ".json");
        const now = new Date();
        const ts = now.getFullYear().toString() +
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getDate()).padStart(2, "0") + "-" +
          String(now.getHours()).padStart(2, "0") +
          String(now.getMinutes()).padStart(2, "0") +
          String(now.getSeconds()).padStart(2, "0");
        const backupFilename = configBasename + "-backup-" + ts + ".json";
        const backupPath = path.join(configDir, backupFilename);

        // Build backup payload including plugin store data if available
        const backupData: Record<string, unknown> = {
          ...result.config,
          _backupMeta: {
            source: result.configPath,
            timestamp: now.toISOString(),
            version: "1.2.0",
          },
        };

        // Try to include plugin store data
        const storePath = path.join(configDir, ".aicq-data", "plugin-store.json");
        try {
          if (fs.existsSync(storePath)) {
            const storeRaw = fs.readFileSync(storePath, "utf-8");
            backupData._pluginStore = JSON.parse(storeRaw);
            logger.info("[API] Plugin store data included in backup");
          }
        } catch {
          // Plugin store not available — non-fatal
        }

        try {
          const backupJson = JSON.stringify(backupData, null, 2);
          fs.writeFileSync(backupPath, backupJson, "utf-8");
          const stats = fs.statSync(backupPath);
          logger.info("[API] Local backup created: " + backupPath + " (" + stats.size + " bytes)");
          return json(res, {
            success: true,
            backupPath,
            backupSize: stats.size,
            timestamp: now.toISOString(),
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("[API] Backup failed: " + msg);
          return json(res, { success: false, message: "Failed to create backup: " + msg }, 500);
        }
      }

      // ── POST /api/backup/import - Import/restore config from a backup file ──
      if (apiPath === "/backup/import" && method === "POST") {
        const body = await readBody(req);
        const configPath = body.configPath as string;
        if (!configPath) return json(res, { success: false, message: "Missing configPath in request body" }, 400);

        // Validate the backup file exists
        if (!fs.existsSync(configPath)) {
          return json(res, { success: false, message: "Backup file not found: " + configPath }, 400);
        }

        // Read and validate the backup file
        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          const backupData = JSON.parse(raw) as Record<string, unknown>;

          // Basic structure validation — should have at least one known config key
          const knownKeys = ["agents", "bindings", "auth", "env", "models", "agent"];
          const hasValidStructure = knownKeys.some((k) => k in backupData) || ("_backupMeta" in backupData);
          if (!hasValidStructure) {
            return json(res, { success: false, message: "Invalid backup file: does not contain a recognized config structure" }, 400);
          }

          // Strip backup metadata before writing
          const cleanConfig = { ...backupData };
          delete cleanConfig._backupMeta;
          delete cleanConfig._pluginStore;

          // Write to the current config location
          const currentConfigPath = findConfigPath();
          if (!currentConfigPath) {
            return json(res, { success: false, message: "No active config file found to overwrite" }, 400);
          }

          fs.writeFileSync(currentConfigPath, JSON.stringify(cleanConfig, null, 2), "utf-8");
          logger.info("[API] Config restored from backup: " + configPath + " -> " + currentConfigPath);
          return json(res, { success: true, message: "Config restored from " + path.basename(configPath) });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("[API] Import failed: " + msg);
          return json(res, { success: false, message: "Failed to import backup: " + msg }, 500);
        }
      }

      // ── POST /api/backup/list - List available local backups ──
      if (apiPath === "/backup/list" && method === "POST") {
        const configPath = findConfigPath();
        if (!configPath) return json(res, { backups: [], message: "No config file found" });

        const configDir = path.dirname(configPath);
        const backups: Array<{ filename: string; path: string; size: number; modified: string }> = [];

        try {
          const files = fs.readdirSync(configDir);
          for (const file of files) {
            if (file.match(/-backup-\d{8}-\d{6}\.json$/)) {
              const filePath = path.join(configDir, file);
              try {
                const stats = fs.statSync(filePath);
                backups.push({
                  filename: file,
                  path: filePath,
                  size: stats.size,
                  modified: stats.mtime.toISOString(),
                });
              } catch {
                // Skip files we can't stat
              }
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn("[API] Failed to list backups: " + msg);
        }

        // Sort newest first
        backups.sort((a, b) => b.modified.localeCompare(a.modified));
        logger.info("[API] Listed " + backups.length + " local backup(s)");
        return json(res, { backups });
      }

      // ── POST /api/backup/export - Export config as downloadable JSON ──
      if (apiPath === "/backup/export" && method === "POST") {
        const result = readConfig();
        if (!result) return json(res, { success: false, message: "No config file found" }, 400);

        try {
          const configJson = JSON.stringify(result.config, null, 2);
          const now = new Date();
          const ts = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") + "-" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0");
          const downloadFilename = "aicq-config-backup-" + ts + ".json";

          corsHeaders(res);
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Disposition", "attachment; filename=\"" + downloadFilename + "\"");
          res.end(configJson);
          logger.info("[API] Config exported as download: " + downloadFilename);
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("[API] Export failed: " + msg);
          return json(res, { success: false, message: "Export failed: " + msg }, 500);
        }
      }

      // ── POST /api/backup/google-drive-auth - Initiate Google OAuth ──
      if (apiPath === "/backup/google-drive-auth" && method === "POST") {
        const redirectUri = encodeURIComponent("http://localhost:3000/api/backup/google-drive/callback");
        const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile");
        const authUrl = "https://accounts.google.com/o/oauth2/v2/auth" +
          "?client_id=YOUR_CLIENT_ID" +
          "&redirect_uri=" + redirectUri +
          "&response_type=code" +
          "&scope=" + scope +
          "&access_type=offline" +
          "&prompt=consent";

        logger.info("[API] Google Drive OAuth initiated");
        return json(res, {
          requiresAuth: true,
          authUrl,
          instructions: "Google Drive backup requires OAuth2 setup. Replace YOUR_CLIENT_ID with your Google API client ID. " +
            "Create credentials at https://console.cloud.google.com/apis/credentials and enable the Google Drive API.",
        });
      }

      // ── POST /api/backup/google-drive - Upload to Google Drive ──
      if (apiPath === "/backup/google-drive" && method === "POST") {
        logger.info("[API] Google Drive backup requested (not yet configured)");
        return json(res, {
          error: "Google Drive backup requires OAuth2 setup. Please configure Google API credentials first.",
          setup: "See https://console.cloud.google.com/apis/credentials",
        }, 501);
      }

      // ── POST /api/backup/aicq-cloud - Backup to AICQ cloud ──
      if (apiPath === "/backup/aicq-cloud" && method === "POST") {
        logger.info("[API] AICQ cloud backup requested (not yet available)");
        return json(res, {
          error: "AICQ cloud backup is not yet available. Please register an AICQ account first.",
          registerUrl: "https://aicq.online/register",
        }, 501);
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
