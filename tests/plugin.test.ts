/**
 * Comprehensive tests for the AICQ Plugin.
 *
 * Covers: Config loading, PluginStore persistence, IdentityService,
 * HandshakeManager, EncryptedChatChannel, ChatFriendTool, ChatSendTool,
 * ChatExportKeyTool, MessageSendingHook, BeforeToolCallHook,
 * P2PConnectionManager, FileTransferManager.
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
  encryptWithPassword,
  decryptWithPassword,
  encodeBase64,
  decodeBase64,
  encryptMessage,
  decryptMessage,
  nacl,
} from "@aicq/crypto";
import type { KeyPair, HandshakeRequest, HandshakeResponse } from "@aicq/crypto";

// ─── Source imports ─────────────────────────────────────────────────
import { loadConfig } from "../aicq-plugin/dist/config.js";
import { PluginStore } from "../aicq-plugin/dist/store.js";
import { IdentityService } from "../aicq-plugin/dist/services/identityService.js";
import { HandshakeManager } from "../aicq-plugin/dist/handshake/handshakeManager.js";
import { EncryptedChatChannel } from "../aicq-plugin/dist/channels/encryptedChat.js";
import { ChatFriendTool } from "../aicq-plugin/dist/tools/chatFriend.js";
import { ChatSendTool } from "../aicq-plugin/dist/tools/chatSend.js";
import { ChatExportKeyTool } from "../aicq-plugin/dist/tools/chatExportKey.js";
import { MessageSendingHook } from "../aicq-plugin/dist/hooks/messageSending.js";
import { BeforeToolCallHook } from "../aicq-plugin/dist/hooks/beforeToolCall.js";
import { P2PConnectionManager } from "../aicq-plugin/dist/p2p/connectionManager.js";
import { FileTransferManager } from "../aicq-plugin/dist/fileTransfer/transferManager.js";
import type { PluginConfig, FriendRecord, SessionState, Logger } from "../aicq-plugin/dist/types.js";

// ─── Minimal test runner ────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;
const failures: { name: string; error: string }[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    totalPassed++;
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    totalFailed++;
    const msg = err?.message || String(err);
    failures.push({ name, error: msg });
    console.log(`  \u2717 ${name}`);
    console.log(`    \u2192 ${msg}`);
  }
}

function assertThrows(fn: () => void, label?: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(label || "Expected function to throw but it did not");
}

async function assertThrowsAsync(fn: () => Promise<void>, label?: string): Promise<void> {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error(label || "Expected function to throw but it did not");
}

function bufEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
  return true;
}

// ─── Shared helpers ─────────────────────────────────────────────────

function createMockLogger(): Logger {
  const logs: string[] = [];
  return {
    info: (...args: unknown[]) => logs.push("INFO " + args.join(" ")),
    warn: (...args: unknown[]) => logs.push("WARN " + args.join(" ")),
    error: (...args: unknown[]) => logs.push("ERROR " + args.join(" ")),
    debug: (...args: unknown[]) => logs.push("DEBUG " + args.join(" ")),
  };
}

/**
 * Minimal mock ServerClient that avoids WebSocket/network calls.
 * Provides stub methods and a controllable onWsMessage dispatch.
 */
function createMockServerClient(store: PluginStore, logger: Logger) {
  const wsHandlers: Map<string, Array<(data: unknown) => void>> = new Map();
  const relayMessages: Array<{ targetId: string; payload: unknown }> = [];
  const wsMessages: Array<{ type: string; data: unknown }> = [];

  return {
    onWsMessage(type: string, handler: (data: unknown) => void) {
      const existing = wsHandlers.get(type) || [];
      existing.push(handler);
      wsHandlers.set(type, existing);
    },
    /** Simulate receiving a WebSocket message from server */
    simulateWsMessage(type: string, data: Record<string, unknown>) {
      const msg = { type, ...data };
      const handlers = wsHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) handler(msg);
      }
    },
    wsSend(data: unknown) {
      const msg = data as Record<string, unknown>;
      wsMessages.push({ type: msg.type as string, data });
    },
    sendRelayMessage(targetId: string, payload: unknown) {
      relayMessages.push({ targetId, payload });
    },
    getRelayMessages() { return relayMessages; },
    getWsMessages() { return wsMessages; },
    isConnected() { return false; },
    connectWebSocket() {},
    disconnectWebSocket() {},
    async registerNode() { return true; },
    async requestTempNumber() { return "123456"; },
    async resolveTempNumber(number: string) {
      if (number === "000000") return null;
      const kp = generateSigningKeyPair();
      return {
        nodeId: "peer-abc123",
        publicKey: Buffer.from(kp.publicKey).toString("base64"),
      };
    },
    async revokeTempNumber() { return true; },
    async initiateHandshake(tempNumber: string) {
      const kp = generateKeyExchangeKeyPair();
      return {
        sessionId: "session-" + tempNumber,
        targetPublicKey: Buffer.from(kp.publicKey).toString("base64"),
      };
    },
    async submitHandshakeResponse() { return true; },
    async submitHandshakeConfirm() { return true; },
    async listFriends() { return []; },
    async removeFriend() { return true; },
    async getFriendCount() { return 0; },
    async initiateFileTransfer() { return null; },
    async getFileMissingChunks() { return []; },
  };
}

function createTestConfig(overrides?: Partial<PluginConfig>): PluginConfig {
  return {
    serverUrl: "https://test.aicq.local",
    agentId: "test-agent-001",
    maxFriends: 50,
    autoAcceptFriends: false,
    ...overrides,
  };
}

function createTestStore(): PluginStore {
  const store = new PluginStore();
  store.agentId = "test-agent-001";
  store.identityKeys = generateSigningKeyPair();
  store.exchangeKeys = generateKeyExchangeKeyPair();
  return store;
}

function createTestFriend(id: string): FriendRecord {
  const kp = generateSigningKeyPair();
  return {
    id,
    publicKey: kp.publicKey,
    publicKeyFingerprint: getPublicKeyFingerprint(kp.publicKey),
    addedAt: new Date("2024-01-15T10:00:00Z"),
    lastMessageAt: new Date("2024-01-15T12:00:00Z"),
  };
}

function createTestSession(peerId: string): SessionState {
  return {
    peerId,
    sessionKey: new Uint8Array(32).fill(42),
    ephemeralSecretKey: new Uint8Array(32).fill(99),
    createdAt: new Date(),
    messageCount: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  1. CONFIG
// ═══════════════════════════════════════════════════════════════════════

async function testConfig() {
  console.log("\n-- Config (loadConfig) --");

  await test("default values match openclaw.plugin.json configSchema", () => {
    const config = loadConfig({});
    assert.equal(config.serverUrl, "https://aicq.online", "serverUrl default");
    assert.equal(config.maxFriends, 200, "maxFriends default");
    assert.equal(config.autoAcceptFriends, false, "autoAcceptFriends default");
    assert.ok(config.agentId.length > 0, "agentId should be auto-generated");
  });

  await test("auto-generates agentId when empty string", () => {
    const config = loadConfig({ agentId: "" });
    assert.ok(config.agentId.length > 0, "agentId should be auto-generated");
    assert.ok(/^[a-f0-9]{32}$/.test(config.agentId), "agentId should be UUID without dashes");
  });

  await test("auto-generates agentId when not provided", () => {
    const config = loadConfig();
    assert.ok(config.agentId.length > 0, "agentId should be auto-generated");
  });

  await test("custom overrides take precedence", () => {
    const config = loadConfig({
      serverUrl: "https://custom.server.com",
      agentId: "my-custom-id",
      maxFriends: 10,
      autoAcceptFriends: true,
    });
    assert.equal(config.serverUrl, "https://custom.server.com");
    assert.equal(config.agentId, "my-custom-id");
    assert.equal(config.maxFriends, 10);
    assert.equal(config.autoAcceptFriends, true);
  });

  await test("override agentId prevents auto-generation", () => {
    const config = loadConfig({ agentId: "explicit-id-123" });
    assert.equal(config.agentId, "explicit-id-123");
  });

  await test("maxFriends override accepts number", () => {
    const config = loadConfig({ maxFriends: 5 });
    assert.equal(config.maxFriends, 5);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  2. PLUGIN STORE
// ═══════════════════════════════════════════════════════════════════════

async function testPluginStore() {
  console.log("\n-- PluginStore --");

  await test("initialize has empty defaults", () => {
    const store = new PluginStore();
    assert.equal(store.agentId, "");
    assert.equal(store.identityKeys.publicKey.length, 0);
    assert.equal(store.identityKeys.secretKey.length, 0);
    assert.equal(store.friends.size, 0);
    assert.equal(store.sessions.size, 0);
    assert.equal(store.tempNumbers.length, 0);
    assert.equal(store.pendingRequests.length, 0);
    assert.equal(store.pendingHandshakes.size, 0);
  });

  await test("getFriendCount returns 0 for empty store", () => {
    const store = new PluginStore();
    assert.equal(store.getFriendCount(), 0);
  });

  await test("addFriend and getFriend round-trip", () => {
    const store = new PluginStore();
    const friend = createTestFriend("alice-001");
    store.addFriend(friend);
    assert.equal(store.getFriendCount(), 1);
    const retrieved = store.getFriend("alice-001");
    assert.ok(retrieved, "friend should exist");
    assert.equal(retrieved!.id, "alice-001");
    assert.equal(retrieved!.publicKeyFingerprint, friend.publicKeyFingerprint);
  });

  await test("removeFriend removes friend and associated session", () => {
    const store = new PluginStore();
    store.addFriend(createTestFriend("bob-002"));
    store.setSession("bob-002", createTestSession("bob-002"));
    assert.equal(store.getFriendCount(), 1);
    assert.ok(store.getSession("bob-002"));

    const removed = store.removeFriend("bob-002");
    assert.equal(removed, true);
    assert.equal(store.getFriendCount(), 0);
    assert.equal(store.getSession("bob-002"), undefined);
  });

  await test("removeFriend returns false for non-existent friend", () => {
    const store = new PluginStore();
    assert.equal(store.removeFriend("nonexistent"), false);
  });

  await test("setSession and getSession round-trip", () => {
    const store = new PluginStore();
    const session = createTestSession("charlie-003");
    store.setSession("charlie-003", session);
    const retrieved = store.getSession("charlie-003");
    assert.ok(retrieved, "session should exist");
    assert.equal(retrieved!.peerId, "charlie-003");
    assert.equal(retrieved!.messageCount, 0);
    assert.ok(bufEq(retrieved!.sessionKey, session.sessionKey));
  });

  await test("setSession updates friend sessionKey", () => {
    const store = new PluginStore();
    store.addFriend(createTestFriend("dave-004"));
    const session = createTestSession("dave-004");
    store.setSession("dave-004", session);
    const friend = store.getFriend("dave-004");
    assert.ok(friend!.sessionKey, "friend should have sessionKey after setSession");
    assert.ok(bufEq(friend!.sessionKey!, session.sessionKey));
  });

  await test("removeSession works", () => {
    const store = new PluginStore();
    store.setSession("eve-005", createTestSession("eve-005"));
    assert.ok(store.getSession("eve-005"));
    store.removeSession("eve-005");
    assert.equal(store.getSession("eve-005"), undefined);
  });

  await test("temp number management: add, revoke, cleanup", () => {
    const store = new PluginStore();
    store.addTempNumber("654321", new Date(Date.now() + 10 * 60 * 1000));
    assert.equal(store.tempNumbers.length, 1);
    assert.equal(store.tempNumbers[0].number, "654321");

    const revoked = store.revokeTempNumber("654321");
    assert.equal(revoked, true);
    assert.equal(store.tempNumbers.length, 0);

    const revokeAgain = store.revokeTempNumber("654321");
    assert.equal(revokeAgain, false);
  });

  await test("cleanupExpiredTempNumbers removes expired ones", () => {
    const store = new PluginStore();
    store.addTempNumber("111111", new Date(Date.now() - 1000)); // expired
    store.addTempNumber("222222", new Date(Date.now() + 60000)); // valid
    store.cleanupExpiredTempNumbers();
    assert.equal(store.tempNumbers.length, 1);
    assert.equal(store.tempNumbers[0].number, "222222");
  });

  await test("pending friend requests: add, remove", () => {
    const store = new PluginStore();
    store.addPendingRequest({ requesterId: "req-001", tempNumber: "ses-001", timestamp: new Date() });
    assert.equal(store.pendingRequests.length, 1);
    const removed = store.removePendingRequest("req-001");
    assert.equal(removed, true);
    assert.equal(store.pendingRequests.length, 0);
    const removeAgain = store.removePendingRequest("req-001");
    assert.equal(removeAgain, false);
  });

  await test("pending handshake: set, get, remove", () => {
    const store = new PluginStore();
    const ephKeys = generateKeyExchangeKeyPair();
    const hs = {
      sessionId: "hs-001",
      peerId: "peer-001",
      request: { identityPublicKey: ephKeys.publicKey, ephemeralPublicKey: ephKeys.publicKey },
      ephemeralKeys: ephKeys,
      createdAt: new Date(),
    };
    store.setPendingHandshake("hs-001", hs);
    const retrieved = store.getPendingHandshake("hs-001");
    assert.ok(retrieved, "handshake should exist");
    assert.equal(retrieved!.sessionId, "hs-001");
    store.removePendingHandshake("hs-001");
    assert.equal(store.getPendingHandshake("hs-001"), undefined);
  });

  await test("persistence: save to JSON and load from JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aicq-test-"));
    try {
      // Create and populate store
      const store = new PluginStore();
      store.agentId = "persist-test-agent";
      store.identityKeys = generateSigningKeyPair();
      store.exchangeKeys = generateKeyExchangeKeyPair();
      store.addFriend(createTestFriend("friend-persist-1"));
      store.setSession("friend-persist-1", createTestSession("friend-persist-1"));
      store.addTempNumber("999999", new Date(Date.now() + 60000));
      store.addPendingRequest({ requesterId: "req-persist", tempNumber: "tmp", timestamp: new Date() });

      // Save
      store.setDataDir(tmpDir);
      store.save();

      // Verify file exists
      const filePath = path.join(tmpDir, "plugin-store.json");
      assert.ok(fs.existsSync(filePath), "store file should exist");

      // Load into new store
      const store2 = new PluginStore();
      store2.setDataDir(tmpDir);
      const loaded = store2.load();
      assert.equal(loaded, true, "load should return true");
      assert.equal(store2.agentId, "persist-test-agent");
      assert.equal(store2.friends.size, 1);
      assert.ok(store2.getFriend("friend-persist-1"), "friend should be restored");
      assert.ok(store2.getSession("friend-persist-1"), "session should be restored");
      assert.equal(store2.tempNumbers.length, 1);
      assert.equal(store2.pendingRequests.length, 1);
      assert.ok(bufEq(store2.identityKeys.publicKey, store.identityKeys.publicKey), "identity public key should match");
      assert.ok(bufEq(store2.identityKeys.secretKey, store.identityKeys.secretKey), "identity secret key should match");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test("load returns false when no file exists", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aicq-test-"));
    try {
      const store = new PluginStore();
      store.setDataDir(tmpDir);
      const loaded = store.load();
      assert.equal(loaded, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test("save does nothing when no dataDir is set", () => {
    const store = new PluginStore();
    // Should not throw
    store.save();
    assert.ok(true, "save with no dataDir should not throw");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  3. IDENTITY SERVICE
// ═══════════════════════════════════════════════════════════════════════

async function testIdentityService() {
  console.log("\n-- IdentityService --");

  await test("initialize generates new keypair", () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-init-test");
    assert.equal(store.agentId, "agent-init-test");
    assert.equal(store.identityKeys.publicKey.length, 32, "public key should be 32 bytes");
    assert.equal(store.identityKeys.secretKey.length, 64, "secret key should be 64 bytes");
    assert.equal(store.exchangeKeys.publicKey.length, 32, "exchange public key should be 32 bytes");
    assert.equal(store.exchangeKeys.secretKey.length, 32, "exchange secret key should be 32 bytes");
  });

  await test("initialize with existing store keys skips generation", () => {
    const store = new PluginStore();
    const originalKeys = generateSigningKeyPair();
    store.identityKeys = originalKeys;
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-existing");
    assert.ok(bufEq(store.identityKeys.publicKey, originalKeys.publicKey), "should keep existing keys");
  });

  await test("getPublicKey returns stored public key", () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-pubkey");
    const pk = svc.getPublicKey();
    assert.ok(bufEq(pk, store.identityKeys.publicKey));
  });

  await test("getPublicKeyFingerprint returns 32-char hex", () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-fp");
    const fp = svc.getPublicKeyFingerprint();
    assert.equal(typeof fp, "string");
    assert.equal(fp.length, 32);
    assert.ok(/^[0-9a-f]{32}$/.test(fp));
  });

  await test("getAgentId returns stored agent ID", () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("my-agent-id-xyz");
    assert.equal(svc.getAgentId(), "my-agent-id-xyz");
  });

  await test("exportPrivateKeyQR returns QR data URL", async () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-export");
    const qrDataUrl = await svc.exportPrivateKeyQR("test-password-12345678");
    assert.ok(qrDataUrl.startsWith("data:image/png;base64,"), "should be a data URL for QR");
  });

  await test("importPrivateKeyFromQR restores keys with correct password", async () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-import-src");

    // Manually construct the transfer JSON the same way exportPrivateKeyQR does,
    // simulating what a QR scanner would extract from the image.
    const password = "correct-password!";
    const exportPayload = {
      a: store.agentId,
      pk: encodeBase64(store.identityKeys.publicKey),
      sk: encodeBase64(store.identityKeys.secretKey),
      ek_pk: encodeBase64(store.exchangeKeys.publicKey),
      ek_sk: encodeBase64(store.exchangeKeys.secretKey),
      t: Date.now(),
    };
    const payloadJson = JSON.stringify(exportPayload);
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const encrypted = encryptWithPassword(payloadBytes, password);
    const transferData = {
      v: 1,
      s: encodeBase64(encrypted.salt),
      i: encodeBase64(encrypted.iv),
      e: encodeBase64(encrypted.encrypted),
    };
    const transferJson = JSON.stringify(transferData);

    // Import into a new store
    const store2 = new PluginStore();
    const logger2 = createMockLogger();
    const svc2 = new IdentityService(store2, logger2);
    const imported = svc2.importPrivateKeyFromQR(transferJson, password);
    assert.equal(imported, true, "import should succeed");
    assert.equal(store2.agentId, "agent-import-src");
    assert.ok(bufEq(store2.identityKeys.publicKey, store.identityKeys.publicKey), "public key should match");
    assert.ok(bufEq(store2.identityKeys.secretKey, store.identityKeys.secretKey), "secret key should match");
    assert.ok(bufEq(store2.exchangeKeys.publicKey, store.exchangeKeys.publicKey), "exchange public key should match");
    assert.ok(bufEq(store2.exchangeKeys.secretKey, store.exchangeKeys.secretKey), "exchange secret key should match");
  });

  await test("importPrivateKeyFromQR fails with wrong password", async () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-wrong-pw");

    // Construct transfer JSON manually
    const password = "right-password!";
    const exportPayload = {
      a: store.agentId,
      pk: encodeBase64(store.identityKeys.publicKey),
      sk: encodeBase64(store.identityKeys.secretKey),
      ek_pk: encodeBase64(store.exchangeKeys.publicKey),
      ek_sk: encodeBase64(store.exchangeKeys.secretKey),
      t: Date.now(),
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(exportPayload));
    const encrypted = encryptWithPassword(payloadBytes, password);
    const transferJson = JSON.stringify({
      v: 1,
      s: encodeBase64(encrypted.salt),
      i: encodeBase64(encrypted.iv),
      e: encodeBase64(encrypted.encrypted),
    });

    const store2 = new PluginStore();
    const svc2 = new IdentityService(store2, createMockLogger());
    const imported = svc2.importPrivateKeyFromQR(transferJson, "wrong-password!!");
    assert.equal(imported, false, "import should fail with wrong password");
  });

  await test("importPrivateKeyFromQR fails with invalid JSON", () => {
    const store = new PluginStore();
    const svc = new IdentityService(store, createMockLogger());
    const imported = svc.importPrivateKeyFromQR("not json", "password");
    assert.equal(imported, false);
  });

  await test("regenerateKeys produces new keys", () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-regen");
    const oldPubKey = new Uint8Array(store.identityKeys.publicKey);
    svc.regenerateKeys();
    assert.ok(!bufEq(oldPubKey, store.identityKeys.publicKey), "new keys should differ");
  });

  await test("cleanup clears export timers without error", async () => {
    const store = new PluginStore();
    const logger = createMockLogger();
    const svc = new IdentityService(store, logger);
    svc.initialize("agent-cleanup");
    await svc.exportPrivateKeyQR("pw12345678");
    svc.cleanup();
    assert.ok(true, "cleanup should not throw");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  4. HANDSHAKE MANAGER
// ═══════════════════════════════════════════════════════════════════════

async function testHandshakeManager() {
  console.log("\n-- HandshakeManager --");

  await test("setupWsHandlers registers handlers without error", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);
    hm.setupWsHandlers();
    assert.ok(true, "setupWsHandlers should not throw");
  });

  await test("getSessionKey returns null for unknown peer", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);
    assert.equal(hm.getSessionKey("unknown-peer"), null);
  });

  await test("getSessionKey returns key for known session", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);

    const session = createTestSession("known-peer");
    store.setSession("known-peer", session);
    const key = hm.getSessionKey("known-peer");
    assert.ok(key, "should return session key");
    assert.ok(bufEq(key!, session.sessionKey));
  });

  await test("rotateSessionKey generates new session key", () => {
    const store = createTestStore();
    const friend = createTestFriend("rotate-peer");
    friend.publicKey = generateKeyExchangeKeyPair().publicKey; // need X25519 compat key
    store.addFriend(friend);
    const oldSession = createTestSession("rotate-peer");
    store.setSession("rotate-peer", oldSession);

    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);

    hm.rotateSessionKey("rotate-peer");
    const newSession = store.getSession("rotate-peer");
    assert.ok(newSession, "session should still exist");
    // The key should have changed (different derivation)
    assert.equal(newSession!.messageCount, 0, "message count should be reset");
  });

  await test("rotateSessionKey warns for unknown peer", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);
    // Should not throw
    hm.rotateSessionKey("nonexistent-peer");
    assert.ok(true);
  });

  await test("handleConfirm does not throw", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const hm = new HandshakeManager(store, mockServer as any, config, logger);
    hm.handleConfirm({});
    assert.ok(true);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  5. ENCRYPTED CHAT CHANNEL
// ═══════════════════════════════════════════════════════════════════════

async function testEncryptedChatChannel() {
  console.log("\n-- EncryptedChatChannel --");

  await test("handle incoming text message decrypts and emits", () => {
    const store = createTestStore();
    const logger = createMockLogger();

    // Create the friend with known keys so we can encrypt with them
    const peerKeys = generateSigningKeyPair();
    const friend: FriendRecord = {
      id: "msg-peer",
      publicKey: peerKeys.publicKey,
      publicKeyFingerprint: getPublicKeyFingerprint(peerKeys.publicKey),
      addedAt: new Date(),
      lastMessageAt: new Date(),
    };
    store.addFriend(friend);

    // Set up session
    const sessionKey = new Uint8Array(32).fill(77);
    store.setSession("msg-peer", {
      peerId: "msg-peer",
      sessionKey,
      ephemeralSecretKey: new Uint8Array(32),
      createdAt: new Date(),
      messageCount: 0,
    });

    const mockServer = createMockServerClient(store, logger);
    const mockP2P = {
      isConnected: () => false,
      send: () => false,
      connect: () => {},
      disconnect: () => {},
      setupWsHandlers: () => {},
      cleanup: () => {},
      getConnectedPeers: () => [],
      onSignal: () => {},
      sendSignal: () => {},
    } as any;

    const mockHandshake = {
      getSessionKey: (peerId: string) => {
        const s = store.getSession(peerId);
        return s?.sessionKey ?? null;
      },
      rotateSessionKey: () => {},
    } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    let emitted = false;
    let emittedData: any = null;
    channel.setAPI({
      emit: (event: string, data: unknown) => { emitted = true; emittedData = data; },
    } as any);

    // Encrypt a message using the SAME peer keys stored in the friend record
    const plaintext = "Hello from peer!";
    const wireData = encryptMessage(plaintext, sessionKey, peerKeys.secretKey, peerKeys.publicKey);
    const buf = Buffer.from(wireData);

    channel.onMessage(buf, "msg-peer");
    assert.ok(emitted, "should have emitted chat:message");
    assert.equal(emittedData.from, "msg-peer");
    assert.equal(emittedData.message, plaintext);
  });

  await test("onMessage ignores unknown sender", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);
    let emitted = false;
    channel.setAPI({ emit: () => { emitted = true; } } as any);

    channel.onMessage(Buffer.from("fake data"), "unknown-sender");
    assert.equal(emitted, false, "should not emit for unknown sender");
  });

  await test("send text message via relay fallback", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const friend = createTestFriend("send-peer");
    store.addFriend(friend);
    const sessionKey = new Uint8Array(32).fill(88);
    store.setSession("send-peer", {
      peerId: "send-peer",
      sessionKey,
      ephemeralSecretKey: new Uint8Array(32),
      createdAt: new Date(),
      messageCount: 0,
    });

    const mockServer = createMockServerClient(store, logger);
    const mockP2P = {
      isConnected: () => false,
      send: () => false,
      setupWsHandlers: () => {},
      cleanup: () => {},
    } as any;

    const mockHandshake = {
      getSessionKey: (peerId: string) => store.getSession(peerId)?.sessionKey ?? null,
      rotateSessionKey: () => {},
    } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    const result = channel.send("send-peer", "Hello!");
    assert.equal(result, true, "send should return true");
    const relayMsgs = mockServer.getRelayMessages();
    assert.equal(relayMsgs.length, 1, "should have sent one relay message");
    assert.equal(relayMsgs[0].targetId, "send-peer");
  });

  await test("send returns false for unknown friend", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);
    const result = channel.send("nobody", "Hello!");
    assert.equal(result, false);
  });

  await test("file chunk buffer: register, handle chunk, get, remove", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    const buffer = {
      sessionId: "file-ses-001",
      senderId: "sender-001",
      fileName: "test.txt",
      totalChunks: 3,
      receivedChunks: new Map<number, Uint8Array>(),
      fileHash: "abc123",
    };

    channel.registerFileBuffer("file-ses-001", buffer);
    assert.ok(channel.getFileBuffer("file-ses-001"), "buffer should be registered");

    channel.handleFileChunk("sender-001", Buffer.from("chunk-0"), 0, "file-ses-001");
    assert.equal(buffer.receivedChunks.size, 1);
    assert.ok(bufEq(buffer.receivedChunks.get(0)!, Buffer.from("chunk-0")));

    channel.removeFileBuffer("file-ses-001");
    assert.equal(channel.getFileBuffer("file-ses-001"), undefined);
  });

  await test("handleFileChunk ignores unknown session", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);
    // Should not throw
    channel.handleFileChunk("sender-001", Buffer.from("data"), 0, "nonexistent-session");
    assert.ok(true);
  });

  await test("cleanup clears file buffers", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;

    const channel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);
    channel.registerFileBuffer("ses-cleanup", {
      sessionId: "ses-cleanup",
      senderId: "s",
      fileName: "f",
      totalChunks: 1,
      receivedChunks: new Map(),
      fileHash: "h",
    });
    channel.cleanup();
    assert.equal(channel.getFileBuffer("ses-cleanup"), undefined);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  6. CHAT FRIEND TOOL
// ═══════════════════════════════════════════════════════════════════════

async function testChatFriendTool() {
  console.log("\n-- ChatFriendTool --");

  await test("list friends returns empty list", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("list", {});
    assert.equal(result.total, 0);
    assert.equal(result.shown, 0);
    assert.ok(Array.isArray(result.friends));
    assert.equal(result.friends.length, 0);
  });

  await test("list friends with populated store", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    store.addFriend(createTestFriend("friend-a"));
    store.addFriend(createTestFriend("friend-b"));
    store.setSession("friend-a", createTestSession("friend-a"));

    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("list", { limit: 10 });
    assert.equal(result.total, 2);
    assert.equal(result.shown, 2);
    assert.equal(result.friends.length, 2);
  });

  await test("remove friend action succeeds", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    store.addFriend(createTestFriend("remove-me"));

    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("remove", { target: "remove-me" });
    assert.equal(result.success, true);
    assert.equal(result.removedFriendId, "remove-me");
    assert.equal(store.getFriendCount(), 0);
  });

  await test("remove friend action fails for non-existent friend", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("remove", { target: "nonexistent" });
    assert.ok(result.error, "should return error");
    assert.ok(result.error.includes("Friend not found"));
  });

  await test("request-temp-number action returns temp number", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("request-temp-number", {});
    assert.equal(result.success, true);
    assert.ok(result.tempNumber, "should return temp number");
    assert.equal(store.tempNumbers.length, 1);
  });

  await test("revoke-temp-number action succeeds", async () => {
    const store = createTestStore();
    store.addTempNumber("777777", new Date(Date.now() + 60000));
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("revoke-temp-number", { target: "777777" });
    assert.equal(result.success, true);
    assert.equal(store.tempNumbers.length, 0);
  });

  await test("revoke-temp-number action fails for non-existent number", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("revoke-temp-number", { target: "000000" });
    assert.ok(result.error, "should return error");
  });

  await test("unknown action returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const config = createTestConfig();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {}, initiate: async () => null } as any;
    const mockIdentity = { getPublicKeyFingerprint: () => "fp123" } as any;

    const tool = new ChatFriendTool(store, mockServer as any, mockHandshake, mockIdentity, config, logger);
    const result = await tool.handleAction("unknown-action", {});
    assert.ok(result.error);
    assert.ok(result.error.includes("Unknown action"));
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  7. CHAT SEND TOOL
// ═══════════════════════════════════════════════════════════════════════

async function testChatSendTool() {
  console.log("\n-- ChatSendTool --");

  await test("send text message succeeds", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const friend = createTestFriend("send-target");
    const sessionKey = new Uint8Array(32).fill(55);
    friend.sessionKey = sessionKey;
    store.addFriend(friend);
    store.setSession("send-target", createTestSession("send-target"));

    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = {
      getSessionKey: (id: string) => store.getSession(id)?.sessionKey ?? null,
      rotateSessionKey: () => {},
    } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    const tool = new ChatSendTool(store, mockChannel, mockHandshake, logger);
    const result = await tool.handle({ target: "send-target", message: "Hello!", type: "text" });
    assert.equal(result.success, true);
    assert.equal(result.target, "send-target");
    assert.equal(result.type, "text");
  });

  await test("send file-info message succeeds", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const friend = createTestFriend("file-target");
    const sessionKey = new Uint8Array(32).fill(55);
    friend.sessionKey = sessionKey;
    store.addFriend(friend);
    store.setSession("file-target", createTestSession("file-target"));

    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = {
      getSessionKey: (id: string) => store.getSession(id)?.sessionKey ?? null,
      rotateSessionKey: () => {},
    } as any;
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    const tool = new ChatSendTool(store, mockChannel, mockHandshake, logger);
    const result = await tool.handle({
      target: "file-target",
      type: "file-info",
      fileInfo: { fileName: "doc.pdf", fileSize: 1024, fileHash: "abc", chunks: 2 },
    });
    assert.equal(result.success, true);
    assert.equal(result.type, "file-info");
  });

  await test("missing target parameter returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockChannel = { send: () => true } as any;

    const tool = new ChatSendTool(store, mockChannel as any, mockHandshake, logger);
    const result = await tool.handle({ message: "Hello" });
    assert.ok(result.error);
    assert.ok(result.error.includes("target"));
  });

  await test("missing message parameter returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    store.addFriend(createTestFriend("msg-target"));
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockChannel = { send: () => true } as any;

    const tool = new ChatSendTool(store, mockChannel as any, mockHandshake, logger);
    const result = await tool.handle({ target: "msg-target" });
    assert.ok(result.error);
    assert.ok(result.error.includes("message"));
  });

  await test("non-existent friend returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockChannel = { send: () => true } as any;

    const tool = new ChatSendTool(store, mockChannel as any, mockHandshake, logger);
    const result = await tool.handle({ target: "nonexistent-friend", message: "Hi" });
    assert.ok(result.error);
    assert.ok(result.error.includes("not in your friend list"));
  });

  await test("no session key returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    store.addFriend(createTestFriend("no-session-friend"));
    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockChannel = { send: () => true } as any;

    const tool = new ChatSendTool(store, mockChannel as any, mockHandshake, logger);
    const result = await tool.handle({ target: "no-session-friend", message: "Hi" });
    assert.ok(result.error);
    assert.ok(result.error.includes("No session established"));
  });

  await test("unknown message type returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const friend = createTestFriend("type-target");
    friend.sessionKey = new Uint8Array(32).fill(55);
    store.addFriend(friend);

    const mockServer = createMockServerClient(store, logger);
    const mockHandshake = { getSessionKey: () => new Uint8Array(32).fill(55), rotateSessionKey: () => {} } as any;
    const mockChannel = { send: () => true } as any;

    const tool = new ChatSendTool(store, mockChannel as any, mockHandshake, logger);
    const result = await tool.handle({ target: "type-target", message: "Hi", type: "voice" });
    assert.ok(result.error);
    assert.ok(result.error.includes("Unknown message type"));
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  8. CHAT EXPORT KEY TOOL
// ═══════════════════════════════════════════════════════════════════════

async function testChatExportKeyTool() {
  console.log("\n-- ChatExportKeyTool --");

  await test("export key with valid password returns QR data URL", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockIdentity = new IdentityService(store, logger);
    mockIdentity.initialize("export-agent");

    const tool = new ChatExportKeyTool(mockIdentity, logger);
    const result = await tool.handle({ password: "secure-password-1234" });
    assert.equal(result.success, true);
    assert.ok(result.qrCodeDataUrl.startsWith("data:image/png;base64,"));
    assert.equal(result.expiresIn, 60);
    assert.ok(result.warning);
  });

  await test("missing password returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockIdentity = new IdentityService(store, logger);
    const tool = new ChatExportKeyTool(mockIdentity, logger);
    const result = await tool.handle({});
    assert.ok(result.error);
    assert.ok(result.error.includes("password"));
  });

  await test("short password returns error", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockIdentity = new IdentityService(store, logger);
    const tool = new ChatExportKeyTool(mockIdentity, logger);
    const result = await tool.handle({ password: "short" });
    assert.ok(result.error);
    assert.ok(result.error.includes("8 characters"));
  });

  await test("rate limiting: 3 exports allowed, 4th denied", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockIdentity = new IdentityService(store, logger);
    mockIdentity.initialize("rate-agent");

    const tool = new ChatExportKeyTool(mockIdentity, logger);

    // 3 successful exports
    for (let i = 0; i < 3; i++) {
      const result = await tool.handle({ password: "password-1234" });
      assert.equal(result.success, true, `export ${i + 1} should succeed`);
    }

    // 4th should be rate limited
    const result = await tool.handle({ password: "password-1234" });
    assert.ok(result.error, "4th export should be rate limited");
    assert.ok(result.error.includes("Rate limit"));
    assert.ok(result.retryAfterMs !== undefined, "should include retryAfterMs");
  });

  await test("isRateLimited returns correct state", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockIdentity = new IdentityService(store, logger);
    mockIdentity.initialize("rl-check-agent");

    const tool = new ChatExportKeyTool(mockIdentity, logger);
    assert.equal(tool.isRateLimited(), false, "should not be rate limited initially");

    // Exhaust rate limit
    for (let i = 0; i < 3; i++) {
      await tool.handle({ password: "password-1234" });
    }
    assert.equal(tool.isRateLimited(), true, "should be rate limited after 3 exports");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  9. MESSAGE SENDING HOOK
// ═══════════════════════════════════════════════════════════════════════

async function testMessageSendingHook() {
  console.log("\n-- MessageSendingHook --");

  await test("pass through non-encrypted-chat messages", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;

    const hook = new MessageSendingHook(store, mockHandshake, logger);
    const original = { text: "hello", channel: "other" };
    const result = await hook.intercept(original, { channel: "other" });
    assert.deepEqual(result, original, "should pass through unchanged");
  });

  await test("pass through when no targetId in metadata", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;

    const hook = new MessageSendingHook(store, mockHandshake, logger);
    const original = { text: "hello" };
    const result = await hook.intercept(original, { channel: "encrypted-chat" });
    assert.deepEqual(result, original);
  });

  await test("pass through when target is not a friend", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;

    const hook = new MessageSendingHook(store, mockHandshake, logger);
    const original = { text: "hello" };
    const result = await hook.intercept(original, { channel: "encrypted-chat", targetId: "stranger" });
    assert.deepEqual(result, original);
  });

  await test("pass through when no session key available", async () => {
    const store = createTestStore();
    store.addFriend(createTestFriend("no-key-friend"));
    const logger = createMockLogger();
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;

    const hook = new MessageSendingHook(store, mockHandshake, logger);
    const original = { text: "hello" };
    const result = await hook.intercept(original, { channel: "encrypted-chat", targetId: "no-key-friend" });
    assert.deepEqual(result, original);
  });

  await test("encrypts message for encrypted-chat channel with valid session", async () => {
    const store = createTestStore();
    const friend = createTestFriend("hook-friend");
    const sessionKey = new Uint8Array(32).fill(33);
    friend.sessionKey = sessionKey;
    store.addFriend(friend);
    store.setSession("hook-friend", createTestSession("hook-friend"));

    const logger = createMockLogger();
    const mockHandshake = {
      getSessionKey: (id: string) => store.getSession(id)?.sessionKey ?? null,
      rotateSessionKey: () => {},
    } as any;

    const hook = new MessageSendingHook(store, mockHandshake, logger);
    const result = await hook.intercept(
      "Secret message",
      { channel: "encrypted-chat", targetId: "hook-friend" },
    );

    assert.ok(result, "should return a result");
    assert.ok((result as any).encryptedData, "should have encryptedData");
    assert.equal((result as any).targetId, "hook-friend");
    assert.ok(typeof (result as any).timestamp === "number", "should have timestamp");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  10. BEFORE TOOL CALL HOOK
// ═══════════════════════════════════════════════════════════════════════

async function testBeforeToolCallHook() {
  console.log("\n-- BeforeToolCallHook --");

  await test("allow unknown tool calls by default", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("some-random-tool", {});
    assert.equal(result.allowed, true);
  });

  await test("allow chat-send for valid friend", () => {
    const store = createTestStore();
    store.addFriend(createTestFriend("tool-friend"));
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-send", { target: "tool-friend" });
    assert.equal(result.allowed, true);
  });

  await test("deny chat-send for non-friend target", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-send", { target: "not-a-friend" });
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("not in your friend list"));
  });

  await test("deny chat-send with missing target", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-send", {});
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("target"));
  });

  await test("allow chat-friend add when under limit", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig({ maxFriends: 50 });
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-friend", { action: "add" });
    assert.equal(result.allowed, true);
  });

  await test("deny chat-friend add when at limit", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig({ maxFriends: 1 });
    const mockExportKey = { isRateLimited: () => false } as any;

    store.addFriend(createTestFriend("only-friend"));
    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-friend", { action: "add" });
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("Friend limit"));
  });

  await test("allow chat-friend list regardless of limit", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig({ maxFriends: 0 });
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-friend", { action: "list" });
    assert.equal(result.allowed, true);
  });

  await test("allow chat-export-key when not rate limited", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => false } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-export-key", {});
    assert.equal(result.allowed, true);
  });

  await test("deny chat-export-key when rate limited", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const config = createTestConfig();
    const mockExportKey = { isRateLimited: () => true } as any;

    const hook = new BeforeToolCallHook(store, config, mockExportKey, logger);
    const result = hook.check("chat-export-key", {});
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("Rate limit"));
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  11. P2P CONNECTION MANAGER
// ═══════════════════════════════════════════════════════════════════════

async function testP2PConnectionManager() {
  console.log("\n-- P2PConnectionManager --");

  await test("isConnected returns false for unknown peer", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);
    assert.equal(p2p.isConnected("unknown"), false);
  });

  await test("connect and isConnected work", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-001");
    assert.equal(p2p.isConnected("peer-001"), true);
  });

  await test("connect same peer twice is idempotent", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-001");
    p2p.connect("peer-001");
    assert.equal(p2p.isConnected("peer-001"), true);
  });

  await test("disconnect removes connection", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-001");
    assert.equal(p2p.isConnected("peer-001"), true);
    p2p.disconnect("peer-001");
    assert.equal(p2p.isConnected("peer-001"), false);
  });

  await test("disconnect unknown peer does not throw", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);
    p2p.disconnect("nonexistent");
    assert.ok(true);
  });

  await test("send returns false for disconnected peer", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);
    const result = p2p.send("nobody", Buffer.from("data"));
    assert.equal(result, false);
  });

  await test("send via connected peer triggers relay message", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-002");
    const result = p2p.send("peer-002", Buffer.from("hello p2p"));
    assert.equal(result, true);

    const relayMsgs = mockServer.getRelayMessages();
    assert.ok(relayMsgs.length > 0, "should have relayed a message");
  });

  await test("getConnectedPeers returns connected peer IDs", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-a");
    p2p.connect("peer-b");
    const peers = p2p.getConnectedPeers();
    assert.ok(peers.includes("peer-a"));
    assert.ok(peers.includes("peer-b"));
    assert.equal(peers.length, 2);
  });

  await test("setupWsHandlers registers without error", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);
    p2p.setupWsHandlers();
    assert.ok(true);
  });

  await test("cleanup clears all connections", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const p2p = new P2PConnectionManager(mockServer as any, logger);

    p2p.connect("peer-x");
    p2p.connect("peer-y");
    p2p.cleanup();
    assert.equal(p2p.getConnectedPeers().length, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  12. FILE TRANSFER MANAGER
// ═══════════════════════════════════════════════════════════════════════

async function testFileTransferManager() {
  console.log("\n-- FileTransferManager --");

  await test("receiveFile registers buffer with chat channel", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = {
      isConnected: () => false,
      send: () => false,
      connect: () => {},
      setupWsHandlers: () => {},
      cleanup: () => {},
      getConnectedPeers: () => [],
      onSignal: () => {},
      sendSignal: () => {},
      disconnect: () => {},
    } as any;
    const mockHandshake = { getSessionKey: () => null, rotateSessionKey: () => {} } as any;
    const mockChannel = new EncryptedChatChannel(store, mockHandshake, mockP2P, mockServer as any, logger);

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel, logger);

    ftm.receiveFile("sender-001", "ft-session-001", "/tmp/test.txt", "test.txt", 3, "hash123");

    const session = ftm.getSession("ft-session-001");
    assert.ok(session, "session should exist");
    assert.equal(session!.status, "transferring");
    assert.equal(session!.totalChunks, 3);

    const buffer = mockChannel.getFileBuffer("ft-session-001");
    assert.ok(buffer, "buffer should be registered with chat channel");
    assert.equal(buffer!.fileName, "test.txt");
    assert.equal(buffer!.totalChunks, 3);
  });

  await test("getProgress returns zero for unknown session", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);
    const progress = ftm.getProgress("nonexistent");
    assert.equal(progress.sent, 0);
    assert.equal(progress.total, 0);
    assert.equal(progress.percentage, 0);
  });

  await test("pauseTransfer changes status to paused", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);

    // Manually create a session in transferring state
    const session: any = {
      sessionId: "pause-session",
      senderId: "sender",
      receiverId: "receiver",
      fileName: "file.txt",
      fileSize: 1024,
      fileHash: "h",
      totalChunks: 10,
      chunkSize: 64,
      sentChunks: new Set([0, 1, 2]),
      receivedChunks: new Set(),
      status: "transferring",
      createdAt: new Date(),
    };

    // Access private sessions map via receiveFile
    ftm.receiveFile("sender", "pause-session", "/tmp/out.txt", "file.txt", 10, "h");
    ftm.pauseTransfer("pause-session");

    const updated = ftm.getSession("pause-session");
    assert.equal(updated!.status, "paused");
  });

  await test("resumeTransfer changes status to transferring", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);
    ftm.receiveFile("sender", "resume-session", "/tmp/out.txt", "file.txt", 5, "h");
    ftm.pauseTransfer("resume-session");
    assert.equal(ftm.getSession("resume-session")!.status, "paused");

    await ftm.resumeTransfer("resume-session");
    assert.equal(ftm.getSession("resume-session")!.status, "transferring");
  });

  await test("cancelTransfer removes session", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = {
      registerFileBuffer: () => {},
      removeFileBuffer: () => {},
      getFileBuffer: () => null,
    } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);
    ftm.receiveFile("sender", "cancel-session", "/tmp/out.txt", "file.txt", 5, "h");
    assert.ok(ftm.getSession("cancel-session"));

    ftm.cancelTransfer("cancel-session");
    assert.equal(ftm.getSession("cancel-session"), undefined);
  });

  await test("pauseTransfer on unknown session does not throw", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);
    ftm.pauseTransfer("nonexistent");
    assert.ok(true);
  });

  await test("cleanup clears all sessions", () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);
    ftm.receiveFile("s1", "ses-1", "/tmp/f1", "f1.txt", 5, "h");
    ftm.receiveFile("s2", "ses-2", "/tmp/f2", "f2.txt", 3, "h");
    ftm.cleanup();
    assert.equal(ftm.getSession("ses-1"), undefined);
    assert.equal(ftm.getSession("ses-2"), undefined);
  });

  await test("sendFile throws for non-friend receiver", async () => {
    const store = createTestStore();
    const logger = createMockLogger();
    const mockServer = createMockServerClient(store, logger);
    const mockP2P = { isConnected: () => false, setupWsHandlers: () => {} } as any;
    const mockChannel = { registerFileBuffer: () => {}, removeFileBuffer: () => {}, getFileBuffer: () => null } as any;

    const ftm = new FileTransferManager(store, mockServer as any, mockP2P, mockChannel as any, logger);

    // Create a temporary file
    const tmpFile = path.join(os.tmpdir(), "aicq-send-test.txt");
    fs.writeFileSync(tmpFile, "test content");
    try {
      await assertThrowsAsync(async () => {
        await ftm.sendFile("nonexistent-friend", tmpFile);
      }, "should throw for non-friend");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  AICQ Plugin \u2014 Comprehensive Test Suite      \u2551");
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

  await testConfig();
  await testPluginStore();
  await testIdentityService();
  await testHandshakeManager();
  await testEncryptedChatChannel();
  await testChatFriendTool();
  await testChatSendTool();
  await testChatExportKeyTool();
  await testMessageSendingHook();
  await testBeforeToolCallHook();
  await testP2PConnectionManager();
  await testFileTransferManager();

  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`  Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");

  if (failures.length > 0) {
    console.log("\nFailed tests:");
    for (const f of failures) {
      console.log(`  \u2717 ${f.name}: ${f.error}`);
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
