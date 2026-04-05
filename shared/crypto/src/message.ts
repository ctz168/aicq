/**
 * Wire-format message builder & parser for encrypted chat messages.
 *
 * Binary layout (big-endian):
 *   [0]           version              1 byte
 *   [1..32]       sender fingerprint   32 bytes
 *   [33..56]      nonce                24 bytes
 *   [57..57+N-1]  ciphertext           N bytes  (variable)
 *   [57+N..120+N] signature            64 bytes
 */

import type { ParsedMessage } from "./types.js";
import { encrypt, decrypt } from "./cipher.js";
import { sign, verify } from "./signer.js";
import { nacl } from "./nacl.js";

/** Current protocol version. */
const VERSION = 1;

const FP_OFFSET = 1;
const FP_LEN = 32;
const NONCE_OFFSET = FP_OFFSET + FP_LEN; // 33
const NONCE_LEN = 24;
const CT_OFFSET = NONCE_OFFSET + NONCE_LEN; // 57
const SIG_LEN = 64;

/* ------------------------------------------------------------------ */
/*  Pack / Parse                                                       */
/* ------------------------------------------------------------------ */

/**
 * Pack an encrypted message into a single `Uint8Array`.
 *
 * The signature is computed over the concatenation of:
 *   version(1) || senderFP(32) || nonce(24) || ciphertext(N)
 */
export function createMessage(
  senderPubKey: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  signature: Uint8Array,
): Uint8Array {
  const totalLen =
    1 + FP_LEN + NONCE_LEN + ciphertext.length + SIG_LEN;
  const buf = new Uint8Array(totalLen);

  let off = 0;

  // Version
  buf[off++] = VERSION;

  // Sender fingerprint (first 32 bytes of SHA-512 hash of public key)
  const fp = nacl.hash(senderPubKey).slice(0, FP_LEN);
  buf.set(fp, off);
  off += FP_LEN;

  // Nonce
  buf.set(nonce, off);
  off += NONCE_LEN;

  // Ciphertext
  buf.set(ciphertext, off);
  off += ciphertext.length;

  // Signature
  buf.set(signature, off);

  return buf;
}

/**
 * Parse a serialised message back into its components.
 *
 * Throws if the buffer is malformed or has an unknown version.
 */
export function parseMessage(data: Uint8Array): ParsedMessage {
  const minLen = 1 + FP_LEN + NONCE_LEN + SIG_LEN; // 121
  if (data.length < minLen) {
    throw new Error(
      `Message too short: expected >=${minLen} bytes, got ${data.length}`,
    );
  }

  let off = 0;

  const version = data[off++];
  if (version !== VERSION) {
    throw new Error(`Unknown protocol version: ${version}`);
  }

  const senderFingerprint = data.slice(off, off + FP_LEN);
  off += FP_LEN;

  const nonce = data.slice(off, off + NONCE_LEN);
  off += NONCE_LEN;

  const ctLen = data.length - off - SIG_LEN;
  if (ctLen < 0) {
    throw new Error("Malformed message: cannot locate signature");
  }
  const ciphertext = data.slice(off, off + ctLen);
  off += ctLen;

  const signature = data.slice(off, off + SIG_LEN);

  return {
    version,
    senderFingerprint,
    nonce,
    ciphertext,
    signature,
  };
}

/* ------------------------------------------------------------------ */
/*  Full encrypt / decrypt pipeline                                    */
/* ------------------------------------------------------------------ */

/**
 * Full pipeline: encrypt a UTF-8 plaintext string and produce a signed
 * wire-format message.
 *
 * 1. Encrypt with `sessionKey` → ciphertext + nonce
 * 2. Build the unsigned message payload
 * 3. Sign with `signingKey`
 * 4. Return the final packed `Uint8Array`
 */
export function encryptMessage(
  plaintext: string,
  sessionKey: Uint8Array,
  signingKey: Uint8Array,
  senderPubKey: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(plaintext);

  const { ciphertext, nonce } = encrypt(plainBytes, sessionKey);

  // Build unsigned payload (for signing)
  const unsignedLen = 1 + FP_LEN + NONCE_LEN + ciphertext.length;
  const unsignedPayload = new Uint8Array(unsignedLen);
  let off = 0;
  unsignedPayload[off++] = VERSION;
  unsignedPayload.set(nacl.hash(senderPubKey).slice(0, FP_LEN), off);
  off += FP_LEN;
  unsignedPayload.set(nonce, off);
  off += NONCE_LEN;
  unsignedPayload.set(ciphertext, off);

  const signature = sign(unsignedPayload, signingKey);

  return createMessage(senderPubKey, nonce, ciphertext, signature);
}

/**
 * Full pipeline: parse a wire-format message, verify the signature,
 * decrypt the ciphertext, and return the original UTF-8 plaintext.
 *
 * Returns `null` if the signature is invalid or decryption fails.
 */
export function decryptMessage(
  data: Uint8Array,
  sessionKey: Uint8Array,
  senderPubKey: Uint8Array,
): string | null {
  const msg = parseMessage(data);

  // Verify sender fingerprint matches (first 32 bytes of SHA-512 hash)
  const expectedFP = nacl.hash(senderPubKey).slice(0, FP_LEN);
  if (!buffersEqual(msg.senderFingerprint, expectedFP)) {
    return null;
  }

  // Reconstruct the unsigned payload for signature verification
  const unsignedLen = 1 + FP_LEN + NONCE_LEN + msg.ciphertext.length;
  const unsignedPayload = new Uint8Array(unsignedLen);
  let off = 0;
  unsignedPayload[off++] = msg.version;
  unsignedPayload.set(msg.senderFingerprint, off);
  off += FP_LEN;
  unsignedPayload.set(msg.nonce, off);
  off += NONCE_LEN;
  unsignedPayload.set(msg.ciphertext, off);

  // Verify signature — extract Ed25519 public key from the secret key structure
  if (!verify(unsignedPayload, msg.signature, senderPubKey)) {
    return null;
  }

  // Decrypt
  const plaintext = decrypt(msg.ciphertext, sessionKey, msg.nonce);
  if (plaintext === null) {
    return null;
  }

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
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
