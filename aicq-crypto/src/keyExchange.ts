/**
 * X25519 ECDH shared-secret computation and session-key derivation.
 *
 * The HKDF implementation uses tweetnacl's SHA-512 hash (nacl.hash) to
 * approximate HKDF-SHA256.  This is *not* standard HKDF-SHA256, but it
 * provides a functional, self-contained key-derivation primitive that
 * only depends on tweetnacl (no Node.js crypto module required).
 */

import { nacl } from "./nacl.js";

/* ------------------------------------------------------------------ */
/*  ECDH shared secret                                                 */
/* ------------------------------------------------------------------ */

/**
 * Compute a 32-byte shared secret via X25519 Diffie-Hellman.
 */
export function computeSharedSecret(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const shared = nacl.scalarMult(mySecretKey, theirPublicKey);
  if (!shared) {
    throw new Error("Key-exchange failed: scalarMult returned null");
  }
  return shared;
}

/* ------------------------------------------------------------------ */
/*  HKDF-like session-key derivation                                   */
/* ------------------------------------------------------------------ */

/**
 * Derive a 32-byte session key from a shared secret using an HKDF-like
 * construction built on top of nacl.hash (SHA-512).
 *
 * @param sharedSecret 32-byte X25519 shared secret.
 * @param context      Optional context / info string for domain separation.
 * @returns 32-byte session key.
 */
export function deriveSessionKey(
  sharedSecret: Uint8Array,
  context: string = "aicq-session",
): Uint8Array {
  // ---- Extract phase ----
  const salt = nacl.hash(
    new Uint8Array([...new TextEncoder().encode(context), ...sharedSecret]),
  );

  // ---- Expand phase ----
  // T(1) = HMAC-SHA512(salt, 0x01 || info)
  const infoBytes = new TextEncoder().encode(context);
  const expandInput = new Uint8Array([1, ...infoBytes]);
  const t1 = hmacSha512(salt, expandInput);

  // We only need 32 bytes, so truncate the 64-byte HMAC output.
  return t1.slice(0, 32);
}

/* ------------------------------------------------------------------ */
/*  Internal: HMAC-SHA-512                                             */
/* ------------------------------------------------------------------ */

/**
 * Minimal HMAC-SHA-512 built on top of nacl.hash (SHA-512).
 *
 * Since tweetnacl exposes a raw SHA-512 hash function (not HMAC), we
 * implement HMAC manually following RFC 2104.
 */
function hmacSha512(key: Uint8Array, message: Uint8Array): Uint8Array {
  const BLOCK_SIZE = 128; // SHA-512 block size in bytes

  // Ensure key is exactly one block long.
  let k: Uint8Array;
  if (key.length > BLOCK_SIZE) {
    k = nacl.hash(key); // 64 bytes
  } else {
    k = new Uint8Array(BLOCK_SIZE);
    k.set(key);
  }

  const oKeyPad = new Uint8Array(BLOCK_SIZE);
  const iKeyPad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    oKeyPad[i] = k[i] ^ 0x5c;
    iKeyPad[i] = k[i] ^ 0x36;
  }

  const innerData = new Uint8Array(BLOCK_SIZE + message.length);
  innerData.set(iKeyPad);
  innerData.set(message, BLOCK_SIZE);
  const innerHash = nacl.hash(innerData);

  const outerData = new Uint8Array(BLOCK_SIZE + 64);
  outerData.set(oKeyPad);
  outerData.set(innerHash, BLOCK_SIZE);

  return nacl.hash(outerData);
}
