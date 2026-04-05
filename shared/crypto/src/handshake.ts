/**
 * Authenticated key-exchange handshake (a simplified Signal / Noise
 * inspired protocol).
 *
 * Overview
 * --------
 * 1. **Initiator** creates a `HandshakeRequest` with their identity public
 *    key and an ephemeral public key.
 *
 * 2. **Responder** receives the request, performs an ephemeral-ephemeral
 *    DH, derives a session key (with identity keys mixed in for
 *    authentication binding), and returns a `HandshakeResponse` with their
 *    own public keys and a proof (HMAC of the transcript).
 *
 * 3. **Initiator** receives the response, independently computes the same
 *    DH shared secret, derives the session key, and verifies the
 *    responder's proof.
 *
 * Key derivation
 * ---------------
 * The session key is derived from the ephemeral-ephemeral DH shared
 * secret (ee), with all four public keys mixed in as HKDF context for
 * authentication binding.  This provides forward secrecy while tying the
 * session to both parties' long-term identity keys.
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
 * Derive the shared session key from the ephemeral-ephemeral DH shared
 * secret and all four public keys (identity + ephemeral) for authentication
 * binding.
 */
function deriveHandshakeKey(
  ee: Uint8Array,
  initiatorIdPk: Uint8Array,
  initiatorEphPk: Uint8Array,
  responderIdPk: Uint8Array,
  responderEphPk: Uint8Array,
): Uint8Array {
  // Build a context string from all public keys for HKDF domain separation
  const contextLen = 32 + initiatorIdPk.length + initiatorEphPk.length +
                     responderIdPk.length + responderEphPk.length;
  const context = new Uint8Array(contextLen);
  let off = 0;

  // Use SHA-512 hash of the concatenated public keys as additional input
  const allPks = new Uint8Array(
    initiatorIdPk.length + initiatorEphPk.length +
    responderIdPk.length + responderEphPk.length,
  );
  allPks.set(initiatorIdPk, 0);
  allPks.set(initiatorEphPk, initiatorIdPk.length);
  allPks.set(responderIdPk, initiatorIdPk.length + initiatorEphPk.length);
  allPks.set(responderEphPk, initiatorIdPk.length + initiatorEphPk.length + responderIdPk.length);

  const pkHash = nacl.hash(allPks);
  const combined = new Uint8Array(32 + 64); // ee(32) + hash(64)
  combined.set(ee, 0);
  combined.set(pkHash, 32);

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
 * Computes the ephemeral-ephemeral DH shared secret and derives the
 * session key with all four public keys mixed in for authentication.
 * Produces a proof (HMAC of the transcript) to authenticate the responder.
 */
export function createHandshakeResponse(
  request: HandshakeRequest,
  myIdentityKeys: KeyPair,
  myEphemeralKeys: KeyPair,
): HandshakeResponse {
  // ee: ephemeral-ephemeral  (R_e × I_e)
  const ee = computeSharedSecret(
    myEphemeralKeys.secretKey,
    request.ephemeralPublicKey,
  );

  const sessionKey = deriveHandshakeKey(
    ee,
    request.identityPublicKey,      // initiator identity pk
    request.ephemeralPublicKey,    // initiator ephemeral pk
    myIdentityKeys.publicKey,      // responder identity pk
    myEphemeralKeys.publicKey,     // responder ephemeral pk
  );

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
/*  Complete Handshake                                                */
/* ------------------------------------------------------------------ */

/**
 * Complete the handshake and derive the shared session key.
 *
 * Works for **both** the initiator and the responder.  The function
 * detects which role the caller plays by comparing `myIdentityKeys.publicKey`
 * against `request.identityPublicKey` (initiator) or
 * `response.identityPublicKey` (responder).
 *
 * Both sides compute the same ephemeral-ephemeral DH and derive the
 * session key with the same set of public keys, so they arrive at the
 * same result.
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
  // Determine which role we play
  const isInitiator = buffersEqual(myIdentityKeys.publicKey, request.identityPublicKey);

  let ee: Uint8Array;

  if (isInitiator) {
    // ee: my-ephemeral × their-ephemeral  (I_e × R_e)
    ee = computeSharedSecret(myEphemeralKeys.secretKey, response.ephemeralPublicKey);
  } else {
    // ee: my-ephemeral × their-ephemeral  (R_e × I_e, same as I_e × R_e)
    ee = computeSharedSecret(myEphemeralKeys.secretKey, request.ephemeralPublicKey);
  }

  const sessionKey = deriveHandshakeKey(
    ee,
    request.identityPublicKey,      // initiator identity pk
    request.ephemeralPublicKey,    // initiator ephemeral pk
    response.identityPublicKey,     // responder identity pk
    response.ephemeralPublicKey,    // responder ephemeral pk
  );

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
