/**
 * Password-based encryption helpers.
 *
 * Uses PBKDF2-SHA512 (via Node.js crypto module) to derive a key from a
 * password and salt.  Then encrypts with NaCl `secretbox`.
 */

import * as crypto from "crypto";
import { nacl } from "./nacl.js";
import { encrypt, decrypt, generateNonce } from "./cipher.js";
import type { EncryptedMessage } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Key derivation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive a 32-byte key from a password using PBKDF2 with SHA-512.
 *
 * Uses Node.js built-in crypto.pbkdf2Sync for standard, secure key
 * derivation following RFC 2898.
 *
 * @param password  UTF-8 password string.
 * @param salt      Salt bytes.
 * @param iterations Number of PBKDF2 rounds (default 100 000).
 * @param keyLength  Desired key length in bytes (default 32).
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = 100_000,
  keyLength: number = 32,
): Uint8Array {
  return Uint8Array.from(
    crypto.pbkdf2Sync(password, salt, iterations, keyLength, "sha512"),
  );
}

/**
 * Derive a 32-byte key from a password using iterated SHA-512 hashing.
 *
 * @deprecated Use `deriveKeyFromPassword` (PBKDF2) instead.
 * @internal Kept for backward compatibility with existing encrypted data.
 */
function deriveKeyLegacy(
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

/**
 * Internal derive key function that tries PBKDF2 first, falling back
 * to the legacy method if PBKDF2 fails.
 */
function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = 100_000,
): Uint8Array {
  try {
    return deriveKeyFromPassword(password, salt, iterations);
  } catch {
    // Fallback to legacy for environments without Node.js crypto
    return deriveKeyLegacy(password, salt, iterations);
  }
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
