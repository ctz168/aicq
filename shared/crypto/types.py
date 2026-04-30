"""
Core data types for the aicq cryptographic library.

These dataclasses define the structured data used across all crypto operations:
key pairs, handshake messages, parsed wire-format messages, and encrypted data.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class KeyPair:
    """A public/secret key pair for either Ed25519 signing or X25519 key exchange.

    Attributes:
        public_key: The 32-byte public key.
        secret_key: The 32-byte (X25519) or 64-byte (Ed25519) secret key.
    """
    public_key: bytes
    secret_key: bytes


@dataclass
class HandshakeRequest:
    """Initiator's handshake request containing identity and ephemeral public keys.

    Attributes:
        identity_public_key: The initiator's long-term Ed25519 public key (32 bytes).
        ephemeral_public_key: The initiator's ephemeral X25519 public key (32 bytes).
    """
    identity_public_key: bytes
    ephemeral_public_key: bytes


@dataclass
class HandshakeResponse:
    """Responder's handshake response containing identity, ephemeral keys, and proof.

    Attributes:
        identity_public_key: The responder's long-term Ed25519 public key (32 bytes).
        ephemeral_public_key: The responder's ephemeral X25519 public key (32 bytes).
        proof: HMAC-SHA512 proof binding the handshake transcript (64 bytes).
    """
    identity_public_key: bytes
    ephemeral_public_key: bytes
    proof: bytes


@dataclass
class ParsedMessage:
    """A parsed wire-format encrypted message.

    Wire format: version(1) + senderFP(32) + nonce(24) + ciphertext(N) + signature(64)

    Attributes:
        version: Protocol version byte.
        sender_fingerprint: Sender's public key fingerprint (32 bytes).
        nonce: XSalsa20-Poly1305 nonce (24 bytes).
        ciphertext: Encrypted payload (variable length).
        signature: Ed25519 detached signature (64 bytes).
    """
    version: int
    sender_fingerprint: bytes
    nonce: bytes
    ciphertext: bytes
    signature: bytes


@dataclass
class EncryptedData:
    """Password-encrypted data with salt and IV.

    Attributes:
        salt: PBKDF2 salt (32 bytes).
        iv: XSalsa20-Poly1305 nonce (24 bytes).
        encrypted: The encrypted ciphertext (variable length).
    """
    salt: bytes
    iv: bytes  # nonce for secretbox
    encrypted: bytes
