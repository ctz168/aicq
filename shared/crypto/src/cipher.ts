/**
 * Symmetric encryption / decryption using NaCl `secretbox`
 * (XSalsa20-Poly1305 — a 256-bit authenticated cipher).
 */

import { nacl } from "./nacl.js";

/* ------------------------------------------------------------------ */
/*  Nonce generation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generate a cryptographically random 24-byte nonce.
 */
export function generateNonce(): Uint8Array {
  return nacl.randomBytes(24);
}

/* ------------------------------------------------------------------ */
/*  Encrypt                                                            */
/* ------------------------------------------------------------------ */

/**
 * Encrypt a plaintext using NaCl `secretbox` (XSalsa20-Poly1305).
 *
 * @param plaintext Arbitrary-length message.
 * @param key       32-byte symmetric key.
 * @returns Object containing the ciphertext and the nonce.
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = generateNonce();
  const ciphertext = nacl.secretbox(plaintext, nonce, key);
  if (!ciphertext) {
    throw new Error("Encryption failed");
  }
  return { ciphertext, nonce };
}

/* ------------------------------------------------------------------ */
/*  Decrypt                                                            */
/* ------------------------------------------------------------------ */

/**
 * Decrypt a ciphertext produced by `encrypt`.
 *
 * Returns the plaintext, or `null` if the ciphertext fails authentication.
 *
 * @param ciphertext Encrypted message (Poly1305 MAC is embedded).
 * @param key        32-byte symmetric key.
 * @param nonce      24-byte nonce that was used during encryption.
 */
export function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array | null {
  return nacl.secretbox.open(ciphertext, nonce, key);
}
