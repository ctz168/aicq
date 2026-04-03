/**
 * Key-generation utilities – Ed25519 (signing) and X25519 (key-exchange).
 */

import { nacl } from "./nacl.js";

/* ------------------------------------------------------------------ */
/*  Ed25519 signing key pair                                           */
/* ------------------------------------------------------------------ */

/**
 * Generate a new Ed25519 key pair suitable for signing messages.
 *
 * Returns a 32-byte public key and a 64-byte secret key (seed + expanded key).
 */
export function generateSigningKeyPair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/* ------------------------------------------------------------------ */
/*  X25519 key-exchange key pair                                       */
/* ------------------------------------------------------------------ */

/**
 * Generate a new X25519 key pair for Elliptic-Curve Diffie-Hellman.
 */
export function generateKeyExchangeKeyPair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/* ------------------------------------------------------------------ */
/*  Key conversion                                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive an X25519 private key from an Ed25519 secret key.
 *
 * The Ed25519 secret key produced by tweetnacl is 64 bytes (32-byte seed +
 * 32-byte expanded key).  We hash the seed with SHA-512 and clamp the first
 * 32 bytes to obtain the scalar used by Curve25519, which is compatible with
 * X25519 key exchange.
 *
 * Reference: https://blog.mozilla.org/warner/2011/11/29/ed25519-keys/
 */
export function deriveX25519FromEd25519(
  secretKey: Uint8Array,
): Uint8Array {
  const seed = secretKey.slice(0, 32);
  const hashed = nacl.hash(seed);
  // Clamp: clear low 3 bits of byte 0, clear high bit of byte 31,
  // set second-highest bit of byte 31.
  const scalar = new Uint8Array(hashed.slice(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

/* ------------------------------------------------------------------ */
/*  Public-key fingerprint                                             */
/* ------------------------------------------------------------------ */

/**
 * Return a human-readable hex fingerprint for a public key (truncated
 * SHA-256 hash, 16 bytes → 32 hex chars).
 */
export function getPublicKeyFingerprint(publicKey: Uint8Array): string {
  const hash = nacl.hash(publicKey);
  const fp = hash.slice(0, 16);
  return Array.from(fp)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
