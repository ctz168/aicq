/**
 * Ed25519 sign & verify using tweetnacl.
 */

import { nacl } from "./nacl.js";

/**
 * Sign a message with an Ed25519 secret key.
 *
 * Returns a 64-byte detached signature.
 */
export function sign(
  message: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

/**
 * Verify an Ed25519 detached signature against a message and public key.
 *
 * Returns `true` if the signature is valid, `false` otherwise.
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}
