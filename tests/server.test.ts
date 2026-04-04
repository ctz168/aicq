/**
 * Server API tests for @aicq/server
 *
 * Uses Node's built-in http module (no supertest).
 * Dynamically imports the server module on a random port, then makes HTTP requests.
 */

import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { Buffer } from "node:buffer";

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

function get(
  baseUrl: string,
  path: string,
): Promise<{ status: number; body: any }> {
  const url = new URL(path, baseUrl);
  return httpRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: "GET",
  }).then(({ status, body }) => ({ status, body }));
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

function del(
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
      method: "DELETE",
    },
    body,
  ).then(({ status, body }) => ({ status, body }));
}

// ─── Server bootstrap ───────────────────────────────────────────────

let baseUrl: string;
let serverInstance: any;

async function startServer(): Promise<void> {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.DOMAIN = "test.aicq.local";
  process.env.MAX_FRIENDS = "200";
  process.env.TEMP_NUMBER_TTL_HOURS = "24";
  // Disable rate limiting in tests
  process.env.RATE_LIMIT_DISABLED = "true";

  // Dynamic import triggers server.listen()
  const mod = await import("../aicq-server/dist/index.js");
  serverInstance = mod.server;

  // Wait for server to be ready
  if (!serverInstance.listening) {
    await new Promise<void>((resolve) => {
      serverInstance.on("listening", resolve);
    });
  }

  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n  Server running on ${baseUrl}`);
}

async function stopServer(): Promise<void> {
  if (serverInstance) {
    return new Promise<void>((resolve) => {
      serverInstance.close(() => resolve());
    });
  }
}

// ─── Shared state ───────────────────────────────────────────────────

let nodeAId = "test-node-a-" + Math.random().toString(36).slice(2, 8);
let nodeBId = "test-node-b-" + Math.random().toString(36).slice(2, 8);
let tempNumber = "";
let handshakeSessionId = "";

// ═══════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testHealthEndpoint() {
  console.log("\n── Health Check ──");

  await test("GET /health returns status ok", async () => {
    const { status, body } = await get(baseUrl, "/health");
    assert.equal(status, 200, "should return 200");
    assert.equal(body.status, "ok", "status should be 'ok'");
    assert.ok(body.uptime !== undefined, "should include uptime");
    assert.ok(body.timestamp !== undefined, "should include timestamp");
  });
}

async function testNodeRegistration() {
  console.log("\n── Node Registration ──");

  await test("POST /api/v1/node/register registers a node", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/node/register", {
      id: nodeAId,
      publicKey: "test-public-key-A",
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.id, nodeAId, "should return the node id");
    assert.equal(body.registered, true, "should indicate registered");
    assert.equal(typeof body.friendCount, "number", "should return friend count");
  });

  await test("POST /api/v1/node/register returns 400 for missing fields", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/node/register", {
      id: "incomplete-node",
      // missing publicKey
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing fields");
  });

  await test("POST /api/v1/node/register registers second node", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/node/register", {
      id: nodeBId,
      publicKey: "test-public-key-B",
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.id, nodeBId, "should return the node id");
    assert.equal(body.registered, true, "should indicate registered");
  });
}

async function testTempNumber() {
  console.log("\n── Temp Number ──");

  await test("POST /api/v1/temp-number/request returns 6-digit number (100000-999999)", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/temp-number/request", {
      nodeId: nodeBId,
    });
    assert.equal(status, 200, "should return 200");
    assert.ok(body.number, "should return a number");
    assert.ok(
      /^\d{6}$/.test(body.number),
      `number should be exactly 6 digits, got "${body.number}"`,
    );
    const num = parseInt(body.number, 10);
    assert.ok(num >= 100000 && num <= 999999, "number should be in range 100000-999999");
    assert.ok(body.expiresAt > Date.now(), "expiresAt should be in the future");
    assert.ok(body.ttlMs > 0, "ttlMs should be positive");

    tempNumber = body.number;
  });

  await test("POST /api/v1/temp-number/request returns 400 for missing nodeId", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/temp-number/request", {});
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing field");
  });

  await test("GET /api/v1/temp-number/:number resolves to correct nodeId", async () => {
    const { status, body } = await get(baseUrl, `/api/v1/temp-number/${tempNumber}`);
    assert.equal(status, 200, "should return 200");
    assert.equal(body.nodeId, nodeBId, "should resolve to NodeB's id");
    assert.ok(body.expiresAt, "should include expiresAt");
  });

  await test("GET /api/v1/temp-number/:number returns 404 for unknown number", async () => {
    const { status, body } = await get(baseUrl, "/api/v1/temp-number/000000");
    assert.equal(status, 404, "should return 404 for unknown number");
    assert.ok(body.error, "should include error message");
  });

  await test("DELETE /api/v1/temp-number/:number revokes the number", async () => {
    // First request a new number to revoke (don't revoke the one we need for handshake)
    const { body: reqBody } = await post(baseUrl, "/api/v1/temp-number/request", {
      nodeId: nodeAId,
    });
    const revokeNum = reqBody.number;

    const { status, body } = await del(baseUrl, `/api/v1/temp-number/${revokeNum}`, {
      nodeId: nodeAId,
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.revoked, true, "should indicate revoked");

    // Verify it's gone
    const { status: checkStatus } = await get(baseUrl, `/api/v1/temp-number/${revokeNum}`);
    assert.equal(checkStatus, 404, "revoked number should no longer resolve");
  });

  await test("DELETE /api/v1/temp-number/:number returns 404 for wrong owner", async () => {
    const { body: reqBody } = await post(baseUrl, "/api/v1/temp-number/request", {
      nodeId: nodeAId,
    });
    const num = reqBody.number;

    // Try to revoke with wrong nodeId
    const { status } = await del(baseUrl, `/api/v1/temp-number/${num}`, {
      nodeId: nodeBId,
    });
    assert.equal(status, 404, "should return 404 for wrong owner");
  });
}

async function testHandshakeFlow() {
  console.log("\n── Handshake Flow ──");

  await test("POST /api/v1/handshake/initiate initiates handshake", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/handshake/initiate", {
      requesterId: nodeAId,
      targetTempNumber: tempNumber,
    });
    assert.equal(status, 200, "should return 200");
    assert.ok(body.sessionId, "should return sessionId");
    assert.equal(body.targetNodeId, nodeBId, "should return target node id");
    assert.equal(body.status, "initiated", "status should be 'initiated'");
    assert.ok(body.expiresAt > Date.now(), "expiresAt should be in future");

    handshakeSessionId = body.sessionId;
  });

  await test("POST /api/v1/handshake/initiate returns 400 for missing fields", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/handshake/initiate", {
      requesterId: nodeAId,
      // missing targetTempNumber
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing fields");
  });

  await test("POST /api/v1/handshake/initiate returns 400 for unregistered requester", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/handshake/initiate", {
      requesterId: "nonexistent-node",
      targetTempNumber: tempNumber,
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("not registered"), "should mention not registered");
  });

  await test("POST /api/v1/handshake/respond submits response data", async () => {
    const responseData = Buffer.from("mock-response-data").toString("base64");
    const { status, body } = await post(baseUrl, "/api/v1/handshake/respond", {
      sessionId: handshakeSessionId,
      responseData,
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.sessionId, handshakeSessionId, "should return sessionId");
    assert.equal(body.status, "responded", "status should be 'responded'");
  });

  await test("POST /api/v1/handshake/respond returns 400 for missing fields", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/handshake/respond", {
      sessionId: handshakeSessionId,
      // missing responseData
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing fields");
  });

  await test("POST /api/v1/handshake/confirm completes handshake", async () => {
    const confirmData = Buffer.from("mock-confirm-data").toString("base64");
    const { status, body } = await post(baseUrl, "/api/v1/handshake/confirm", {
      sessionId: handshakeSessionId,
      confirmData,
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.sessionId, handshakeSessionId, "should return sessionId");
    assert.equal(body.status, "confirmed", "status should be 'confirmed'");
  });

  await test("POST /api/v1/handshake/confirm returns 400 for missing fields", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/handshake/confirm", {
      sessionId: handshakeSessionId,
      // missing confirmData
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing fields");
  });
}

async function testFriendsEndpoints() {
  console.log("\n── Friends Endpoints ──");

  await test("GET /api/v1/friends?nodeId=xxx returns friends list after handshake", async () => {
    const { status, body } = await get(baseUrl, `/api/v1/friends?nodeId=${nodeAId}`);
    assert.equal(status, 200, "should return 200");
    assert.ok(Array.isArray(body.friends), "friends should be an array");
    const friendIds = body.friends.map((f: any) => f.id);
    assert.ok(friendIds.includes(nodeBId), "NodeB should be in NodeA's friends");
    assert.equal(body.count, 1, "count should be 1");
  });

  await test("GET /api/v1/friends?nodeId=xxx returns bidirectional friends", async () => {
    const { status, body } = await get(baseUrl, `/api/v1/friends?nodeId=${nodeBId}`);
    assert.equal(status, 200, "should return 200");
    assert.ok(Array.isArray(body.friends), "friends should be an array");
    const friendIds = body.friends.map((f: any) => f.id);
    assert.ok(friendIds.includes(nodeAId), "NodeA should be in NodeB's friends");
    assert.equal(body.count, 1, "count should be 1");
  });

  await test("GET /api/v1/friends returns 400 for missing nodeId", async () => {
    const { status, body } = await get(baseUrl, "/api/v1/friends");
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing parameter");
  });

  await test("DELETE /api/v1/friends/:friendId removes a friend", async () => {
    const { status, body } = await del(baseUrl, `/api/v1/friends/${nodeBId}`, {
      nodeId: nodeAId,
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.removed, true, "should indicate removed");

    // Verify it's gone
    const { body: checkBody } = await get(baseUrl, `/api/v1/friends?nodeId=${nodeAId}`);
    assert.ok(!checkBody.friends.includes(nodeBId), "NodeB should no longer be in NodeA's friends");
    assert.equal(checkBody.count, 0, "count should be 0");
  });

  await test("DELETE /api/v1/friends/:friendId returns 404 for nonexistent friendship", async () => {
    const { status } = await del(baseUrl, `/api/v1/friends/${nodeBId}`, {
      nodeId: nodeAId,
    });
    assert.equal(status, 404, "should return 404 for already removed friend");
  });

  await test("DELETE /api/v1/friends/:friendId returns 400 for missing nodeId", async () => {
    const { status, body } = await del(baseUrl, `/api/v1/friends/some-id`, {});
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing field");
  });
}

async function testFileTransferEndpoints() {
  console.log("\n── File Transfer Endpoints ──");

  let sessionId = "";

  await test("POST /api/v1/file/initiate creates a file transfer session", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/file/initiate", {
      senderId: nodeAId,
      receiverId: nodeBId,
      fileInfo: {
        fileName: "test-file.dat",
        fileSize: 1024 * 1024, // 1MB
        fileHash: "abc123",
        chunks: 10,
        chunkSize: 1024 * 102,
      },
    });
    assert.equal(status, 200, "should return 200");
    assert.ok(body.sessionId, "should return sessionId");
    assert.equal(body.status, "active", "status should be 'active'");

    sessionId = body.sessionId;
  });

  await test("POST /api/v1/file/initiate returns 400 for missing fields", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/file/initiate", {
      senderId: nodeAId,
      // missing receiverId and fileInfo
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing fields");
  });

  await test("GET /api/v1/file/:sessionId returns transfer info", async () => {
    const { status, body } = await get(baseUrl, `/api/v1/file/${sessionId}`);
    assert.equal(status, 200, "should return 200");
    assert.equal(body.id, sessionId, "should return correct session id");
    assert.equal(body.senderId, nodeAId, "should return correct sender");
    assert.equal(body.receiverId, nodeBId, "should return correct receiver");
    assert.equal(body.fileName, "test-file.dat", "should return correct file name");
    assert.equal(body.fileSize, 1024 * 1024, "should return correct file size");
    assert.equal(body.totalChunks, 10, "should return correct chunk count");
    assert.ok(body.chunksReceived, "should include chunksReceived array");
  });

  await test("GET /api/v1/file/:sessionId returns 404 for unknown session", async () => {
    const { status, body } = await get(baseUrl, "/api/v1/file/nonexistent-session");
    assert.equal(status, 404, "should return 404");
    assert.ok(body.error.includes("not found"), "should mention not found");
  });

  await test("POST /api/v1/file/:sessionId/chunk reports chunk progress", async () => {
    const { status, body } = await post(baseUrl, `/api/v1/file/${sessionId}/chunk`, {
      chunkIndex: 0,
    });
    assert.equal(status, 200, "should return 200");
    assert.equal(body.chunkIndex, 0, "should return chunk index");
    assert.equal(body.received, true, "should indicate received");
  });

  await test("POST /api/v1/file/:sessionId/chunk returns 400 for missing chunkIndex", async () => {
    const { status, body } = await post(baseUrl, `/api/v1/file/${sessionId}/chunk`, {});
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), "should mention missing field");
  });

  await test("GET /api/v1/file/:sessionId/missing returns missing chunks", async () => {
    // We only reported chunk 0, so chunks 1-9 should be missing
    const { status, body } = await get(baseUrl, `/api/v1/file/${sessionId}/missing`);
    assert.equal(status, 200, "should return 200");
    assert.ok(Array.isArray(body.missingChunks), "missingChunks should be an array");
    assert.equal(body.count, 9, "should have 9 missing chunks");
    assert.ok(!body.missingChunks.includes(0), "chunk 0 should NOT be in missing");
    assert.ok(body.missingChunks.includes(1), "chunk 1 should be in missing");
    assert.ok(body.missingChunks.includes(9), "chunk 9 should be in missing");
  });

  await test("File transfer session lifecycle: report all chunks -> no missing", async () => {
    // Report remaining chunks
    for (let i = 1; i < 10; i++) {
      const { status } = await post(baseUrl, `/api/v1/file/${sessionId}/chunk`, {
        chunkIndex: i,
      });
      assert.equal(status, 200, `chunk ${i} should be reported successfully`);
    }

    const { body } = await get(baseUrl, `/api/v1/file/${sessionId}/missing`);
    assert.equal(body.count, 0, "all chunks received, no missing");
    assert.equal(body.missingChunks.length, 0, "missingChunks should be empty");
  });
}

async function testEdgeCases() {
  console.log("\n── Edge Cases ──");

  await test("Friend count starts at 0 for a fresh node", async () => {
    const freshNodeId = "fresh-node-" + Math.random().toString(36).slice(2, 8);
    await post(baseUrl, "/api/v1/node/register", {
      id: freshNodeId,
      publicKey: "fresh-key",
    });

    const { body } = await get(baseUrl, `/api/v1/friends?nodeId=${freshNodeId}`);
    assert.equal(body.count, 0, "fresh node should have 0 friends");
    assert.equal(body.friends.length, 0, "fresh node should have empty friends array");
  });

  await test("Temp number is exactly 6 digits (not 5, not 7)", async () => {
    // Request multiple temp numbers and verify format
    for (let i = 0; i < 5; i++) {
      const nodeId = `format-test-node-${i}`;
      await post(baseUrl, "/api/v1/node/register", { id: nodeId, publicKey: `key-${i}` });
      const { body } = await post(baseUrl, "/api/v1/temp-number/request", { nodeId });
      assert.ok(/^\d{6}$/.test(body.number), `"${body.number}" should be exactly 6 digits`);
      const num = parseInt(body.number, 10);
      assert.ok(num >= 100000 && num <= 999999, `number ${num} should be 100000-999999`);
    }
  });

  await test("404 for unknown routes", async () => {
    const { status } = await get(baseUrl, "/api/v1/nonexistent");
    assert.equal(status, 404, "should return 404 for unknown routes");
  });

  await test("Cannot handshake with yourself", async () => {
    const selfNodeId = "self-node-" + Math.random().toString(36).slice(2, 8);
    await post(baseUrl, "/api/v1/node/register", { id: selfNodeId, publicKey: "self-key" });

    const { body: tnBody } = await post(baseUrl, "/api/v1/temp-number/request", {
      nodeId: selfNodeId,
    });

    const { status, body } = await post(baseUrl, "/api/v1/handshake/initiate", {
      requesterId: selfNodeId,
      targetTempNumber: tnBody.number,
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("yourself"), "should mention cannot handshake with yourself");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  @aicq/server — API Test Suite           ║");
  console.log("╚══════════════════════════════════════════╝");

  await startServer();

  try {
    await testHealthEndpoint();
    await testNodeRegistration();
    await testTempNumber();
    await testHandshakeFlow();
    await testFriendsEndpoints();
    await testFileTransferEndpoints();
    await testEdgeCases();
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
