/**
 * Account service and auth route tests for @aicq/server
 *
 * Tests registration, login, agent login, token refresh,
 * and verification code flows via HTTP endpoints.
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

// ─── Console capture helper ─────────────────────────────────────────

/**
 * Capture console.log output during an async operation.
 * Returns the captured log lines.
 */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
    originalLog.apply(console, args);
  };
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
  }
}

/**
 * Extract verification code from captured console logs.
 * Logs look like: [verification] Email verification code for user@example.com: 123456
 */
function extractCodeFromLogs(logs: string[]): string | null {
  for (const line of logs) {
    const match = line.match(/verification code for .+?: (\d{6})/);
    if (match) return match[1];
  }
  return null;
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
  process.env.JWT_SECRET = "test-jwt-secret-for-account-tests";
  // Disable rate limiting in tests
  process.env.RATE_LIMIT_DISABLED = "true";

  const mod = await import("../aicq-server/dist/index.js");
  serverInstance = mod.server;

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

const testEmail = `testuser-${Math.random().toString(36).slice(2, 8)}@example.com`;
const testPassword = "SecurePass123!";
const testPublicKey = "dGVzdC1wdWJsaWMta2V5LWJhc2U2NA=="; // base64 placeholder
let registrationSession: any = null;
// This will be set after successful registration
let registeredEmail = "";

// ═══════════════════════════════════════════════════════════════════════
//  1. VERIFICATION CODE TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testSendVerificationCode() {
  console.log("\n── Verification Code (send-code) ──");

  await test("POST /auth/send-code sends code for email → success", async () => {
    const { result, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: testEmail,
        type: "email",
        purpose: "register",
      }),
    );

    assert.equal(result.status, 200, "should return 200");
    assert.equal(result.body.success, true, "should indicate success");
    assert.ok(result.body.expiresAt > Date.now(), "expiresAt should be in the future");

    // Verify code was logged
    const code = extractCodeFromLogs(logs);
    assert.ok(code, "verification code should appear in console log");
    assert.ok(/^\d{6}$/.test(code!), `code should be 6 digits, got: ${code}`);
  });

  await test("POST /auth/send-code with missing fields → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/send-code", {
      target: testEmail,
      // missing type and purpose
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `error should mention missing: ${body.error}`);
  });

  await test("POST /auth/send-code with invalid email format → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/send-code", {
      target: "not-an-email",
      type: "email",
      purpose: "register",
    });
    assert.equal(status, 400, "should return 400 for invalid email");
    assert.ok(body.error.includes("邮箱格式无效") || body.error.includes("invalid"), `should mention invalid email: ${body.error}`);
  });

  await test("POST /auth/send-code with invalid type → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/send-code", {
      target: testEmail,
      type: "fax",
      purpose: "register",
    });
    assert.equal(status, 400, "should return 400 for invalid type");
    assert.ok(body.error.includes("Type must be"), `should mention type constraint: ${body.error}`);
  });

  await test("POST /auth/send-code with invalid purpose → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/send-code", {
      target: testEmail,
      type: "email",
      purpose: "something_else",
    });
    assert.equal(status, 400, "should return 400 for invalid purpose");
    assert.ok(body.error.includes("Purpose must be"), `should mention purpose constraint: ${body.error}`);
  });

  await test("POST /auth/send-code rate limits same email within 60s", async () => {
    // First send was already done above; send again within 60s
    const { status, body } = await post(baseUrl, "/api/v1/auth/send-code", {
      target: testEmail,
      type: "email",
      purpose: "register",
    });
    assert.equal(status, 400, "should return 400 for rate-limited request");
    assert.ok(
      body.error.includes("请求过于频繁") || body.error.includes("60秒"),
      `should mention rate limit: ${body.error}`,
    );
  });

  await test("POST /auth/send-code sends code for phone → success", async () => {
    const phone = "1234567890";
    const { result, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: phone,
        type: "phone",
        purpose: "register",
      }),
    );

    assert.equal(result.status, 200, "should return 200");
    assert.equal(result.body.success, true, "should indicate success");
    const code = extractCodeFromLogs(logs);
    assert.ok(code, "verification code should appear in console log");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  2. ACCOUNT REGISTRATION TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testAccountRegistration() {
  console.log("\n── Account Registration (auth/register) ──");

  // First, we need a fresh verification code (the previous one was used or rate-limited).
  // Since rate limit is per-target+purpose within 60s, we use a new email.
  const regEmail = `reguser-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await test("Register with email + valid code + password → success, returns token", async () => {
    // Step 1: Send verification code
    const { result: sendResult, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: regEmail,
        type: "email",
        purpose: "register",
      }),
    );
    assert.equal(sendResult.status, 200, "send-code should succeed");

    const code = extractCodeFromLogs(logs);
    assert.ok(code, "should have captured verification code");

    // Step 2: Register with the code
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: regEmail,
      type: "email",
      code,
      password: testPassword,
      displayName: "Test User",
      publicKey: testPublicKey,
    });

    assert.equal(status, 201, "should return 201");
    assert.equal(body.success, true, "should indicate success");
    assert.ok(body.account, "should return account");
    assert.equal(body.account.email, regEmail, "should return correct email");
    assert.equal(body.account.type, "human", "account type should be human");
    assert.equal(body.account.displayName, "Test User", "should return display name");
    assert.equal(body.account.status, "active", "account should be active");
    assert.ok(body.session, "should return session");
    assert.ok(body.session.token, "should return JWT token");
    assert.ok(body.session.refreshToken, "should return refresh token");
    assert.ok(body.session.expiresAt > Date.now(), "token should have future expiry");
    assert.ok(body.session.sessionId, "should return session ID");

    // Password should NOT be in the response
    assert.equal(body.account.passwordHash, undefined, "should not expose password hash in response");

    registrationSession = body.session;
    registeredEmail = regEmail;
  });

  await test("Password is hashed (not stored plaintext)", async () => {
    // Import the store to verify the stored password is hashed
    const { store } = await import("../aicq-server/dist/db/memoryStore.js");
    let foundAccount: any = null;
    for (const account of store.accounts.values()) {
      if (account.email === regEmail) {
        foundAccount = account;
        break;
      }
    }
    assert.ok(foundAccount, "account should exist in store");
    assert.ok(foundAccount.passwordHash, "account should have passwordHash");
    assert.notEqual(foundAccount.passwordHash, testPassword, "password should NOT be stored as plaintext");
    assert.ok(foundAccount.passwordHash.includes(":"), "hash should be in salt:hash format");
    // The hash should be much longer than the password
    assert.ok(foundAccount.passwordHash.length > testPassword.length, "hash should be longer than password");
  });

  await test("Register with duplicate email → error", async () => {
    // Send new code for same email
    const { result: sendResult, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: regEmail,
        type: "email",
        purpose: "register",
      }),
    );
    assert.equal(sendResult.status, 200, "send-code should succeed");

    const code = extractCodeFromLogs(logs);
    assert.ok(code, "should have captured verification code");

    // Try to register again
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: regEmail,
      type: "email",
      code,
      password: "AnotherPass123!",
      displayName: "Another User",
      publicKey: testPublicKey,
    });

    assert.equal(status, 400, "should return 400 for duplicate email");
    assert.ok(
      body.error.includes("已注册") || body.error.includes("already"),
      `should mention already registered: ${body.error}`,
    );
  });

  await test("Register with missing fields → 400", async () => {
    const freshEmail = `missing-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: freshEmail,
      // missing type, code, password, publicKey
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `should mention missing fields: ${body.error}`);
  });

  await test("Register with missing publicKey → 400", async () => {
    const freshEmail = `nopubkey-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: freshEmail,
      type: "email",
      code: "123456",
      password: testPassword,
      // missing publicKey
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing") && body.error.includes("publicKey"), `should mention missing publicKey: ${body.error}`);
  });

  await test("Register with short password (< 6 chars) → 400", async () => {
    const freshEmail = `shortpw-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: freshEmail,
      type: "email",
      code: "123456",
      password: "abc",
      publicKey: testPublicKey,
    });
    assert.equal(status, 400, "should return 400 for short password");
    assert.ok(
      body.error.includes("密码长度至少6位") || body.error.includes("6"),
      `should mention minimum password length: ${body.error}`,
    );
  });

  await test("Register with wrong verification code → error", async () => {
    const freshEmail = `wrongcode-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: freshEmail,
      type: "email",
      code: "999999", // wrong code
      password: testPassword,
      publicKey: testPublicKey,
    });
    assert.equal(status, 400, "should return 400 for wrong code");
    assert.ok(
      body.error.includes("验证码错误") || body.error.includes("code"),
      `should mention code error: ${body.error}`,
    );
  });

  await test("Register with invalid email format → 400 (code not found)", async () => {
    // The register route does not validate email format itself; it validates
    // the verification code. Since no code was sent for "not-an-email",
    // it returns 400 with "verification code error".
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: "not-an-email",
      type: "email",
      code: "123456",
      password: testPassword,
      publicKey: testPublicKey,
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error, "should include an error message");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  3. ACCOUNT LOGIN TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testAccountLogin() {
  console.log("\n── Account Login (auth/login) ──");

  await test("Login with correct email + password → success, returns token", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: testPassword,
    });

    assert.equal(status, 200, "should return 200");
    assert.equal(body.success, true, "should indicate success");
    assert.ok(body.account, "should return account");
    assert.equal(body.account.email, registeredEmail, "should return correct email");
    assert.ok(body.session, "should return session");
    assert.ok(body.session.token, "should return JWT token");
    assert.ok(body.session.refreshToken, "should return refresh token");
  });

  await test("Login with wrong password → 401", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: "WrongPassword999!",
    });

    assert.equal(status, 401, "should return 401");
    assert.ok(
      body.error.includes("密码错误") || body.error.includes("password"),
      `should mention wrong password: ${body.error}`,
    );
  });

  await test("Login with non-existent email → 401", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      target: "nonexistent@example.com",
      type: "email",
      password: testPassword,
    });

    assert.equal(status, 401, "should return 401");
    assert.ok(
      body.error.includes("账号不存在") || body.error.includes("not found") || body.error.includes("不存在"),
      `should mention account not found: ${body.error}`,
    );
  });

  await test("Login with missing target → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      // missing target
      type: "email",
      password: testPassword,
    });

    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `should mention missing fields: ${body.error}`);
  });

  await test("Login with missing type → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      target: testEmail,
      // missing type
      password: testPassword,
    });

    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `should mention missing fields: ${body.error}`);
  });

  await test("Login with missing password and code → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      // missing password and code
    });

    assert.equal(status, 400, "should return 400");
    assert.ok(
      body.error.includes("Missing") || body.error.includes("password"),
      `should mention missing password/code: ${body.error}`,
    );
  });

  await test("Login updates lastLoginAt timestamp", async () => {
    const loginResult = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: testPassword,
    });

    const accountBefore = loginResult.body.account.lastLoginAt;

    // Login again after a tiny delay
    await new Promise((r) => setTimeout(r, 10));

    const { body: loginBody2 } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: testPassword,
    });

    const accountAfter = loginBody2.account.lastLoginAt;
    assert.ok(accountAfter >= accountBefore, "lastLoginAt should be updated on each login");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  4. AGENT LOGIN TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testAgentLogin() {
  console.log("\n── Agent Login (auth/login-agent) ──");

  // Note: There is no HTTP endpoint to request an agent challenge.
  // The login-agent route requires a valid challengeId. We test error cases
  // and use the service function directly to test the success case.

  await test("Agent login with missing fields → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: "some-key",
      // missing signature and challengeId
    });
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `should mention missing fields: ${body.error}`);
  });

  await test("Agent login with invalid challengeId → 401", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: "dGVzdC1wdWJsaWMta2V5",
      agentName: "TestBot",
      signature: Buffer.from("fake-signature").toString("base64"),
      challengeId: "nonexistent-challenge-id",
    });
    assert.equal(status, 401, "should return 401");
    assert.ok(
      body.error.includes("挑战不存在") || body.error.includes("challenge"),
      `should mention challenge not found: ${body.error}`,
    );
  });

  await test("Agent login with valid challenge and signature → success", async () => {
    // Import the accountService to request a challenge directly
    const accountService = await import("../aicq-server/dist/services/accountService.js");

    const agentPublicKey = "agent-pub-key-" + Math.random().toString(36).slice(2, 8);
    const { challenge, challengeId } = accountService.requestAgentChallenge(agentPublicKey, "TestAgent");

    // Login with the challenge - create a fake but non-empty base64 signature
    // The simplified verification just checks sig.length > 0
    const fakeSignature = Buffer.from(challenge).toString("base64");

    const { status, body } = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: agentPublicKey,
      agentName: "TestAgent",
      signature: fakeSignature,
      challengeId,
    });

    assert.equal(status, 200, "should return 200");
    assert.equal(body.success, true, "should indicate success");
    assert.ok(body.account, "should return account");
    assert.equal(body.account.type, "ai", "account type should be 'ai'");
    assert.equal(body.account.agentName, "TestAgent", "should return agent name");
    assert.ok(body.session, "should return session");
    assert.ok(body.session.token, "should return JWT token");
    assert.ok(body.session.refreshToken, "should return refresh token");
  });

  await test("Agent login reuses existing account on second login", async () => {
    const accountService = await import("../aicq-server/dist/services/accountService.js");

    const agentKey = "reuse-agent-key-" + Math.random().toString(36).slice(2, 8);

    // First login: creates account
    const { challengeId: c1, challenge: ch1 } = accountService.requestAgentChallenge(agentKey, "ReuseBot");
    const sig1 = Buffer.from(ch1).toString("base64");
    const res1 = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: agentKey,
      agentName: "ReuseBot",
      signature: sig1,
      challengeId: c1,
    });
    assert.equal(res1.status, 200, "first login should succeed");
    const firstAccountId = res1.body.account.id;

    // Second login: should reuse same account
    const { challengeId: c2, challenge: ch2 } = accountService.requestAgentChallenge(agentKey, "ReuseBot");
    const sig2 = Buffer.from(ch2).toString("base64");
    const res2 = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: agentKey,
      agentName: "ReuseBot",
      signature: sig2,
      challengeId: c2,
    });
    assert.equal(res2.status, 200, "second login should succeed");
    assert.equal(res2.body.account.id, firstAccountId, "should reuse same account ID");
  });

  await test("Agent login with public key mismatch → 401", async () => {
    const accountService = await import("../aicq-server/dist/services/accountService.js");

    const correctKey = "correct-key-" + Math.random().toString(36).slice(2, 8);
    const wrongKey = "wrong-key-" + Math.random().toString(36).slice(2, 8);

    const { challengeId, challenge } = accountService.requestAgentChallenge(correctKey);
    const signature = Buffer.from(challenge).toString("base64");

    // Login with wrong public key
    const { status, body } = await post(baseUrl, "/api/v1/auth/login-agent", {
      publicKey: wrongKey, // wrong key!
      signature,
      challengeId,
    });

    assert.equal(status, 401, "should return 401");
    assert.ok(
      body.error.includes("公钥与挑战不匹配") || body.error.includes("not match"),
      `should mention key mismatch: ${body.error}`,
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  5. TOKEN REFRESH TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testTokenRefresh() {
  console.log("\n── Token Refresh (auth/refresh) ──");

  await test("Refresh with valid refresh token → new token pair", async () => {
    // Get a refresh token from a successful login
    const { body: loginBody } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: testPassword,
    });

    const oldToken = loginBody.session.token;
    const oldRefreshToken = loginBody.session.refreshToken;
    const oldSessionId = loginBody.session.sessionId;

    // Small delay to ensure different JWT timestamps
    await new Promise((r) => setTimeout(r, 1100));

    // Refresh
    const { status, body } = await post(baseUrl, "/api/v1/auth/refresh", {
      refreshToken: oldRefreshToken,
    });

    assert.equal(status, 200, "should return 200");
    assert.equal(body.success, true, "should indicate success");
    assert.ok(body.session, "should return new session");
    assert.ok(body.session.token, "should return new access token");
    assert.ok(body.session.refreshToken, "should return new refresh token");
    assert.notEqual(body.session.token, oldToken, "new token should differ from old");
    assert.notEqual(body.session.refreshToken, oldRefreshToken, "new refresh token should differ");
    assert.notEqual(body.session.sessionId, oldSessionId, "new session should have different ID");
    assert.ok(body.account, "should return account info");
  });

  await test("Refresh with invalid refresh token → 401", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/refresh", {
      refreshToken: "invalid-token-garbage",
    });
    assert.equal(status, 401, "should return 401");
    assert.ok(
      body.error.includes("Invalid") || body.error.includes("expired"),
      `should mention invalid/expired: ${body.error}`,
    );
  });

  await test("Refresh with empty string token → 400 (treated as missing)", async () => {
    // Empty string is falsy, so the route returns 400 for Missing refreshToken
    const { status, body } = await post(baseUrl, "/api/v1/auth/refresh", {
      refreshToken: "",
    });
    assert.equal(status, 400, "should return 400 for empty string (falsy)");
    assert.ok(body.error.includes("Missing"), `should mention missing: ${body.error}`);
  });

  await test("Refresh with missing refreshToken field → 400", async () => {
    const { status, body } = await post(baseUrl, "/api/v1/auth/refresh", {});
    assert.equal(status, 400, "should return 400");
    assert.ok(body.error.includes("Missing"), `should mention missing refreshToken: ${body.error}`);
  });

  await test("Previously used refresh token can be reused (current impl does not invalidate)", async () => {
    // Login to get a fresh refresh token
    const { body: loginBody } = await post(baseUrl, "/api/v1/auth/login", {
      target: registeredEmail,
      type: "email",
      password: testPassword,
    });

    const refreshToken = loginBody.session.refreshToken;

    // Use it once
    const res1 = await post(baseUrl, "/api/v1/auth/refresh", { refreshToken });
    assert.equal(res1.status, 200, "first refresh should succeed");

    // Use the same token again - current impl does NOT invalidate old refresh tokens
    const res2 = await post(baseUrl, "/api/v1/auth/refresh", { refreshToken });
    // The current implementation allows reuse (does not track consumed tokens)
    assert.equal(res2.status, 200, `second use returns 200 (current behavior: tokens not invalidated)`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  6. VERIFICATION CODE EXPIRY TESTS
// ═══════════════════════════════════════════════════════════════════════

async function testVerificationCodeExpiry() {
  console.log("\n── Verification Code Expiry ──");

  await test("Verify expired code → error", async () => {
    // We need to directly manipulate the store to expire a code
    const { store } = await import("../aicq-server/dist/db/memoryStore.js");
    const email = `expire-${Math.random().toString(36).slice(2, 8)}@example.com`;

    // Send a code
    const { result, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: email,
        type: "email",
        purpose: "register",
      }),
    );
    assert.equal(result.status, 200, "send-code should succeed");
    const code = extractCodeFromLogs(logs);
    assert.ok(code, "should have code");

    // Manually expire the code in the store
    const key = `email:${email}:register`;
    const record = store.verificationCodes.get(key);
    assert.ok(record, "code record should exist in store");
    record.expiresAt = Date.now() - 1000; // set to past

    // Try to register with expired code
    const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
      target: email,
      type: "email",
      code,
      password: testPassword,
      publicKey: testPublicKey,
    });

    assert.equal(status, 400, "should return 400 for expired code");
    assert.ok(
      body.error.includes("验证码已过期") || body.error.includes("expired"),
      `should mention expired: ${body.error}`,
    );
  });

  await test("Wrong code always returns error (registerHuman does not track attempts)", async () => {
    // Note: registerHuman in accountService.ts checks the code directly
    // from the store but does NOT implement attempt counting like verifyCode does.
    // Each wrong attempt returns the same error. This test documents the behavior.
    const email = `attempts-${Math.random().toString(36).slice(2, 8)}@example.com`;

    // Send a code
    const { result, logs } = await captureConsole(() =>
      post(baseUrl, "/api/v1/auth/send-code", {
        target: email,
        type: "email",
        purpose: "register",
      }),
    );
    assert.equal(result.status, 200, "send-code should succeed");
    const realCode = extractCodeFromLogs(logs);
    assert.ok(realCode, "should have code");

    // Try wrong code multiple times - all should fail with same error
    for (let i = 0; i < 3; i++) {
      const { status, body } = await post(baseUrl, "/api/v1/auth/register", {
        target: email,
        type: "email",
        code: "000000", // always wrong
        password: testPassword,
        publicKey: testPublicKey,
      });
      assert.equal(status, 400, `attempt ${i + 1} should return 400`);
      assert.ok(
        body.error.includes("验证码错误"),
        `attempt ${i + 1} should mention code error: ${body.error}`,
      );
    }

    // The correct code should still work (code was not consumed)
    const { status } = await post(baseUrl, "/api/v1/auth/register", {
      target: email,
      type: "email",
      code: realCode,
      password: testPassword,
      displayName: "AttemptsUser",
      publicKey: testPublicKey,
    });
    assert.equal(status, 201, "correct code should still work after wrong attempts");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  @aicq/server — Account Service Tests    ║");
  console.log("╚══════════════════════════════════════════╝");

  await startServer();

  try {
    await testSendVerificationCode();
    await testAccountRegistration();
    await testAccountLogin();
    await testAgentLogin();
    await testTokenRefresh();
    await testVerificationCodeExpiry();
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
