/**
 * Password-based encryption helpers.
 *
 * Uses repeated SHA-512 hashing (via tweetnacl) to derive a key from a
 * password and salt — a simple PBKDF2-like construction.  Then encrypts
 * with NaCl `secretbox`.
 */

import { nacl } from "./nacl.js";
import { encrypt, decrypt, generateNonce } from "./cipher.js";
import type { EncryptedMessage } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Key derivation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive a 32-byte key from a password using iterated SHA-512 hashing.
 *
 * This is intentionally simple — for production-grade PBKDF2 you would
 * use the Node.js `crypto` module, but this keeps the library dependency-
 * free and functional.
 *
 * @param password  UTF-8 password string.
 * @param salt      Salt bytes.
 * @param iterations Number of SHA-512 rounds (default 100 000).
 */
function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = 100_000,
): Uint8Array {
  const encoder = new TextEncoder();
  const pwdBytes = encoder.encode(password);

  // Initial mix: SHA-512(salt || password)
  let current = nacl.hash(new Uint8Array([...salt, ...pwdBytes]));

  // Repeatedly hash
  for (let i = 0; i < iterations; i++) {
    current = nacl.hash(current);
  }

  return current.slice(0, 32); // truncate to 32 bytes for secretbox key
}

/* ------------------------------------------------------------------ */
/*  Encrypt / Decrypt                                                  */
/* ------------------------------------------------------------------ */

/**
 * Encrypt data with a password.
 *
 * @returns An object containing the random salt, nonce, and ciphertext.
 */
export function encryptWithPassword(
  data: Uint8Array,
  password: string,
  iterations: number = 100_000,
): EncryptedMessage {
  const salt = nacl.randomBytes(32);
  const key = deriveKey(password, salt, iterations);
  const { ciphertext, nonce } = encrypt(data, key);
  return { salt, iv: nonce, encrypted: ciphertext };
}

/**
 * Decrypt data that was encrypted with `encryptWithPassword`.
 *
 * Returns `null` if decryption fails (wrong password, corrupted data, etc.).
 */
export function decryptWithPassword(
  salt: Uint8Array,
  iv: Uint8Array,
  encrypted: Uint8Array,
  password: string,
  iterations: number = 100_000,
): Uint8Array | null {
  const key = deriveKey(password, salt, iterations);
  return decrypt(encrypted, key, iv);
}
