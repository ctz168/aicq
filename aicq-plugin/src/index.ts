/**
 * AICQ OpenClaw Plugin — Main Entry Point
 *
 * Activates the encrypted chat plugin inside the OpenClaw Agent runtime.
 * Registers channels, tools, hooks, and services.
 */

import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

import { loadConfig } from "./config.js";
import { decodeBase64 } from "@aicq/crypto";
import { PluginStore } from "./store.js";
import { IdentityService } from "./services/identityService.js";
import { ServerClient } from "./services/serverClient.js";
import { EncryptedChatChannel } from "./channels/encryptedChat.js";
import { ChatFriendTool } from "./tools/chatFriend.js";
import { ChatSendTool } from "./tools/chatSend.js";
import { ChatExportKeyTool } from "./tools/chatExportKey.js";
import { MessageSendingHook } from "./hooks/messageSending.js";
import { BeforeToolCallHook } from "./hooks/beforeToolCall.js";
import { HandshakeManager } from "./handshake/handshakeManager.js";
import { P2PConnectionManager } from "./p2p/connectionManager.js";
import { FileTransferManager } from "./fileTransfer/transferManager.js";
import type { OpenClawAPI, Logger, ToolHandler, HookHandler, ChannelHandler } from "./types.js";

// ----------------------------------------------------------------
//  Module state
// ----------------------------------------------------------------

let api: OpenClawAPI | null = null;
let logger: Logger | null = null;
let serverClient: ServerClient | null = null;
let identityService: IdentityService | null = null;
let chatChannel: EncryptedChatChannel | null = null;
let p2pManager: P2PConnectionManager | null = null;
let fileTransferManager: FileTransferManager | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

// ----------------------------------------------------------------
//  Plugin lifecycle
// ----------------------------------------------------------------

/**
 * Activate the AICQ encrypted chat plugin.
 *
 * Called by the OpenClaw Agent runtime when the plugin is loaded.
 */
export async function activate(runtimeApi: OpenClawAPI): Promise<void> {
  api = runtimeApi;
  logger = api.getLogger("aicq-plugin");

  logger.info("========================================");
  logger.info("  AICQ Encrypted Chat Plugin v1.0.0");
  logger.info("========================================");

  // 1. Load configuration
  const config = loadConfig();
  logger.info("[Init] Configuration loaded");
  logger.info("[Init]   Server URL: " + config.serverUrl);
  logger.info("[Init]   Agent ID:   " + config.agentId);
  logger.info("[Init]   Max Friends: " + config.maxFriends);
  logger.info("[Init]   Auto Accept: " + config.autoAcceptFriends);

  // 2. Initialize store
  const store = new PluginStore();
  const dataDir = api.getDataDir();
  store.setDataDir(dataDir);
  store.load();
  logger.info("[Init] Store initialized (data dir: " + dataDir + ")");

  // 3. Initialize identity
  identityService = new IdentityService(store, logger);
  identityService.initialize(config.agentId);
  logger.info("[Init] Identity initialized");
  logger.info("[Init]   Agent ID: " + identityService.getAgentId());
  logger.info("[Init]   Fingerprint: " + identityService.getPublicKeyFingerprint());

  // 4. Create server client
  serverClient = new ServerClient(config.serverUrl, store, logger);

  // 5. Create P2P connection manager
  p2pManager = new P2PConnectionManager(serverClient, logger);
  p2pManager.setupWsHandlers();
  logger.info("[Init] P2P manager ready");

  // 6. Create handshake manager
  const handshakeManager = new HandshakeManager(store, serverClient, config, logger);
  handshakeManager.setupWsHandlers();
  logger.info("[Init] Handshake manager ready");

  // 7. Register encrypted-chat channel
  chatChannel = new EncryptedChatChannel(
    store,
    handshakeManager,
    p2pManager,
    serverClient,
    logger,
  );
  chatChannel.setAPI(api);

  const channelHandler: ChannelHandler = {
    onMessage(data: Buffer, fromId: string, _metadata?: Record<string, unknown>) {
      chatChannel!.onMessage(data, fromId);
    },
  };

  api.registerChannel("encrypted-chat", channelHandler);
  logger.info("[Init] Channel registered: encrypted-chat");

  // 8. Register tool: chat-friend
  const chatFriendTool = new ChatFriendTool(
    store,
    serverClient,
    handshakeManager,
    identityService,
    config,
    logger,
  );

  const chatFriendHandler: ToolHandler = {
    async handle(params: Record<string, unknown>) {
      const action = params.action as string;
      if (!action) {
        return { error: "Missing 'action' parameter" };
      }
      return chatFriendTool.handleAction(action, params);
    },
  };

  api.registerTool("chat-friend", chatFriendHandler);
  logger.info("[Init] Tool registered: chat-friend");

  // 9. Register tool: chat-send
  const chatSendTool = new ChatSendTool(store, chatChannel, handshakeManager, logger);

  const chatSendHandler: ToolHandler = {
    async handle(params: Record<string, unknown>) {
      return chatSendTool.handle(params);
    },
  };

  api.registerTool("chat-send", chatSendHandler);
  logger.info("[Init] Tool registered: chat-send");

  // 10. Register tool: chat-export-key
  const chatExportKeyTool = new ChatExportKeyTool(identityService, logger);

  const chatExportKeyHandler: ToolHandler = {
    async handle(params: Record<string, unknown>) {
      return chatExportKeyTool.handle(params);
    },
  };

  api.registerTool("chat-export-key", chatExportKeyHandler);
  logger.info("[Init] Tool registered: chat-export-key");

  // 11. Register hook: message_sending
  const messageSendingHook = new MessageSendingHook(store, handshakeManager, logger);

  const messageSendingHandler: HookHandler = {
    async execute(data: unknown, metadata?: Record<string, unknown>) {
      return messageSendingHook.intercept(data, metadata);
    },
  };

  api.registerHook("message_sending", messageSendingHandler);
  logger.info("[Init] Hook registered: message_sending");

  // 12. Register hook: before_tool_call
  const beforeToolCallHook = new BeforeToolCallHook(store, config, chatExportKeyTool, logger);

  const beforeToolCallHandler: HookHandler = {
    async execute(data: unknown, _metadata?: Record<string, unknown>) {
      const params = data as Record<string, unknown>;
      const toolName = params.toolName as string;
      const toolParams = params.params as Record<string, unknown>;
      return beforeToolCallHook.check(toolName, toolParams);
    },
  };

  api.registerHook("before_tool_call", beforeToolCallHandler);
  logger.info("[Init] Hook registered: before_tool_call");

  // 13. Register service: identity-service
  api.registerService("identity-service", identityService);
  logger.info("[Init] Service registered: identity-service");

  // 14. Create file transfer manager
  fileTransferManager = new FileTransferManager(
    store,
    serverClient,
    p2pManager,
    chatChannel,
    logger,
  );
  logger.info("[Init] File transfer manager ready");

  // 15. Connect to server WebSocket
  serverClient.connectWebSocket();

  // Set up WebSocket handlers for relay messages (incoming chat messages)
  serverClient.onWsMessage("relay", (data) => {
    const msg = data as Record<string, unknown>;
    const senderId = msg.senderId as string;
    const payload = msg.payload as Record<string, unknown>;

    if (payload?.channel === "encrypted-chat" && payload?.data) {
      const encryptedData = Buffer.from(decodeBase64(payload.data as string));
      chatChannel!.onMessage(encryptedData, senderId);
    }

    // Handle incoming file chunks via relay
    if (payload?.type === "file_chunk") {
      const chunkData = Buffer.from(payload.data as string, "base64");
      const chunkIndex = payload.chunkIndex as number;
      const sessionId = payload.sessionId as string;
      chatChannel!.handleFileChunk(senderId, chunkData, chunkIndex, sessionId);
    }
  });

  // 16. Start heartbeat
  heartbeatTimer = setInterval(() => {
    if (serverClient?.isConnected()) {
      logger?.debug("[Heartbeat] Connected to " + config.serverUrl);
    } else {
      logger?.warn("[Heartbeat] Disconnected from " + config.serverUrl);
    }
  }, 60_000);

  // 17. Clean up expired temp numbers periodically
  setInterval(() => {
    store.cleanupExpiredTempNumbers();
  }, 60_000);

  logger.info("========================================");
  logger.info("  AICQ Plugin activated successfully!");
  logger.info("========================================");
}

/**
 * Deactivate the plugin and clean up resources.
 *
 * Called by the OpenClaw Agent runtime when the plugin is unloaded.
 */
export async function deactivate(): Promise<void> {
  logger?.info("[Shutdown] Deactivating AICQ plugin...");

  // Stop heartbeat
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Disconnect WebSocket
  if (serverClient) {
    serverClient.disconnectWebSocket();
  }

  // Clean up P2P
  if (p2pManager) {
    p2pManager.cleanup();
  }

  // Clean up file transfers
  if (fileTransferManager) {
    fileTransferManager.cleanup();
  }

  // Clean up chat channel
  if (chatChannel) {
    chatChannel.cleanup();
  }

  // Clean up identity service
  if (identityService) {
    identityService.cleanup();
  }

  logger?.info("[Shutdown] AICQ plugin deactivated");
  api = null;
  logger = null;
  serverClient = null;
  identityService = null;
  chatChannel = null;
  p2pManager = null;
  fileTransferManager = null;
}

// ----------------------------------------------------------------
//  Direct execution (for development / testing)
// ----------------------------------------------------------------

if (require.main === module) {
  // When run directly, provide a mock API and activate
  const mockAPI: OpenClawAPI = {
    registerChannel: (_name, _handler) => {},
    registerTool: (_name, _handler) => {},
    registerHook: (_event, _handler) => {},
    registerService: (_name, _service) => {},
    emit: (_event, _data) => {},
    getLogger: (name: string) => ({
      info: (...args: unknown[]) => console.log("[" + name + " INFO]", ...args),
      warn: (...args: unknown[]) => console.warn("[" + name + " WARN]", ...args),
      error: (...args: unknown[]) => console.error("[" + name + " ERROR]", ...args),
      debug: (...args: unknown[]) => console.log("[" + name + " DEBUG]", ...args),
    }),
    getDataDir: () => path.join(process.cwd(), "data"),
  };

  activate(mockAPI as unknown as OpenClawAPI).catch((err) => {
    console.error("Failed to activate plugin:", err);
    process.exit(1);
  });
}
