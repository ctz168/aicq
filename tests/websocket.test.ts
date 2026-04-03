/**
 * WebSocket handler tests for @aicq/server
 *
 * Tests WebSocket connection, online/offline, signal relay,
 * message relay, file chunk relay, malformed messages, and heartbeat.
 */

import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { Buffer } from "node:buffer";
import WebSocket from "ws";

// ─── Minimal test runner ────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;
const failures: { name: string; error: string }[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    totalPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    totalFailed++;
    const msg = err?.message || String(err);
    failures.push({ name, error: msg });
    console.log(`  ✗ ${name}`);
    console.log(`    → ${msg}`);
  }
}

// ─── HTTP helpers ───────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function httpRequest(
  options: http.RequestOptions,
  body?: string | object,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
      });
    });
    req.on("error", reject);

    if (body) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      req.setHeader("Content-Type", "application/json");
      req.setHeader("Content-Length", Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

function post(
  baseUrl: string,
  path: string,
  body?: object,
): Promise<{ status: number; body: any }> {
  const url = new URL(path, baseUrl);
  return httpRequest(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "POST",
    },
    body,
  ).then(({ status, body }) => ({ status, body }));
}

// ─── WebSocket helpers ──────────────────────────────────────────────

function wsConnect(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on("open", () => resolve(ws));
    ws.on("error", (err) => reject(err));
    // Timeout to avoid hanging
    setTimeout(() => reject(new Error("WS connection timeout")), 5000);
  });
}

function wsSend(ws: WebSocket, data: object): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(data), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function wsMessage(ws: WebSocket, timeoutMs: number = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener("message", handler);
      reject(new Error("WS message timeout"));
    }, timeoutMs);

    function handler(data: WebSocket.Data) {
      clearTimeout(timer);
      ws.removeListener("message", handler);
      try {
        resolve(JSON.parse(data.toString()));
      } catch {
        resolve(data.toString());
      }
    }

    ws.on("message", handler);
  });
}

function wsClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.on("close", () => resolve());
    ws.close();
    // Also resolve on error in case close is already happening
    ws.on("error", () => resolve());
  });
}

// ─── Server bootstrap ───────────────────────────────────────────────

let baseUrl: string;
let wsUrl: string;
let serverInstance: any;

async function startServer(): Promise<void> {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.DOMAIN = "test.aicq.local";
  process.env.MAX_FRIENDS = "200";
  process.env.TEMP_NUMBER_TTL_HOURS = "24";
  process.env.RATE_LIMIT_DISABLED = "true";

  const mod = await import("../aicq-server/dist/index.js");
  serverInstance = mod.server;

  if (!serverInstance.listening) {
    await new Promise<void>((resolve) => {
      serverInstance.on("listening", resolve);
    });
  }

  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
  console.log(`\n  Server running on ${baseUrl}, WS: ${wsUrl}`);
}

async function stopServer(): Promise<void> {
  if (serverInstance) {
    return new Promise<void>((resolve) => {
      serverInstance.close(() => resolve());
    });
  }
}

// ─── Shared state ───────────────────────────────────────────────────

const nodeAId = "ws-node-a-" + Math.random().toString(36).slice(2, 8);
const nodeBId = "ws-node-b-" + Math.random().toString(36).slice(2, 8);

/**
 * Helper: register two nodes and make them friends via HTTP, then
 * return their IDs.
 */
async function setupFriendNodes(): Promise<void> {
  // Register both nodes
  await post(baseUrl, "/api/v1/node/register", { id: nodeAId, publicKey: "pub-key-A" });
  await post(baseUrl, "/api/v1/node/register", { id: nodeBId, publicKey: "pub-key-B" });

  // Get temp number for B
  const { body: tnBody } = await post(baseUrl, "/api/v1/temp-number/request", { nodeId: nodeBId });
  const tempNumber = tnBody.number;

  // Initiate handshake A → B
  const { body: hsBody } = await post(baseUrl, "/api/v1/handshake/initiate", {
    requesterId: nodeAId,
    targetTempNumber: tempNumber,
  });
  const sessionId = hsBody.sessionId;

  // Respond (B responds)
  await post(baseUrl, "/api/v1/handshake/respond", {
    sessionId,
    responseData: Buffer.from("mock-response").toString("base64"),
  });

  // Confirm (A confirms)
  await post(baseUrl, "/api/v1/handshake/confirm", {
    sessionId,
    confirmData: Buffer.from("mock-confirm").toString("base64"),
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  1. WEBSOCKET CONNECTION
// ═══════════════════════════════════════════════════════════════════════

async function testWebSocketConnection() {
  console.log("\n── WebSocket Connection ──");

  await test("Connect to /ws → connection succeeds", async () => {
    const ws = await wsConnect(wsUrl);
    assert.equal(ws.readyState, WebSocket.OPEN, "WebSocket should be open");
    await wsClose(ws);
  });

  await test("Connect to /ws with multiple clients → all succeed", async () => {
    const ws1 = await wsConnect(wsUrl);
    const ws2 = await wsConnect(wsUrl);
    const ws3 = await wsConnect(wsUrl);

    assert.equal(ws1.readyState, WebSocket.OPEN, "ws1 should be open");
    assert.equal(ws2.readyState, WebSocket.OPEN, "ws2 should be open");
    assert.equal(ws3.readyState, WebSocket.OPEN, "ws3 should be open");

    await wsClose(ws1);
    await wsClose(ws2);
    await wsClose(ws3);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  2. ONLINE / OFFLINE
// ═══════════════════════════════════════════════════════════════════════

async function testOnlineOffline() {
  console.log("\n── Online / Offline ──");

  // Register the node via HTTP first
  await post(baseUrl, "/api/v1/node/register", { id: nodeAId, publicKey: "pub-key-A" });

  await test("Register node via WS online message → online_ack", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "online", nodeId: nodeAId });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "online_ack", "should receive online_ack");
    assert.equal(msg.nodeId, nodeAId, "should echo nodeId");

    // Verify node is online via service import
    const { isOnline } = await import("../aicq-server/dist/services/p2pDiscoveryService.js");
    assert.equal(isOnline(nodeAId), true, "node should be marked as online");

    await wsClose(ws);
  });

  await test("Disconnect WS → node goes offline", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "online", nodeId: nodeAId });
    await wsMessage(ws); // consume online_ack

    const { isOnline } = await import("../aicq-server/dist/services/p2pDiscoveryService.js");
    assert.equal(isOnline(nodeAId), true, "node should be online before disconnect");

    await wsClose(ws);

    // Give a small delay for the close event to propagate
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(isOnline(nodeAId), false, "node should be offline after disconnect");
  });

  await test("Online with unregistered nodeId → error", async () => {
    const ws = await wsConnect(wsUrl);
    const fakeId = "unregistered-node-" + Math.random().toString(36).slice(2, 8);

    await wsSend(ws, { type: "online", nodeId: fakeId });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error");
    assert.ok(msg.error.includes("not registered") || msg.error.includes("Node not"), `should mention not registered: ${msg.error}`);

    await wsClose(ws);
  });

  await test("Online with missing nodeId → error", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "online" }); // no nodeId
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error");
    assert.ok(msg.error.includes("Missing") || msg.error.includes("nodeId"), `should mention missing nodeId: ${msg.error}`);

    await wsClose(ws);
  });

  await test("Explicit offline message → node goes offline", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "online", nodeId: nodeAId });
    await wsMessage(ws); // consume online_ack

    const { isOnline } = await import("../aicq-server/dist/services/p2pDiscoveryService.js");
    assert.equal(isOnline(nodeAId), true, "should be online");

    await wsSend(ws, { type: "offline" });

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(isOnline(nodeAId), false, "should be offline after explicit offline message");

    await wsClose(ws);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  3. SIGNAL RELAY
// ═══════════════════════════════════════════════════════════════════════

async function testSignalRelay() {
  console.log("\n── Signal Relay ──");

  await setupFriendNodes();

  await test("Send signal from A to B → B receives it", async () => {
    const wsA = await wsConnect(wsUrl);
    const wsB = await wsConnect(wsUrl);

    // Register both online
    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA); // online_ack

    await wsSend(wsB, { type: "online", nodeId: nodeBId });
    await wsMessage(wsB); // online_ack

    // Small delay for online status to propagate
    await new Promise((r) => setTimeout(r, 50));

    // A sends signal to B
    const signalData = { type: "ice-candidate", candidate: "sdp-candidate-123" };
    await wsSend(wsA, { type: "signal", to: nodeBId, data: signalData });

    // B should receive the signal
    const msg = await wsMessage(wsB);
    assert.equal(msg.type, "signal", "B should receive signal message");
    assert.equal(msg.from, nodeAId, "signal should be from nodeA");
    assert.equal(msg.to, nodeBId, "signal should be to nodeB");
    assert.deepEqual(msg.data, signalData, "signal data should match");
    assert.ok(msg.timestamp, "signal should have timestamp");

    await wsClose(wsA);
    await wsClose(wsB);
  });

  await test("Send signal to offline node → error", async () => {
    const wsA = await wsConnect(wsUrl);

    // Only A is online, B is offline
    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA); // online_ack

    // A tries to signal B (who is offline)
    await wsSend(wsA, { type: "signal", to: nodeBId, data: { test: "data" } });
    const msg = await wsMessage(wsA);

    assert.equal(msg.type, "error", "should receive error for offline target");
    assert.ok(msg.error.includes("offline") || msg.error.includes("Target"), `should mention offline: ${msg.error}`);

    await wsClose(wsA);
  });

  await test("Send signal without being online → error (not authenticated)", async () => {
    const ws = await wsConnect(wsUrl);
    // Don't register online

    await wsSend(ws, { type: "signal", to: nodeBId, data: { test: "data" } });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error for unauthenticated signal");
    assert.ok(
      msg.error.includes("Not authenticated") || msg.error.includes("authenticated"),
      `should mention not authenticated: ${msg.error}`,
    );

    await wsClose(ws);
  });

  await test("Send signal to non-friend → error", async () => {
    const strangerId = "stranger-" + Math.random().toString(36).slice(2, 8);
    await post(baseUrl, "/api/v1/node/register", { id: strangerId, publicKey: "stranger-key" });

    const wsA = await wsConnect(wsUrl);
    const wsStranger = await wsConnect(wsUrl);

    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA);

    await wsSend(wsStranger, { type: "online", nodeId: strangerId });
    await wsMessage(wsStranger);

    await new Promise((r) => setTimeout(r, 50));

    // A tries to signal the stranger
    await wsSend(wsA, { type: "signal", to: strangerId, data: { test: "data" } });
    const msg = await wsMessage(wsA);

    assert.equal(msg.type, "error", "should receive error for non-friend signal");
    assert.ok(
      msg.error.includes("non-friend") || msg.error.includes("Cannot signal"),
      `should mention non-friend: ${msg.error}`,
    );

    await wsClose(wsA);
    await wsClose(wsStranger);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  4. MESSAGE RELAY
// ═══════════════════════════════════════════════════════════════════════

async function testMessageRelay() {
  console.log("\n── Message Relay ──");

  await test("Send encrypted message from A to B → B receives it", async () => {
    const wsA = await wsConnect(wsUrl);
    const wsB = await wsConnect(wsUrl);

    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA);

    await wsSend(wsB, { type: "online", nodeId: nodeBId });
    await wsMessage(wsB);

    await new Promise((r) => setTimeout(r, 50));

    // A sends message to B
    const messageData = { encrypted: "c2VjcmV0LW1lc3NhZ2U=", nonce: "dGVzdC1ub25jZQ==" };
    await wsSend(wsA, { type: "message", to: nodeBId, data: messageData });

    // B receives it
    const msg = await wsMessage(wsB);
    assert.equal(msg.type, "signal", "message relay arrives as signal type");
    assert.equal(msg.from, nodeAId, "should be from A");
    assert.equal(msg.data.type, "message", "data should have type=message");
    assert.deepEqual(msg.data.data, messageData, "data should match original message");

    await wsClose(wsA);
    await wsClose(wsB);
  });

  await test("Send message to offline friend → error", async () => {
    const wsA = await wsConnect(wsUrl);

    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA);

    // B is offline, try to send message
    await wsSend(wsA, { type: "message", to: nodeBId, data: { test: "data" } });
    const msg = await wsMessage(wsA);

    assert.equal(msg.type, "error", "should receive error for offline target");
    assert.ok(
      msg.error.includes("offline") || msg.error.includes("Target"),
      `should mention offline: ${msg.error}`,
    );

    await wsClose(wsA);
  });

  await test("Send message without online registration → error", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "message", to: nodeBId, data: { test: "data" } });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error for unauthenticated message");

    await wsClose(ws);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  5. FILE CHUNK RELAY
// ═══════════════════════════════════════════════════════════════════════

async function testFileChunkRelay() {
  console.log("\n── File Chunk Relay ──");

  await test("Send file chunk from A to B → B receives it", async () => {
    const wsA = await wsConnect(wsUrl);
    const wsB = await wsConnect(wsUrl);

    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA);

    await wsSend(wsB, { type: "online", nodeId: nodeBId });
    await wsMessage(wsB);

    await new Promise((r) => setTimeout(r, 50));

    // A sends file chunk to B
    const chunkData = {
      sessionId: "file-session-123",
      chunkIndex: 0,
      data: Buffer.from("binary-file-chunk-data").toString("base64"),
    };
    await wsSend(wsA, { type: "file_chunk", to: nodeBId, data: chunkData });

    // B receives it
    const msg = await wsMessage(wsB);
    assert.equal(msg.type, "signal", "file chunk relay arrives as signal type");
    assert.equal(msg.from, nodeAId, "should be from A");
    assert.equal(msg.data.type, "file_chunk", "data should have type=file_chunk");
    assert.deepEqual(msg.data.data, chunkData, "data should match original chunk");

    await wsClose(wsA);
    await wsClose(wsB);
  });

  await test("Send file chunk to non-friend → error", async () => {
    const strangerId = "file-stranger-" + Math.random().toString(36).slice(2, 8);
    await post(baseUrl, "/api/v1/node/register", { id: strangerId, publicKey: "stranger-key" });

    const wsA = await wsConnect(wsUrl);
    const wsStranger = await wsConnect(wsUrl);

    await wsSend(wsA, { type: "online", nodeId: nodeAId });
    await wsMessage(wsA);

    await wsSend(wsStranger, { type: "online", nodeId: strangerId });
    await wsMessage(wsStranger);

    await new Promise((r) => setTimeout(r, 50));

    await wsSend(wsA, { type: "file_chunk", to: strangerId, data: { chunk: "data" } });
    const msg = await wsMessage(wsA);

    assert.equal(msg.type, "error", "should receive error for non-friend file chunk");
    assert.ok(
      msg.error.includes("friends") || msg.error.includes("Can only"),
      `should mention friends restriction: ${msg.error}`,
    );

    await wsClose(wsA);
    await wsClose(wsStranger);
  });

  await test("Send file chunk without online registration → error", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "file_chunk", to: nodeBId, data: { chunk: "data" } });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error for unauthenticated file chunk");

    await wsClose(ws);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  6. INVALID MESSAGES
// ═══════════════════════════════════════════════════════════════════════

async function testInvalidMessages() {
  console.log("\n── Invalid Messages ──");

  await test("Malformed JSON → error response, no crash", async () => {
    const ws = await wsConnect(wsUrl);

    ws.send("{not valid json!!!");

    const msg = await wsMessage(ws);
    assert.equal(msg.type, "error", "should receive error for malformed JSON");
    assert.ok(
      msg.error.includes("Invalid") || msg.error.includes("format"),
      `should mention invalid format: ${msg.error}`,
    );

    // Verify connection is still alive
    assert.equal(ws.readyState, WebSocket.OPEN, "connection should still be open");

    await wsClose(ws);
  });

  await test("Unknown message type → error response", async () => {
    const ws = await wsConnect(wsUrl);

    await wsSend(ws, { type: "unknown_type_xyz", data: "test" });
    const msg = await wsMessage(ws);

    assert.equal(msg.type, "error", "should receive error for unknown type");
    assert.ok(
      msg.error.includes("Unknown") || msg.error.includes("unknown"),
      `should mention unknown type: ${msg.error}`,
    );

    // Connection still alive
    assert.equal(ws.readyState, WebSocket.OPEN, "connection should still be open");

    await wsClose(ws);
  });

  await test("Binary data → error response, no crash", async () => {
    const ws = await wsConnect(wsUrl);

    ws.send(Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const msg = await wsMessage(ws);
    assert.equal(msg.type, "error", "should receive error for binary data");

    assert.equal(ws.readyState, WebSocket.OPEN, "connection should still be open");

    await wsClose(ws);
  });

  await test("Empty string → error response, no crash", async () => {
    const ws = await wsConnect(wsUrl);

    ws.send("");

    const msg = await wsMessage(ws);
    assert.equal(msg.type, "error", "should receive error for empty string");

    assert.equal(ws.readyState, WebSocket.OPEN, "connection should still be open");

    await wsClose(ws);
  });

  await test("Multiple invalid messages in sequence → no crash", async () => {
    const ws = await wsConnect(wsUrl);

    for (let i = 0; i < 5; i++) {
      ws.send("invalid-json-" + i);
      const msg = await wsMessage(ws);
      assert.equal(msg.type, "error", `message ${i} should return error`);
    }

    assert.equal(ws.readyState, WebSocket.OPEN, "connection should still be open after multiple invalid messages");

    // Verify we can still use the connection normally
    await post(baseUrl, "/api/v1/node/register", { id: "post-burst-node", publicKey: "key" });
    await wsSend(ws, { type: "online", nodeId: "post-burst-node" });
    const msg = await wsMessage(ws);
    assert.equal(msg.type, "online_ack", "should still work normally after invalid messages");

    await wsClose(ws);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  7. HEARTBEAT (PING/PONG)
// ═══════════════════════════════════════════════════════════════════════

async function testHeartbeat() {
  console.log("\n── Heartbeat (Ping/Pong) ──");

  await test("WebSocket ping → pong response", async () => {
    const ws = await wsConnect(wsUrl);

    // The 'ws' library handles ping/pong at the protocol level
    // We verify by checking the connection stays alive after ping
    const pongReceived = await new Promise<boolean>((resolve) => {
      ws.ping();
      ws.on("pong", () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });

    assert.equal(pongReceived, true, "should receive pong in response to ping");

    await wsClose(ws);
  });

  await test("Multiple pings → connection stays alive", async () => {
    const ws = await wsConnect(wsUrl);

    let pongCount = 0;
    ws.on("pong", () => { pongCount++; });

    // Send 3 pings
    for (let i = 0; i < 3; i++) {
      ws.ping();
    }

    await new Promise((r) => setTimeout(r, 500));
    assert.equal(pongCount, 3, "should receive pong for each ping");
    assert.equal(ws.readyState, WebSocket.OPEN, "connection should stay alive");

    await wsClose(ws);
  });

  await test("Server does not close connection on inactivity (short wait)", async () => {
    const ws = await wsConnect(wsUrl);

    // Wait 2 seconds without sending anything
    await new Promise((r) => setTimeout(r, 2000));

    assert.equal(ws.readyState, WebSocket.OPEN, "connection should stay open during brief inactivity");

    await wsClose(ws);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  @aicq/server — WebSocket Handler Tests  ║");
  console.log("╚══════════════════════════════════════════╝");

  await startServer();

  try {
    await testWebSocketConnection();
    await testOnlineOffline();
    await testSignalRelay();
    await testMessageRelay();
    await testFileChunkRelay();
    await testInvalidMessages();
    await testHeartbeat();
  } finally {
    await stopServer();
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`  Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("══════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nFailed tests:");
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
