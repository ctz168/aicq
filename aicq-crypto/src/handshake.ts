/**
 * Authenticated key-exchange handshake (a simplified Signal / Noise-XK
 * inspired protocol).
 *
 * Overview
 * --------
 * 1. **Initiator** creates a `HandshakeRequest` with their identity public
 *    key and an ephemeral public key.
 *
 * 2. **Responder** receives the request, computes three DH shared secrets
 *    (ee, se, es) using their own identity + ephemeral keys, derives a
 *    session key, and returns a `HandshakeResponse` with their own public
 *    keys and a proof (HMAC of the transcript).
 *
 * 3. **Initiator** receives the response, independently computes the same
 *    three DH shared secrets, derives the session key, and verifies the
 *    responder's proof.
 *
 * The session key is derived via an HKDF-like construction over the
 * concatenation of all three shared secrets.
 */

import type { KeyPair, HandshakeRequest, HandshakeResponse } from "./types.js";
import { computeSharedSecret, deriveSessionKey } from "./keyExchange.js";
import { nacl } from "./nacl.js";

/* ------------------------------------------------------------------ */
/*  Transcript hashing helpers                                         */
/* ------------------------------------------------------------------ */

/**
 * Compute an HMAC-SHA-512 proof over the handshake transcript.
 */
function computeProof(
  key: Uint8Array,
  ...parts: Uint8Array[]
): Uint8Array {
  const transcript = new Uint8Array(
    parts.reduce((sum, p) => sum + p.length, 0),
  );
  let off = 0;
  for (const p of parts) {
    transcript.set(p, off);
    off += p.length;
  }

  // Simple HMAC: H(key ^ opad || H(key ^ ipad || message))
  const BLOCK = 128;
  const k = new Uint8Array(BLOCK);
  k.set(key.length > BLOCK ? nacl.hash(key) : key, 0);

  const iKey = new Uint8Array(BLOCK);
  const oKey = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    iKey[i] = k[i] ^ 0x36;
    oKey[i] = k[i] ^ 0x5c;
  }

  const inner = new Uint8Array(BLOCK + transcript.length);
  inner.set(iKey);
  inner.set(transcript, BLOCK);
  const innerHash = nacl.hash(inner);

  const outer = new Uint8Array(BLOCK + 64);
  outer.set(oKey);
  outer.set(innerHash, BLOCK);

  return nacl.hash(outer);
}

/**
 * Derive the shared session key from three DH shared secrets.
 */
function deriveHandshakeKey(
  ee: Uint8Array,
  se: Uint8Array,
  es: Uint8Array,
): Uint8Array {
  const combined = new Uint8Array(96);
  combined.set(ee, 0);
  combined.set(se, 32);
  combined.set(es, 64);
  return deriveSessionKey(combined, "aicq-handshake");
}

/* ------------------------------------------------------------------ */
/*  Create Handshake Request (Initiator)                               */
/* ------------------------------------------------------------------ */

/**
 * Create a handshake request to start an authenticated key exchange.
 *
 * The caller should generate a fresh ephemeral key pair before calling
 * this function.
 */
export function createHandshakeRequest(
  myPubKey: Uint8Array,
  myEphemeralPubKey: Uint8Array,
): HandshakeRequest {
  return {
    identityPublicKey: myPubKey,
    ephemeralPublicKey: myEphemeralPubKey,
  };
}

/* ------------------------------------------------------------------ */
/*  Create Handshake Response (Responder)                              */
/* ------------------------------------------------------------------ */

/**
 * Create a response to a handshake request.
 *
 * Computes three DH shared secrets:
 * - `ee`: ephemeral-ephemeral
 * - `se`: responder-static × initiator-ephemeral
 * - `es`: responder-ephemeral × initiator-static
 *
 * Derives the session key and produces a proof that authenticates the
 * responder.
 */
export function createHandshakeResponse(
  request: HandshakeRequest,
  myIdentityKeys: KeyPair,
  myEphemeralKeys: KeyPair,
): HandshakeResponse {
  // ee: ephemeral-ephemeral
  const ee = computeSharedSecret(
    myEphemeralKeys.secretKey,
    request.ephemeralPublicKey,
  );

  // se: responder-static × initiator-ephemeral
  const se = computeSharedSecret(
    myIdentityKeys.secretKey,
    request.ephemeralPublicKey,
  );

  // es: responder-ephemeral × initiator-static
  const es = computeSharedSecret(
    myEphemeralKeys.secretKey,
    request.identityPublicKey,
  );

  const sessionKey = deriveHandshakeKey(ee, se, es);

  // Proof = HMAC over the entire handshake transcript
  const proof = computeProof(
    sessionKey,
    request.identityPublicKey,
    request.ephemeralPublicKey,
    myIdentityKeys.publicKey,
    myEphemeralKeys.publicKey,
  );

  return {
    identityPublicKey: myIdentityKeys.publicKey,
    ephemeralPublicKey: myEphemeralKeys.publicKey,
    proof,
  };
}

/* ------------------------------------------------------------------ */
/*  Complete Handshake (Initiator)                                     */
/* ------------------------------------------------------------------ */

/**
 * Complete the handshake from the initiator's side.
 *
 * Computes the same three DH shared secrets (from the initiator's
 * perspective), derives the session key, and verifies the responder's
 * proof.
 *
 * @returns The derived 32-byte session key.
 * @throws Error if the responder's proof does not validate.
 */
export function completeHandshake(
  response: HandshakeResponse,
  request: HandshakeRequest,
  myIdentityKeys: KeyPair,
  myEphemeralKeys: KeyPair,
): Uint8Array {
  // ee: ephemeral-ephemeral
  const ee = computeSharedSecret(
    myEphemeralKeys.secretKey,
    response.ephemeralPublicKey,
  );

  // se (initiator view): my-static × their-ephemeral
  const se = computeSharedSecret(
    myIdentityKeys.secretKey,
    response.ephemeralPublicKey,
  );

  // es (initiator view): my-ephemeral × their-static
  const es = computeSharedSecret(
    myEphemeralKeys.secretKey,
    response.identityPublicKey,
  );

  const sessionKey = deriveHandshakeKey(ee, se, es);

  // Recompute and verify the responder's proof
  const expectedProof = computeProof(
    sessionKey,
    request.identityPublicKey,
    request.ephemeralPublicKey,
    response.identityPublicKey,
    response.ephemeralPublicKey,
  );

  if (!buffersEqual(expectedProof, response.proof)) {
    throw new Error("Handshake proof verification failed");
  }

  return sessionKey;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
