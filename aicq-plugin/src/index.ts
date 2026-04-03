/**
 * AICQ OpenClaw Plugin — Main Entry Point
 *
 * End-to-end encrypted chat plugin for OpenClaw agent runtime.
 * Registers tools (chat-friend, chat-send, chat-export-key) and
 * a service (identity-service) for managing encrypted P2P communication.
 *
 * Encryption: Ed25519 identity + X25519 key exchange + AES-256-GCM
 * Handshake: Noise-XK pattern (3-way)
 * P2P: WebRTC after ECDH, server as signaling relay only
 */

import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { loadConfig } from "./config.js";
import { PluginStore } from "./store.js";
import { IdentityService } from "./services/identityService.js";
import { ServerClient } from "./services/serverClient.js";
import { HandshakeManager } from "./handshake/handshakeManager.js";
import { P2PConnectionManager } from "./p2p/connectionManager.js";
import { FileTransferManager } from "./fileTransfer/transferManager.js";
import { ChatFriendTool } from "./tools/chatFriend.js";
import { ChatSendTool } from "./tools/chatSend.js";
import { ChatExportKeyTool } from "./tools/chatExportKey.js";
import { decodeBase64 } from "@aicq/crypto";
import type { Logger } from "./types.js";

// ----------------------------------------------------------------
//  JSON Schema definitions for tools
// ----------------------------------------------------------------

const CHAT_FRIEND_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["add", "list", "remove", "request-temp-number", "revoke-temp-number"],
      description: "Action to perform on friends",
    },
    target: {
      type: "string",
      description: "6-digit temp number or friend ID (for add/remove)",
    },
    limit: {
      type: "number",
      description: "Max friends to return in list (default 50)",
    },
  },
  required: ["action"],
};

const CHAT_SEND_PARAMS = {
  type: "object",
  properties: {
    target: {
      type: "string",
      description: "Friend ID to send the message to",
    },
    message: {
      type: "string",
      description: "Message content to send",
    },
    type: {
      type: "string",
      enum: ["text", "file-info"],
      default: "text",
      description: "Message type",
    },
    fileInfo: {
      type: "object",
      description: "File metadata for type=file-info: { fileName, fileSize, fileHash, chunks }",
    },
  },
  required: ["target", "message"],
};

const CHAT_EXPORT_KEY_PARAMS = {
  type: "object",
  properties: {
    password: {
      type: "string",
      description: "Password to protect the exported private key QR code",
    },
  },
  required: ["password"],
};

// ----------------------------------------------------------------
//  Plugin entry point using OpenClaw SDK
// ----------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plugin = definePluginEntry({
  id: "aicq-chat",
  name: "AICQ Encrypted Chat",
  description:
    "End-to-end encrypted P2P chat between AI agents using Ed25519/X25519/AES-256-GCM with Noise-XK handshake. Supports friend management, text messaging, file transfer with resume, and key export via QR code.",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(api: any) {
    // ----------------------------------------------------------
    //  1. Setup logger
    // ----------------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ocLog: any = api.logger ?? console;
    const logger: Logger = {
      info: (msg, ...args) => ocLog.info?.(msg, ...args) ?? console.log("[aicq-chat]", msg, ...args),
      warn: (msg, ...args) => ocLog.warn?.(msg, ...args) ?? console.warn("[aicq-chat]", msg, ...args),
      error: (msg, ...args) => ocLog.error?.(msg, ...args) ?? console.error("[aicq-chat]", msg, ...args),
      debug: (msg, ...args) => ocLog.debug?.(msg, ...args) ?? console.log("[aicq-chat DEBUG]", msg, ...args),
    };

    logger.info("═══════════════════════════════════════════════");
    logger.info("  AICQ Encrypted Chat Plugin v1.0.0");
    logger.info("═══════════════════════════════════════════════");

    // ----------------------------------------------------------
    //  2. Load config
    // ----------------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginCfg: any = api.pluginConfig ?? {};
    const config = loadConfig({
      serverUrl: pluginCfg.serverUrl as string | undefined,
      agentId: pluginCfg.agentId as string | undefined,
      maxFriends: pluginCfg.maxFriends as number | undefined,
      autoAcceptFriends: pluginCfg.autoAcceptFriends as boolean | undefined,
    });

    // ----------------------------------------------------------
    //  3. Initialize store + identity + server + P2P
    // ----------------------------------------------------------
    const store = new PluginStore();
    const dataDir = path.join(process.cwd(), ".aicq-data");
    store.setDataDir(dataDir);
    store.load();
    logger.info("[Init] Store ready — " + dataDir);

    const identityService = new IdentityService(store, logger);
    identityService.initialize(config.agentId);
    logger.info("[Init] Agent: " + identityService.getAgentId());
    logger.info("[Init] Fingerprint: " + identityService.getPublicKeyFingerprint());

    const serverClient = new ServerClient(config.serverUrl, store, logger);
    const p2pManager = new P2PConnectionManager(serverClient, logger);
    p2pManager.setupWsHandlers();

    const handshakeManager = new HandshakeManager(store, serverClient, config, logger);
    handshakeManager.setupWsHandlers();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileTransferManager = new FileTransferManager(store, serverClient, p2pManager, null as any, logger);

    // ----------------------------------------------------------
    //  4. Connect WebSocket to AICQ server
    // ----------------------------------------------------------
    try {
      serverClient.connectWebSocket();
    } catch (e) {
      logger.warn("[Init] WebSocket connect failed (will retry): " + (e instanceof Error ? e.message : e));
    }

    // Handle incoming relay messages
    serverClient.onWsMessage("relay", (data: unknown) => {
      const msg = data as Record<string, unknown>;
      const senderId = msg?.senderId as string;
      const payload = msg?.payload as Record<string, unknown>;
      if (!payload) return;

      if (payload.channel === "encrypted-chat" && payload.data) {
        try {
          const encryptedData = Buffer.from(decodeBase64(payload.data as string));
          logger.debug("[Relay] Encrypted msg from " + senderId);
        } catch (err) {
          logger.error("[Relay] Decode failed: " + (err instanceof Error ? err.message : err));
        }
      }
    });

    // Heartbeat + cleanup
    setInterval(() => {
      if (!serverClient.isConnected()) {
        logger.warn("[Heartbeat] Disconnected, retrying...");
        try { serverClient.connectWebSocket(); } catch (_e) { /* ignore */ }
      }
    }, 60_000);

    setInterval(() => store.cleanupExpiredTempNumbers(), 60_000);

    // ----------------------------------------------------------
    //  5. Register Tool: chat-friend
    // ----------------------------------------------------------
    api.registerTool(() => ({
      label: "AICQ Friend Manager",
      name: "chat-friend",
      description:
        "Manage encrypted chat friends: add friend by 6-digit temp number, list all friends, remove a friend, request a temporary number for sharing, or revoke a temp number. Maximum 200 friends per agent.",
      parameters: CHAT_FRIEND_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: () => async (_toolCallId: string, params: any) => {
        const tool = new ChatFriendTool(store, serverClient, handshakeManager, identityService, config, logger);
        const action = params.action as string;
        if (!action) return { error: "Missing 'action' parameter" };
        return tool.handleAction(action, params);
      },
    }));

    // ----------------------------------------------------------
    //  6. Register Tool: chat-send
    // ----------------------------------------------------------
    api.registerTool(() => ({
      label: "AICQ Send Message",
      name: "chat-send",
      description:
        "Send an end-to-end encrypted message to a friend. Supports text messages and file-info metadata for initiating file transfers. Messages are encrypted with AES-256-GCM using session keys established via Noise-XK handshake.",
      parameters: CHAT_SEND_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: () => async (_toolCallId: string, params: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tool = new ChatSendTool(store, null as any, handshakeManager, logger);
        return tool.handle(params);
      },
    }));

    // ----------------------------------------------------------
    //  7. Register Tool: chat-export-key
    // ----------------------------------------------------------
    api.registerTool(() => ({
      label: "AICQ Export Identity Key",
      name: "chat-export-key",
      description:
        "Export the agent's Ed25519 private key as a password-protected QR code. The QR code expires in 60 seconds. This allows a human to take over the agent's chat identity on another device.",
      parameters: CHAT_EXPORT_KEY_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: () => async (_toolCallId: string, params: any) => {
        const tool = new ChatExportKeyTool(identityService, logger);
        return tool.handle(params);
      },
    }));

    // ----------------------------------------------------------
    //  8. Register Service: identity-service
    // ----------------------------------------------------------
    if (api.registerService) {
      api.registerService({
        id: "identity-service",
        start: async () => { logger.info("[Service] identity-service started"); },
        stop: async () => { logger.info("[Service] identity-service stopped"); },
      });
    }

    logger.info("═══════════════════════════════════════════════");
    logger.info("  AICQ Plugin activated successfully!");
    logger.info("═══════════════════════════════════════════════");
  },
});

export default plugin;
