/**
 * @aicq/crypto — Public API
 *
 * Re-exports every symbol from the library's sub-modules so consumers can
 * import directly from `@aicq/crypto`.
 */

/* Types */
export type {
  KeyPair,
  HandshakeRequest,
  HandshakeResponse,
  ParsedMessage,
  EncryptedMessage,
} from "./types.js";

/* NaCl helpers */
export {
  nacl,
  decodeUTF8,
  encodeUTF8,
  decodeBase64,
  encodeBase64,
} from "./nacl.js";

/* Key generation */
export {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  deriveX25519FromEd25519,
  getPublicKeyFingerprint,
} from "./keygen.js";

/* Signing / verification */
export { sign, verify } from "./signer.js";

/* Key exchange */
export { computeSharedSecret, deriveSessionKey } from "./keyExchange.js";

/* Symmetric cipher */
export { encrypt, decrypt, generateNonce } from "./cipher.js";

/* Wire-format messages */
export {
  createMessage,
  parseMessage,
  encryptMessage,
  decryptMessage,
} from "./message.js";

/* Password-based encryption */
export { encryptWithPassword, decryptWithPassword } from "./password.js";

/* Authenticated handshake */
export {
  createHandshakeRequest,
  createHandshakeResponse,
  completeHandshake,
} from "./handshake.js";
