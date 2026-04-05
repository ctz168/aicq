/**
 * AICQ OpenClaw Plugin — Main Entry Point
 *
 * End-to-end encrypted chat plugin for OpenClaw agent runtime.
 * Registers tools (chat-friend, chat-send, chat-export-key) and
 * a service (identity-service) for managing encrypted P2P communication.
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
import { EncryptedChatChannel } from "./channels/encryptedChat.js";
import { ChatSendTool } from "./tools/chatSend.js";
import { ChatExportKeyTool } from "./tools/chatExportKey.js";
import { BeforeToolCallHook } from "./hooks/beforeToolCall.js";
import { MessageSendingHook } from "./hooks/messageSending.js";
import type { Logger } from "./types.js";
import { getManagementHTML } from "./ui/management-page.js";
import { createManagementHandler } from "./ui/management-routes.js";

// JSON Schema definitions for tools
const CHAT_FRIEND_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["add", "list", "remove", "request-temp-number", "revoke-temp-number"],
      description: "Action to perform on friends",
    },
    target: { type: "string", description: "6-digit temp number or friend ID" },
    limit: { type: "number", description: "Max friends to return" },
  },
  required: ["action"],
};

const CHAT_SEND_PARAMS = {
  type: "object",
  properties: {
    target: { type: "string", description: "Friend ID to send the message to" },
    message: { type: "string", description: "Message content" },
    type: { type: "string", enum: ["text", "file-info"], default: "text" },
    fileInfo: { type: "object", description: "File metadata for file-info type" },
  },
  required: ["target", "message"],
};

const CHAT_EXPORT_KEY_PARAMS = {
  type: "object",
  properties: {
    password: { type: "string", description: "Password for key export QR" },
  },
  required: ["password"],
};

// Plugin entry point using OpenClaw SDK
const plugin = definePluginEntry({
  id: "aicq-chat",
  name: "AICQ Encrypted Chat",
  description: "End-to-end encrypted P2P chat between AI agents using Ed25519/X25519/AES-256-GCM with Noise-XK handshake.",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(api: any) {
    // Logger
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

    // Config
    const pluginCfg: any = api.pluginConfig ?? {};
    const config = loadConfig({
      serverUrl: pluginCfg.serverUrl as string | undefined,
      agentId: pluginCfg.agentId as string | undefined,
      maxFriends: pluginCfg.maxFriends as number | undefined,
      autoAcceptFriends: pluginCfg.autoAcceptFriends as boolean | undefined,
    });

    // Store + Identity + Server + P2P
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

    // Encrypted chat channel — handles encrypted message send/receive
    const chatChannel = new EncryptedChatChannel(
      store, handshakeManager, p2pManager, serverClient, logger, dataDir,
    );

    // File transfer manager with chat channel integration
    const fileTransferManager = new FileTransferManager(
      store, serverClient, p2pManager,
      { registerFileBuffer: (id: string, buf: any) => chatChannel.registerFileBuffer(id, buf),
        unregisterFileBuffer: (id: string) => chatChannel.removeFileBuffer(id) } as any,
      logger
    );

    // ── Tool handler instances ──────────────────────────────────
    const chatSendTool = new ChatSendTool(store, chatChannel, handshakeManager, logger);
    const chatExportKeyTool = new ChatExportKeyTool(identityService, logger);

    // ── Hook instances ──────────────────────────────────────────
    const beforeToolCallHook = new BeforeToolCallHook(store, config, chatExportKeyTool, logger);
    const messageSendingHook = new MessageSendingHook(store, handshakeManager, logger);

    // Register hooks with the API if supported
    if (api.registerHook) {
      api.registerHook("before_tool_call", {
        execute: async (data: unknown, metadata?: Record<string, unknown>) => {
          const toolCall = data as { toolName?: string; params?: Record<string, unknown> };
          if (!toolCall?.toolName) return { allowed: true };
          const result = beforeToolCallHook.check(toolCall.toolName, toolCall.params || {});
          if (!result.allowed) {
            throw new Error(result.reason || "Tool call blocked by permission check");
          }
          return { allowed: true };
        },
      }, { name: "aicq-before-tool-call" });
      logger.info("[Init] Registered before_tool_call hook");
    }

    if (api.registerHook) {
      api.registerHook("message_sending", {
        execute: async (data: unknown, metadata?: Record<string, unknown>) => {
          return messageSendingHook.intercept(data, metadata);
        },
      }, { name: "aicq-message-encrypt" });
      logger.info("[Init] Registered message_sending hook");
    }

    // Serializable values for tool execute (no WebSocket objects!)
    const serverUrl = config.serverUrl;
    const aicqAgentId = identityService.getAgentId();

    // WebSocket to AICQ server
    try { serverClient.connectWebSocket(); } catch (e) {
      logger.warn("[Init] WS connect failed: " + (e instanceof Error ? e.message : e));
    }
    serverClient.onWsMessage("relay", (data: unknown) => {
      const msg = data as Record<string, unknown>;
      if (!msg?.payload) return;
      const payload = msg.payload as Record<string, unknown>;
      if (payload.channel === "encrypted-chat" && payload.data) {
        try {
          chatChannel.onMessage(Buffer.from(payload.data as string, "base64"), msg.fromId as string);
        } catch (_e) { /* ignore decode/decrypt errors */ }
      }
    });
    setInterval(() => {
      if (!serverClient.isConnected()) { try { serverClient.connectWebSocket(); } catch (_e) { /* ignore */ } }
    }, 60_000);
    setInterval(() => store.cleanupExpiredTempNumbers(), 60_000);

    // ── Register Tool: chat-friend ─────────────────────────────────
    api.registerTool({
      label: "AICQ Friend Manager",
      name: "chat-friend",
      description: "Manage encrypted chat friends: add/list/remove friends, request/revoke temp numbers. Max 200 friends.",
      parameters: CHAT_FRIEND_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async execute(toolCallId: string, params: any) {
        const action = (params?.action || "") as string;
        if (!action) return { error: "Missing action parameter" };

        // Permission check via hook
        const permResult = beforeToolCallHook.check("chat-friend", params || {});
        if (!permResult.allowed) {
          return { error: permResult.reason };
        }

        try {
          switch (action) {
            case "request-temp-number": {
              const resp = await fetch(serverUrl + "/api/v1/temp-number/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId: aicqAgentId }),
              });
              if (!resp.ok) return { error: "Server error: " + await resp.text() };
              const data = await resp.json() as Record<string, unknown>;
              return { success: true, tempNumber: data.number, message: "Temp number: " + data.number };
            }
            case "list": {
              const resp = await fetch(serverUrl + "/api/v1/friends?nodeId=" + aicqAgentId);
              if (!resp.ok) return { error: "Server error: " + await resp.text() };
              const data = await resp.json() as Record<string, unknown>;
              return { total: (data.count as number) || 0, friends: data.friends || [] };
            }
            case "add": {
              const target = params?.target;
              if (!target) return { error: "Missing target (friend's temp number or ID)" };
              // Resolve temp number if it's a 6-digit number
              const isTempNumber = /^\d{6}$/.test(target);
              let friendId = target;
              if (isTempNumber) {
                const resolveResp = await fetch(serverUrl + "/api/v1/temp-number/" + target);
                if (!resolveResp.ok) return { error: "Temp number not found or expired" };
                const resolveData = await resolveResp.json() as Record<string, unknown>;
                friendId = resolveData.nodeId as string;
              }
              // Initiate handshake
              const hsResp = await fetch(serverUrl + "/api/v1/handshake/initiate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requesterId: aicqAgentId, targetTempNumber: target }),
              });
              if (!hsResp.ok) return { error: "Handshake failed: " + await hsResp.text() };
              const hsData = await hsResp.json() as Record<string, unknown>;
              return { success: true, message: "Friend request sent to " + friendId, sessionId: hsData.sessionId, targetNodeId: friendId };
            }
            case "remove": {
              const target = params?.target;
              if (!target) return { error: "Missing target (friend ID to remove)" };
              const rmResp = await fetch(serverUrl + "/api/v1/friends/" + target, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId: aicqAgentId }),
              });
              if (!rmResp.ok) return { error: "Failed to remove friend: " + await rmResp.text() };
              return { success: true, message: "Friend " + target + " removed" };
            }
            case "revoke-temp-number": {
              const resp = await fetch(serverUrl + "/api/v1/temp-number/" + aicqAgentId, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId: aicqAgentId }),
              });
              if (!resp.ok) return { error: "Failed to revoke temp number" };
              return { success: true, message: "Temp number revoked" };
            }
            default:
              return { error: "Unknown action: " + action };
          }
        } catch (err: any) {
          return { error: "Request failed: " + (err?.message || String(err)) };
        }
      },
    });

    // ── Register Tool: chat-send ───────────────────────────────────
    api.registerTool({
      label: "AICQ Send Message",
      name: "chat-send",
      description: "Send encrypted message to a friend via AES-256-GCM session keys.",
      parameters: CHAT_SEND_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async execute(toolCallId: string, params: any) {
        // Permission check via hook
        const permResult = beforeToolCallHook.check("chat-send", params || {});
        if (!permResult.allowed) {
          return { error: permResult.reason };
        }

        // Delegate to ChatSendTool which handles encryption via EncryptedChatChannel
        return chatSendTool.handle(params || {});
      },
    });

    // ── Register Tool: chat-export-key ────────────────────────────
    api.registerTool({
      label: "AICQ Export Identity Key",
      name: "chat-export-key",
      description: "Export Ed25519 private key as password-protected QR code (60s expiry).",
      parameters: CHAT_EXPORT_KEY_PARAMS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async execute(toolCallId: string, params: any) {
        // Permission check via hook (rate limiting)
        const permResult = beforeToolCallHook.check("chat-export-key", params || {});
        if (!permResult.allowed) {
          return { error: permResult.reason };
        }

        // Delegate to ChatExportKeyTool
        return chatExportKeyTool.handle(params || {});
      },
    });

    // ── Register Service ─────────────────────────────────────────
    if (api.registerService) {
      api.registerService({
        id: "identity-service",
        start: async () => {
          logger.info("[Service] identity-service starting...");
          // Register node on server
          try {
            const registered = await serverClient.registerNode(
              identityService.getAgentId(),
              identityService.getPublicKey(),
            );
            logger.info("[Service] Node registered on server: " + registered);
          } catch (e) {
            logger.warn("[Service] Node registration failed: " + (e instanceof Error ? e.message : e));
          }
          logger.info("[Service] identity-service started — Agent: " + identityService.getAgentId());
        },
        stop: async () => {
          logger.info("[Service] identity-service stopping...");
          identityService.cleanup();
          chatChannel.cleanup();
          serverClient.disconnectWebSocket();
          logger.info("[Service] identity-service stopped");
        },
      });
    }

    // ── Register Gateway Methods (Management UI) ──────────────
    if (api.registerGatewayMethod) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gwParams = (p: any): any => p || {};

      // 1. aicq.status — Overall plugin status
      api.registerGatewayMethod("aicq.status", async (params: unknown) => {
        try {
          return {
            connected: serverClient.isConnected(),
            agentId: aicqAgentId,
            fingerprint: identityService.getPublicKeyFingerprint(),
            friendCount: store.getFriendCount(),
            sessionCount: store.sessions.size,
            serverUrl,
          };
        } catch (err: any) {
          logger.error("[Gateway] aicq.status error: " + (err?.message || String(err)));
          return { error: "Failed to get status: " + (err?.message || String(err)) };
        }
      });

      // 2. aicq.friends.list — List all friends with details
      api.registerGatewayMethod("aicq.friends.list", async (params: unknown) => {
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends?nodeId=" + aicqAgentId);
          if (!resp.ok) return { error: "Server error: " + await resp.text() };
          const data = await resp.json() as Record<string, unknown>;
          const friends = (data.friends || []) as Array<Record<string, unknown>>;
          // Enrich with local store data (permissions, aiName, friendType)
          const enriched = friends.map((f) => {
            const localFriend = store.getFriend(f.nodeId as string);
            return {
              id: f.nodeId,
              publicKeyFingerprint: f.publicKeyFingerprint || (localFriend?.publicKeyFingerprint || ""),
              permissions: f.permissions || localFriend?.permissions || [],
              addedAt: f.addedAt || localFriend?.addedAt?.toISOString() || null,
              lastMessageAt: f.lastMessageAt || localFriend?.lastMessageAt?.toISOString() || null,
              friendType: f.friendType || localFriend?.friendType || null,
              aiName: f.aiName || localFriend?.aiName || null,
            };
          });
          return { friends: enriched };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.list error: " + (err?.message || String(err)));
          return { error: "Failed to list friends: " + (err?.message || String(err)) };
        }
      });

      // 3. aicq.friends.add — Add a friend
      api.registerGatewayMethod("aicq.friends.add", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const target = p.target as string;
          if (!target) return { success: false, message: "Missing target parameter (temp number or friend ID)" };

          // Resolve temp number if it's a 6-digit number
          const isTempNumber = /^\d{6}$/.test(target);
          let friendId = target;

          if (isTempNumber) {
            const resolveResp = await fetch(serverUrl + "/api/v1/temp-number/" + target);
            if (!resolveResp.ok) return { success: false, message: "Temp number not found or expired" };
            const resolveData = await resolveResp.json() as Record<string, unknown>;
            friendId = resolveData.nodeId as string;
          }

          // Initiate handshake
          const hsResp = await fetch(serverUrl + "/api/v1/handshake/initiate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: aicqAgentId, targetTempNumber: target }),
          });
          if (!hsResp.ok) return { success: false, message: "Handshake failed: " + await hsResp.text() };
          const hsData = await hsResp.json() as Record<string, unknown>;

          logger.info("[Gateway] Friend request sent to " + friendId);
          return {
            success: true,
            message: "Friend request sent to " + friendId,
            sessionId: hsData.sessionId,
            targetNodeId: friendId,
          };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.add error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to add friend: " + (err?.message || String(err)) };
        }
      });

      // 4. aicq.friends.remove — Remove a friend
      api.registerGatewayMethod("aicq.friends.remove", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const friendId = p.friendId as string;
          if (!friendId) return { success: false, message: "Missing friendId parameter" };

          const rmResp = await fetch(serverUrl + "/api/v1/friends/" + friendId, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId: aicqAgentId }),
          });
          if (!rmResp.ok) return { success: false, message: "Failed to remove friend: " + await rmResp.text() };

          // Also remove from local store
          store.removeFriend(friendId);

          logger.info("[Gateway] Friend " + friendId + " removed");
          return { success: true, message: "Friend " + friendId + " removed" };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.remove error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to remove friend: " + (err?.message || String(err)) };
        }
      });

      // 5. aicq.friends.permissions — Get friend permissions
      api.registerGatewayMethod("aicq.friends.permissions", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const friendId = p.friendId as string;
          if (!friendId) return { error: "Missing friendId parameter" };

          const resp = await fetch(serverUrl + "/api/v1/friends/" + friendId + "/permissions?nodeId=" + aicqAgentId);
          if (!resp.ok) return { error: "Server error: " + await resp.text() };
          const data = await resp.json() as Record<string, unknown>;

          return { permissions: data.permissions || [] };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.permissions error: " + (err?.message || String(err)));
          return { error: "Failed to get permissions: " + (err?.message || String(err)) };
        }
      });

      // 6. aicq.friends.setPermissions — Update friend permissions
      api.registerGatewayMethod("aicq.friends.setPermissions", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const friendId = p.friendId as string;
          const permissions = p.permissions as ('chat' | 'exec')[];
          if (!friendId) return { success: false, message: "Missing friendId parameter" };
          if (!permissions || !Array.isArray(permissions)) {
            return { success: false, message: "Missing or invalid permissions array" };
          }

          const resp = await fetch(serverUrl + "/api/v1/friends/" + friendId + "/permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId: aicqAgentId, permissions }),
          });
          if (!resp.ok) return { success: false, message: "Failed to update permissions: " + await resp.text() };

          // Update local store
          const localFriend = store.getFriend(friendId);
          if (localFriend) {
            localFriend.permissions = permissions;
            store.save();
          }

          logger.info("[Gateway] Permissions updated for friend " + friendId);
          return { success: true, message: "Permissions updated for friend " + friendId };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.setPermissions error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to set permissions: " + (err?.message || String(err)) };
        }
      });

      // 7. aicq.friends.requests — List pending friend requests
      api.registerGatewayMethod("aicq.friends.requests", async (params: unknown) => {
        try {
          const resp = await fetch(serverUrl + "/api/v1/friends/requests?nodeId=" + aicqAgentId);
          if (!resp.ok) return { error: "Server error: " + await resp.text() };
          const data = await resp.json() as Record<string, unknown>;

          return { requests: data.requests || [] };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.requests error: " + (err?.message || String(err)));
          return { error: "Failed to list requests: " + (err?.message || String(err)) };
        }
      });

      // 8. aicq.friends.acceptRequest — Accept a friend request
      api.registerGatewayMethod("aicq.friends.acceptRequest", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const requestId = p.requestId as string;
          if (!requestId) return { success: false, message: "Missing requestId parameter" };

          const body: Record<string, unknown> = {};
          if (p.permissions && Array.isArray(p.permissions)) {
            body.permissions = p.permissions;
          }

          const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!resp.ok) return { success: false, message: "Failed to accept request: " + await resp.text() };

          logger.info("[Gateway] Friend request " + requestId + " accepted");
          return { success: true, message: "Friend request accepted" };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.acceptRequest error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to accept request: " + (err?.message || String(err)) };
        }
      });

      // 9. aicq.friends.rejectRequest — Reject a friend request
      api.registerGatewayMethod("aicq.friends.rejectRequest", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const requestId = p.requestId as string;
          if (!requestId) return { success: false, message: "Missing requestId parameter" };

          const resp = await fetch(serverUrl + "/api/v1/friends/requests/" + requestId + "/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!resp.ok) return { success: false, message: "Failed to reject request: " + await resp.text() };

          logger.info("[Gateway] Friend request " + requestId + " rejected");
          return { success: true, message: "Friend request rejected" };
        } catch (err: any) {
          logger.error("[Gateway] aicq.friends.rejectRequest error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to reject request: " + (err?.message || String(err)) };
        }
      });

      // 10. aicq.sessions.list — List active encrypted sessions
      api.registerGatewayMethod("aicq.sessions.list", async (params: unknown) => {
        try {
          const sessions = Array.from(store.sessions.values()).map((s) => ({
            peerId: s.peerId,
            createdAt: s.createdAt.toISOString(),
            messageCount: s.messageCount,
          }));
          return { sessions };
        } catch (err: any) {
          logger.error("[Gateway] aicq.sessions.list error: " + (err?.message || String(err)));
          return { error: "Failed to list sessions: " + (err?.message || String(err)) };
        }
      });

      // 11. aicq.identity.info — Get AICQ agent identity info
      api.registerGatewayMethod("aicq.identity.info", async (params: unknown) => {
        try {
          return {
            agentId: aicqAgentId,
            publicKeyFingerprint: identityService.getPublicKeyFingerprint(),
            connected: serverClient.isConnected(),
            serverUrl,
          };
        } catch (err: any) {
          logger.error("[Gateway] aicq.identity.info error: " + (err?.message || String(err)));
          return { error: "Failed to get identity info: " + (err?.message || String(err)) };
        }
      });

      // 12. aicq.agent.create — Create a new agent identity
      api.registerGatewayMethod("aicq.agent.create", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const newAgentId = p.agentId as string | undefined;

          // Create new Ed25519 keys using IdentityService
          const newIdentityService = new IdentityService(store, logger);
          if (newAgentId) {
            newIdentityService.initialize(newAgentId);
          } else {
            newIdentityService.initialize();
          }

          const newId = newIdentityService.getAgentId();
          const newFingerprint = newIdentityService.getPublicKeyFingerprint();

          logger.info("[Gateway] New agent identity created: " + newId);
          return {
            agentId: newId,
            publicKeyFingerprint: newFingerprint,
          };
        } catch (err: any) {
          logger.error("[Gateway] aicq.agent.create error: " + (err?.message || String(err)));
          return { error: "Failed to create agent: " + (err?.message || String(err)) };
        }
      });

      // 13. aicq.agent.delete — Delete an agent identity
      api.registerGatewayMethod("aicq.agent.delete", async (params: unknown) => {
        try {
          const p = gwParams(params);
          const targetAgentId = p.agentId as string;
          if (!targetAgentId) return { success: false, message: "Missing agentId parameter" };

          if (targetAgentId !== aicqAgentId) {
            return { success: false, message: "Can only delete the current agent identity" };
          }

          // Clear local identity data
          identityService.cleanup();
          chatChannel.cleanup();
          serverClient.disconnectWebSocket();

          // Clear store data
          store.friends.clear();
          store.sessions.clear();
          store.pendingHandshakes.clear();
          store.pendingRequests = [];
          store.tempNumbers = [];
          store.save();

          logger.info("[Gateway] Agent identity deleted: " + targetAgentId);
          return { success: true, message: "Agent identity deleted. Restart the plugin to create a new identity." };
        } catch (err: any) {
          logger.error("[Gateway] aicq.agent.delete error: " + (err?.message || String(err)));
          return { success: false, message: "Failed to delete agent: " + (err?.message || String(err)) };
        }
      });

      logger.info("[Init] Registered 13 gateway methods for management UI");
    }

    // ── Register HTTP Routes (Management UI) ──────────────
    if (api.registerHttpRoute) {
      const managementHtml = getManagementHTML();
      const managementHandler = createManagementHandler({
        store,
        identityService,
        serverClient,
        serverUrl,
        aicqAgentId,
        logger,
        html: managementHtml,
      });
      api.registerHttpRoute({
        path: "/aicq-chat",
        auth: "gateway",
        match: "prefix",
        handler: managementHandler,
      });
      logger.info("[Init] Management UI registered at /plugins/aicq-chat/");
    }

    logger.info("═══════════════════════════════════════════════");
    logger.info("  AICQ Plugin activated successfully!");
    logger.info("  Management UI: /plugins/aicq-chat/");
    logger.info("═══════════════════════════════════════════════");
  },
});

export default plugin;
