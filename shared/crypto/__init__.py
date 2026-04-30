"""
aicq-python shared cryptographic library.

A Python port of the original @aicq/crypto TypeScript library providing:
- Ed25519 signing (via PyNaCl)
- X25519 key exchange (via PyNaCl)
- XSalsa20-Poly1305 encryption (NaCl secretbox)
- HKDF-like session key derivation (HMAC-SHA512)
- PBKDF2-SHA512 password-based encryption
- Noise-XK-inspired authenticated handshake
- Binary wire format for messages

All cryptographic operations use the PyNaCl library (nacl).
"""

# Core types
from .types import KeyPair, HandshakeRequest, HandshakeResponse, ParsedMessage, EncryptedData

# Key generation
from .keygen import (
    generate_signing_keypair,
    generate_key_exchange_keypair,
    derive_x25519_from_ed25519,
    get_public_key_fingerprint,
)

# Signing
from .signer import sign, verify

# Key exchange
from .key_exchange import compute_shared_secret, derive_session_key, hmac_sha512

# Symmetric encryption
from .cipher import generate_nonce, encrypt, decrypt

# Wire-format messages
from .message import (
    create_message,
    parse_message,
    encrypt_message,
    decrypt_message,
)

# Password-based encryption
from .password import (
    derive_key_from_password,
    encrypt_with_password,
    decrypt_with_password,
)

# Handshake
from .handshake import (
    create_handshake_request,
    create_handshake_response,
    complete_handshake,
)

# Utility helpers
from .nacl_utils import (
    encode_base64,
    decode_base64,
    encode_utf8,
    decode_utf8,
)

__all__ = [
    # Types
    "KeyPair",
    "HandshakeRequest",
    "HandshakeResponse",
    "ParsedMessage",
    "EncryptedData",
    # Key generation
    "generate_signing_keypair",
    "generate_key_exchange_keypair",
    "derive_x25519_from_ed25519",
    "get_public_key_fingerprint",
    # Signing
    "sign",
    "verify",
    # Key exchange
    "compute_shared_secret",
    "derive_session_key",
    "hmac_sha512",
    # Cipher
    "generate_nonce",
    "encrypt",
    "decrypt",
    # Messages
    "create_message",
    "parse_message",
    "encrypt_message",
    "decrypt_message",
    # Password
    "derive_key_from_password",
    "encrypt_with_password",
    "decrypt_with_password",
    # Handshake
    "create_handshake_request",
    "create_handshake_response",
    "complete_handshake",
    # Utilities
    "encode_base64",
    "decode_base64",
    "encode_utf8",
    "decode_utf8",
]
