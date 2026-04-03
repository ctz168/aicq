/**
 * Comprehensive tests for @aicq/crypto library
 *
 * Covers: key generation, signing, key exchange, symmetric encryption,
 * wire-format messages, password-based encryption, and authenticated handshake.
 */

import assert from "node:assert/strict";
import {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
  sign,
  verify,
  computeSharedSecret,
  deriveSessionKey,
  encrypt,
  decrypt,
  generateNonce,
  createMessage,
  parseMessage,
  encryptMessage,
  decryptMessage,
  encryptWithPassword,
  decryptWithPassword,
  createHandshakeRequest,
  createHandshakeResponse,
  completeHandshake,
} from "@aicq/crypto";

import type { KeyPair, HandshakeRequest, HandshakeResponse } from "@aicq/crypto";

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

function assertEqual<T>(actual: T, expected: T, label?: string): void {
  assert.deepEqual(actual, expected, label);
}

function assertNotEqual<T>(actual: T, expected: T, label?: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(`${label || "assertNotEqual"}: values are equal but should differ`);
  }
}

function bufEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function assertBufEqual(a: Uint8Array, b: Uint8Array, label?: string): void {
  if (!bufEq(a, b)) {
    throw new Error(
      `${label || "Buffer mismatch"}: expected [${Array.from(b).join(",")}] got [${Array.from(a).join(",")}]`,
    );
  }
}

function assertThrows(fn: () => void, label?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(label || "Expected function to throw but it did not");
  }
}

function assertNotThrows(fn: () => void, label?: string): void {
  try {
    fn();
  } catch (e: any) {
    throw new Error(`${label || "Expected function NOT to throw"}: ${e.message}`);
  }
}

// ─── Helper to encode strings ──────────────────────────────────────

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ═══════════════════════════════════════════════════════════════════════
//  1. KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════

async function testKeyGeneration() {
  console.log("\n── Key Generation ──");

  await test("generateSigningKeyPair() returns valid 32-byte public key and 64-byte secret key", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    assert.equal(publicKey.length, 32, "public key should be 32 bytes");
    assert.equal(secretKey.length, 64, "secret key should be 64 bytes (seed + expanded)");
    // Ensure they are Uint8Array
    assert.ok(publicKey instanceof Uint8Array, "publicKey should be Uint8Array");
    assert.ok(secretKey instanceof Uint8Array, "secretKey should be Uint8Array");
  });

  await test("generateKeyExchangeKeyPair() returns valid 32-byte keys", () => {
    const { publicKey, secretKey } = generateKeyExchangeKeyPair();
    assert.equal(publicKey.length, 32, "public key should be 32 bytes");
    assert.equal(secretKey.length, 32, "secret key should be 32 bytes");
    assert.ok(publicKey instanceof Uint8Array, "publicKey should be Uint8Array");
    assert.ok(secretKey instanceof Uint8Array, "secretKey should be Uint8Array");
  });

  await test("generateSigningKeyPair() produces unique pairs each call", () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    // Public keys should differ
    assert.ok(!bufEq(pair1.publicKey, pair2.publicKey), "public keys should be unique");
    assert.ok(!bufEq(pair1.secretKey, pair2.secretKey), "secret keys should be unique");
  });

  await test("getPublicKeyFingerprint() returns 32-char hex string (16 bytes)", () => {
    const { publicKey } = generateSigningKeyPair();
    const fp = getPublicKeyFingerprint(publicKey);
    assert.equal(typeof fp, "string", "fingerprint should be a string");
    assert.equal(fp.length, 32, `fingerprint should be 32 hex chars, got ${fp.length}`);
    assert.ok(/^[0-9a-f]{32}$/.test(fp), "fingerprint should be lowercase hex");
  });

  await test("getPublicKeyFingerprint() is deterministic for same key", () => {
    const { publicKey } = generateSigningKeyPair();
    const fp1 = getPublicKeyFingerprint(publicKey);
    const fp2 = getPublicKeyFingerprint(publicKey);
    assert.equal(fp1, fp2, "same key should produce same fingerprint");
  });

  await test("getPublicKeyFingerprint() differs for different keys", () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    const fp1 = getPublicKeyFingerprint(pair1.publicKey);
    const fp2 = getPublicKeyFingerprint(pair2.publicKey);
    assert.notEqual(fp1, fp2, "different keys should produce different fingerprints");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  2. SIGNING & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

async function testSigning() {
  console.log("\n── Signing & Verification ──");

  await test("sign() and verify() with valid keys succeeds", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const message = encode("Hello, AICQ!");
    const signature = sign(message, secretKey);

    assert.equal(signature.length, 64, "Ed25519 signature should be 64 bytes");
    assert.ok(verify(message, signature, publicKey), "signature should verify");
  });

  await test("verify() with tampered message fails", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const message = encode("Original message");
    const signature = sign(message, secretKey);

    const tampered = encode("Tampered message");
    assert.ok(!verify(tampered, signature, publicKey), "tampered message should fail verification");
  });

  await test("verify() with wrong public key fails", () => {
    const keyPair1 = generateSigningKeyPair();
    const keyPair2 = generateSigningKeyPair();
    const message = encode("Test message");
    const signature = sign(message, keyPair1.secretKey);

    assert.ok(!verify(message, signature, keyPair2.publicKey), "wrong public key should fail verification");
  });

  await test("sign() produces different signatures for different messages", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const sig1 = sign(encode("Message A"), secretKey);
    const sig2 = sign(encode("Message B"), secretKey);

    assert.ok(!bufEq(sig1, sig2), "different messages should produce different signatures");
  });

  await test("verify() returns false for corrupted signature", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const message = encode("Test");
    const signature = sign(message, secretKey);

    // Corrupt one byte of the signature
    const corrupted = new Uint8Array(signature);
    corrupted[10] ^= 0xff;
    assert.ok(!verify(message, corrupted, publicKey), "corrupted signature should fail");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  3. KEY EXCHANGE
// ═══════════════════════════════════════════════════════════════════════

async function testKeyExchange() {
  console.log("\n── Key Exchange ──");

  await test("computeSharedSecret() produces same result from both sides", () => {
    const alice = generateKeyExchangeKeyPair();
    const bob = generateKeyExchangeKeyPair();

    const sharedAlice = computeSharedSecret(alice.secretKey, bob.publicKey);
    const sharedBob = computeSharedSecret(bob.secretKey, alice.publicKey);

    assert.equal(sharedAlice.length, 32, "shared secret should be 32 bytes");
    assertBufEqual(sharedAlice, sharedBob, "both sides should derive same shared secret");
  });

  await test("computeSharedSecret() produces different secrets for different key pairs", () => {
    const alice = generateKeyExchangeKeyPair();
    const bob1 = generateKeyExchangeKeyPair();
    const bob2 = generateKeyExchangeKeyPair();

    const shared1 = computeSharedSecret(alice.secretKey, bob1.publicKey);
    const shared2 = computeSharedSecret(alice.secretKey, bob2.publicKey);

    assert.ok(!bufEq(shared1, shared2), "different key pairs should produce different secrets");
  });

  await test("deriveSessionKey() produces 32-byte key", () => {
    const alice = generateKeyExchangeKeyPair();
    const bob = generateKeyExchangeKeyPair();
    const shared = computeSharedSecret(alice.secretKey, bob.publicKey);

    const sessionKey = deriveSessionKey(shared);
    assert.equal(sessionKey.length, 32, "session key should be 32 bytes");
    assert.ok(sessionKey instanceof Uint8Array, "session key should be Uint8Array");
  });

  await test("deriveSessionKey() is deterministic for same inputs", () => {
    const alice = generateKeyExchangeKeyPair();
    const bob = generateKeyExchangeKeyPair();
    const shared = computeSharedSecret(alice.secretKey, bob.publicKey);

    const key1 = deriveSessionKey(shared);
    const key2 = deriveSessionKey(shared);
    assertBufEqual(key1, key2, "same inputs should produce same session key");
  });

  await test("deriveSessionKey() with different context strings produces different keys", () => {
    const alice = generateKeyExchangeKeyPair();
    const bob = generateKeyExchangeKeyPair();
    const shared = computeSharedSecret(alice.secretKey, bob.publicKey);

    const key1 = deriveSessionKey(shared, "context-a");
    const key2 = deriveSessionKey(shared, "context-b");
    assert.ok(!bufEq(key1, key2), "different contexts should produce different keys");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  4. ENCRYPTION / DECRYPTION
// ═══════════════════════════════════════════════════════════════════════

async function testEncryption() {
  console.log("\n── Encryption / Decryption ──");

  await test("encrypt() and decrypt() round-trip correctly", () => {
    const key = new Uint8Array(32).fill(42); // arbitrary 32-byte key
    const plaintext = encode("The quick brown fox jumps over the lazy dog");

    const { ciphertext, nonce } = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key, nonce);

    assert.ok(decrypted !== null, "decryption should succeed");
    assertBufEqual(decrypted!, plaintext, "decrypted text should match original");
  });

  await test("encrypt() produces different ciphertext each time (random nonce)", () => {
    const key = new Uint8Array(32).fill(42);
    const plaintext = encode("Same message");

    const { ciphertext: ct1 } = encrypt(plaintext, key);
    const { ciphertext: ct2 } = encrypt(plaintext, key);

    assert.ok(!bufEq(ct1, ct2), "different encryptions should produce different ciphertexts (random nonce)");
  });

  await test("decrypt() with wrong key returns null", () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);
    const plaintext = encode("Secret data");

    const { ciphertext, nonce } = encrypt(plaintext, key1);
    const decrypted = decrypt(ciphertext, key2, nonce);

    assert.equal(decrypted, null, "wrong key should return null");
  });

  await test("decrypt() with tampered ciphertext returns null", () => {
    const key = new Uint8Array(32).fill(42);
    const plaintext = encode("Important message");

    const { ciphertext, nonce } = encrypt(plaintext, key);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;

    const decrypted = decrypt(tampered, key, nonce);
    assert.equal(decrypted, null, "tampered ciphertext should return null");
  });

  await test("decrypt() with wrong nonce returns null", () => {
    const key = new Uint8Array(32).fill(42);
    const plaintext = encode("Nonce test");

    const { ciphertext } = encrypt(plaintext, key);
    const wrongNonce = new Uint8Array(24).fill(0);

    const decrypted = decrypt(ciphertext, key, wrongNonce);
    assert.equal(decrypted, null, "wrong nonce should return null");
  });

  await test("generateNonce() returns 24 bytes", () => {
    const nonce = generateNonce();
    assert.equal(nonce.length, 24, "nonce should be 24 bytes");
    assert.ok(nonce instanceof Uint8Array, "nonce should be Uint8Array");
  });

  await test("generateNonce() produces unique nonces", () => {
    const n1 = generateNonce();
    const n2 = generateNonce();
    assert.ok(!bufEq(n1, n2), "nonces should be unique");
  });

  await test("encrypt() handles empty plaintext", () => {
    const key = new Uint8Array(32).fill(42);
    const plaintext = encode("");

    const { ciphertext, nonce } = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key, nonce);

    assert.ok(decrypted !== null, "empty plaintext should encrypt/decrypt");
    assert.equal(decrypted!.length, 0, "decrypted empty plaintext should have length 0");
  });

  await test("encrypt() handles large plaintext (10KB)", () => {
    const key = new Uint8Array(32).fill(42);
    const plaintext = new Uint8Array(10_000).fill(0xAB);

    const { ciphertext, nonce } = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key, nonce);

    assert.ok(decrypted !== null, "large plaintext should encrypt/decrypt");
    assertBufEqual(decrypted!, plaintext, "large decrypted text should match");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  5. MESSAGE FORMAT
// ═══════════════════════════════════════════════════════════════════════

async function testMessageFormat() {
  console.log("\n── Message Format ──");

  await test("createMessage() and parseMessage() round-trip correctly", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const nonce = generateNonce();
    const ciphertext = encode("encrypted payload here");
    const signature = sign(encode("test"), secretKey);

    const wire = createMessage(publicKey, nonce, ciphertext, signature);
    const parsed = parseMessage(wire);

    assert.equal(parsed.version, 1, "version should be 1");
    assert.equal(parsed.nonce.length, 24, "nonce should be 24 bytes");
    assertBufEqual(parsed.ciphertext, ciphertext, "ciphertext should match");
    assert.equal(parsed.signature.length, 64, "signature should be 64 bytes");

    // Verify the sender fingerprint is the SHA-512 hash truncated to 32 bytes
    const expectedFP = new Uint8Array(32);
    // We don't have direct access to nacl.hash, but we can check the length
    assert.equal(parsed.senderFingerprint.length, 32, "sender fingerprint should be 32 bytes");
  });

  await test("parseMessage() throws on buffer too short", () => {
    const tiny = new Uint8Array(10);
    assertThrows(() => parseMessage(tiny), "should throw for buffer too short");
  });

  await test("parseMessage() throws on unknown version", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const nonce = generateNonce();
    const ciphertext = encode("data");
    const signature = sign(encode("test"), secretKey);

    const wire = createMessage(publicKey, nonce, ciphertext, signature);
    // Tamper the version byte
    wire[0] = 99;
    assertThrows(() => parseMessage(wire), "should throw for unknown version");
  });

  await test("encryptMessage() and decryptMessage() round-trip correctly", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const sessionKey = new Uint8Array(32).fill(77);
    const plaintext = "Hello, this is a secret message! 🤖";

    const wire = encryptMessage(plaintext, sessionKey, secretKey, publicKey);
    const decrypted = decryptMessage(wire, sessionKey, publicKey);

    assert.ok(decrypted !== null, "decryptMessage should succeed");
    assert.equal(decrypted, plaintext, "decrypted message should match original");
  });

  await test("decryptMessage() with wrong sender key returns null", () => {
    const sender = generateSigningKeyPair();
    const wrongKey = generateSigningKeyPair();
    const sessionKey = new Uint8Array(32).fill(77);
    const plaintext = "Secret message";

    const wire = encryptMessage(plaintext, sessionKey, sender.secretKey, sender.publicKey);
    const decrypted = decryptMessage(wire, sessionKey, wrongKey.publicKey);

    assert.equal(decrypted, null, "wrong sender key should return null");
  });

  await test("decryptMessage() with wrong session key returns null", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const sessionKey = new Uint8Array(32).fill(77);
    const wrongKey = new Uint8Array(32).fill(88);
    const plaintext = "Secret message";

    const wire = encryptMessage(plaintext, sessionKey, secretKey, publicKey);
    const decrypted = decryptMessage(wire, wrongKey, publicKey);

    assert.equal(decrypted, null, "wrong session key should return null");
  });

  await test("encryptMessage() produces consistent wire format", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const sessionKey = new Uint8Array(32).fill(77);
    const plaintext = "Test";

    const wire = encryptMessage(plaintext, sessionKey, secretKey, publicKey);

    // Minimum length: version(1) + fingerprint(32) + nonce(24) + min_ct(?) + sig(64)
    // ciphertext is at least 32 bytes (Poly1305 MAC + padded)
    assert.ok(wire.length > 121, `wire format should be >121 bytes, got ${wire.length}`);
    assert.equal(wire[0], 1, "first byte should be version 1");
  });

  await test("decryptMessage() handles unicode/emoji content", () => {
    const { publicKey, secretKey } = generateSigningKeyPair();
    const sessionKey = new Uint8Array(32).fill(77);
    const plaintext = "🎉 Hello 世界 مرحبا";

    const wire = encryptMessage(plaintext, sessionKey, secretKey, publicKey);
    const decrypted = decryptMessage(wire, sessionKey, publicKey);

    assert.equal(decrypted, plaintext, "unicode content should round-trip");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  6. PASSWORD-BASED ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════

// Use low iteration count for test speed
const TEST_ITERATIONS = 10;

async function testPasswordEncryption() {
  console.log("\n── Password-Based Encryption ──");

  await test("encryptWithPassword() and decryptWithPassword() round-trip correctly", () => {
    const data = encode("My secret diary entry");
    const password = "hunter2";

    const { salt, iv, encrypted } = encryptWithPassword(data, password, TEST_ITERATIONS);

    assert.equal(salt.length, 32, "salt should be 32 bytes");
    assert.equal(iv.length, 24, "iv should be 24 bytes");
    assert.ok(encrypted.length > 0, "encrypted should have content");

    const decrypted = decryptWithPassword(salt, iv, encrypted, password, TEST_ITERATIONS);
    assert.ok(decrypted !== null, "decryption should succeed");
    assertBufEqual(decrypted!, data, "decrypted data should match original");
  });

  await test("decryptWithPassword() with wrong password returns null", () => {
    const data = encode("Top secret");
    const password = "correct-password";

    const { salt, iv, encrypted } = encryptWithPassword(data, password, TEST_ITERATIONS);
    const decrypted = decryptWithPassword(salt, iv, encrypted, "wrong-password", TEST_ITERATIONS);

    assert.equal(decrypted, null, "wrong password should return null");
  });

  await test("encryptWithPassword() produces different ciphertext each time (random salt/nonce)", () => {
    const data = encode("Same data");
    const password = "password";

    const { encrypted: enc1 } = encryptWithPassword(data, password, TEST_ITERATIONS);
    const { encrypted: enc2 } = encryptWithPassword(data, password, TEST_ITERATIONS);

    assert.ok(!bufEq(enc1, enc2), "different encryptions should produce different ciphertext");
  });

  await test("decryptWithPassword() with tampered salt returns null", () => {
    const data = encode("Data");
    const password = "password";

    const { salt, iv, encrypted } = encryptWithPassword(data, password, TEST_ITERATIONS);
    const badSalt = new Uint8Array(salt);
    badSalt[0] ^= 0xff;

    const decrypted = decryptWithPassword(badSalt, iv, encrypted, password, TEST_ITERATIONS);
    assert.equal(decrypted, null, "tampered salt should cause decryption failure");
  });

  await test("decryptWithPassword() with tampered IV returns null", () => {
    const data = encode("Data");
    const password = "password";

    const { salt, iv, encrypted } = encryptWithPassword(data, password, TEST_ITERATIONS);
    const badIv = new Uint8Array(iv);
    badIv[0] ^= 0xff;

    const decrypted = decryptWithPassword(salt, badIv, encrypted, password, TEST_ITERATIONS);
    assert.equal(decrypted, null, "tampered IV should cause decryption failure");
  });

  await test("password encryption handles empty data", () => {
    const data = encode("");
    const password = "password";

    const { salt, iv, encrypted } = encryptWithPassword(data, password, TEST_ITERATIONS);
    const decrypted = decryptWithPassword(salt, iv, encrypted, password, TEST_ITERATIONS);

    assert.ok(decrypted !== null, "empty data should round-trip");
    assert.equal(decrypted!.length, 0, "decrypted empty data should have length 0");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  7. AUTHENTICATED HANDSHAKE
// ═══════════════════════════════════════════════════════════════════════

async function testHandshake() {
  console.log("\n── Authenticated Handshake ──");

  await test("createHandshakeRequest() returns valid structure", () => {
    const identityKeys = generateSigningKeyPair();
    const ephKeys = generateKeyExchangeKeyPair();

    const request: HandshakeRequest = createHandshakeRequest(
      identityKeys.publicKey,
      ephKeys.publicKey,
    );

    assert.ok(request.identityPublicKey instanceof Uint8Array, "identityPublicKey should be Uint8Array");
    assert.ok(request.ephemeralPublicKey instanceof Uint8Array, "ephemeralPublicKey should be Uint8Array");
    assertBufEqual(request.identityPublicKey, identityKeys.publicKey, "identity key should match");
    assertBufEqual(request.ephemeralPublicKey, ephKeys.publicKey, "ephemeral key should match");
  });

  await test("createHandshakeResponse() returns valid structure with proof", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response: HandshakeResponse = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    assert.ok(response.identityPublicKey instanceof Uint8Array, "identityPublicKey should be Uint8Array");
    assert.ok(response.ephemeralPublicKey instanceof Uint8Array, "ephemeralPublicKey should be Uint8Array");
    assert.ok(response.proof instanceof Uint8Array, "proof should be Uint8Array");
    assert.ok(response.proof.length > 0, "proof should have content");
    assertBufEqual(response.identityPublicKey, bobIdentity.publicKey, "identity key should match");
    assertBufEqual(response.ephemeralPublicKey, bobEph.publicKey, "ephemeral key should match");
  });

  await test("completeHandshake() returns 32-byte session key for initiator", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    const sessionKey = completeHandshake(
      response,
      request,
      aliceIdentity as unknown as KeyPair,
      aliceEph as unknown as KeyPair,
    );

    assert.ok(sessionKey instanceof Uint8Array, "session key should be Uint8Array");
    assert.equal(sessionKey.length, 32, "session key should be 32 bytes");
  });

  await test("completeHandshake() returns 32-byte session key for responder", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    const sessionKey = completeHandshake(
      response,
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    assert.ok(sessionKey instanceof Uint8Array, "session key should be Uint8Array");
    assert.equal(sessionKey.length, 32, "session key should be 32 bytes");
  });

  await test("Both initiator and responder derive the SAME session key", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    const aliceSessionKey = completeHandshake(
      response,
      request,
      aliceIdentity as unknown as KeyPair,
      aliceEph as unknown as KeyPair,
    );

    const bobSessionKey = completeHandshake(
      response,
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    assertBufEqual(aliceSessionKey, bobSessionKey, "both parties should derive the same session key");
  });

  await test("completeHandshake() with tampered proof throws error", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    // Tamper the proof
    const tamperedResponse: HandshakeResponse = {
      ...response,
      proof: new Uint8Array(response.proof.length).fill(0),
    };

    assertThrows(
      () =>
        completeHandshake(
          tamperedResponse,
          request,
          aliceIdentity as unknown as KeyPair,
          aliceEph as unknown as KeyPair,
        ),
      "tampered proof should cause completeHandshake to throw",
    );
  });

  await test("Different handshakes produce different session keys (forward secrecy)", () => {
    const aliceIdentity = generateSigningKeyPair();
    const bobIdentity = generateSigningKeyPair();

    // First handshake
    const aliceEph1 = generateKeyExchangeKeyPair();
    const bobEph1 = generateKeyExchangeKeyPair();
    const request1 = createHandshakeRequest(aliceIdentity.publicKey, aliceEph1.publicKey);
    const response1 = createHandshakeResponse(
      request1,
      bobIdentity as unknown as KeyPair,
      bobEph1 as unknown as KeyPair,
    );
    const sessionKey1 = completeHandshake(
      response1,
      request1,
      aliceIdentity as unknown as KeyPair,
      aliceEph1 as unknown as KeyPair,
    );

    // Second handshake with new ephemeral keys
    const aliceEph2 = generateKeyExchangeKeyPair();
    const bobEph2 = generateKeyExchangeKeyPair();
    const request2 = createHandshakeRequest(aliceIdentity.publicKey, aliceEph2.publicKey);
    const response2 = createHandshakeResponse(
      request2,
      bobIdentity as unknown as KeyPair,
      bobEph2 as unknown as KeyPair,
    );
    const sessionKey2 = completeHandshake(
      response2,
      request2,
      aliceIdentity as unknown as KeyPair,
      aliceEph2 as unknown as KeyPair,
    );

    assert.ok(!bufEq(sessionKey1, sessionKey2), "different handshakes should produce different session keys");
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  8. CROSS-PARTY FULL FLOW
// ═══════════════════════════════════════════════════════════════════════

async function testCrossPartyFullFlow() {
  console.log("\n── Cross-Party Full Flow (Alice ↔ Bob) ──");

  await test("Alice and Bob handshake, derive same key, exchange encrypted message", () => {
    // 1. Alice and Bob each generate keys
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    // 2. Alice creates handshake request
    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);

    // 3. Bob creates handshake response
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    // 4. Alice completes handshake → sessionKey1
    const sessionKey1 = completeHandshake(
      response,
      request,
      aliceIdentity as unknown as KeyPair,
      aliceEph as unknown as KeyPair,
    );

    // 5. Bob completes handshake → sessionKey2
    const sessionKey2 = completeHandshake(
      response,
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    // 6. sessionKey1 === sessionKey2
    assertBufEqual(sessionKey1, sessionKey2, "session keys must match");

    // 7. Alice encrypts message with sessionKey
    const message = "Hey Bob, this is Alice! 🎉";
    const wire = encryptMessage(message, sessionKey1, aliceIdentity.secretKey, aliceIdentity.publicKey);

    // 8. Bob decrypts message with sessionKey
    const decrypted = decryptMessage(wire, sessionKey2, aliceIdentity.publicKey);

    // 9. Message content matches
    assert.ok(decrypted !== null, "Bob should be able to decrypt Alice's message");
    assert.equal(decrypted, message, "decrypted message content should match original");
  });

  await test("Bob can encrypt a reply that Alice can decrypt", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );

    const sessionKey = completeHandshake(
      response,
      request,
      aliceIdentity as unknown as KeyPair,
      aliceEph as unknown as KeyPair,
    );

    // Bob encrypts reply
    const reply = "Hi Alice! Nice to meet you 🤝";
    const wire = encryptMessage(reply, sessionKey, bobIdentity.secretKey, bobIdentity.publicKey);

    // Alice decrypts
    const decrypted = decryptMessage(wire, sessionKey, bobIdentity.publicKey);
    assert.ok(decrypted !== null, "Alice should decrypt Bob's reply");
    assert.equal(decrypted, reply, "reply content should match");
  });

  await test("Multiple sequential messages all round-trip correctly", () => {
    const aliceIdentity = generateSigningKeyPair();
    const aliceEph = generateKeyExchangeKeyPair();
    const bobIdentity = generateSigningKeyPair();
    const bobEph = generateKeyExchangeKeyPair();

    const request = createHandshakeRequest(aliceIdentity.publicKey, aliceEph.publicKey);
    const response = createHandshakeResponse(
      request,
      bobIdentity as unknown as KeyPair,
      bobEph as unknown as KeyPair,
    );
    const sessionKey = completeHandshake(
      response,
      request,
      aliceIdentity as unknown as KeyPair,
      aliceEph as unknown as KeyPair,
    );

    const messages = [
      "First message",
      "Second message with unicode: 你好世界",
      "Third: numbers 12345 and symbols !@#$%",
      "Fourth: empty after this",
      "",
    ];

    for (const msg of messages) {
      const wire = encryptMessage(msg, sessionKey, aliceIdentity.secretKey, aliceIdentity.publicKey);
      const decrypted = decryptMessage(wire, sessionKey, aliceIdentity.publicKey);
      assert.equal(decrypted, msg, `message "${msg}" should round-trip`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  @aicq/crypto — Comprehensive Test Suite  ║");
  console.log("╚══════════════════════════════════════════╝");

  await testKeyGeneration();
  await testSigning();
  await testKeyExchange();
  await testEncryption();
  await testMessageFormat();
  await testPasswordEncryption();
  await testHandshake();
  await testCrossPartyFullFlow();

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
