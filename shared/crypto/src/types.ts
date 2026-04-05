/**
 * Core TypeScript interfaces for the aicq-crypto library.
 */

/** A public/secret Ed25519 or X25519 key pair. */
export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** First message of the authenticated key-exchange handshake. */
export interface HandshakeRequest {
  /** Static identity public key of the initiator. */
  identityPublicKey: Uint8Array;
  /** One-time ephemeral public key of the initiator. */
  ephemeralPublicKey: Uint8Array;
}

/** Response to a HandshakeRequest. */
export interface HandshakeResponse {
  /** Static identity public key of the responder. */
  identityPublicKey: Uint8Array;
  /** One-time ephemeral public key of the responder. */
  ephemeralPublicKey: Uint8Array;
  /** MAC / signature proving ownership of the identity & ephemeral keys. */
  proof: Uint8Array;
}

/** Result of parsing a serialised encrypted message. */
export interface ParsedMessage {
  /** Protocol version byte (currently 1). */
  version: number;
  /** 32-byte sender public-key fingerprint. */
  senderFingerprint: Uint8Array;
  /** 24-byte nonce used for the symmetric cipher. */
  nonce: Uint8Array;
  /** The encrypted payload (variable length). */
  ciphertext: Uint8Array;
  /** 64-byte Ed25519 signature over version|fp|nonce|ciphertext. */
  signature: Uint8Array;
}

/** Convenience container returned by the password-based encrypt helper. */
export interface EncryptedMessage {
  salt: Uint8Array;
  iv: Uint8Array;
  encrypted: Uint8Array;
}
