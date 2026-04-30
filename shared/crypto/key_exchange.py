"""
X25519 key exchange and session key derivation.

Provides Diffie-Hellman shared secret computation via X25519 scalar
multiplication and an HKDF-like session key derivation using HMAC-SHA512,
matching the original @aicq/crypto TypeScript library.
"""

import hmac
import hashlib

import nacl.bindings
import nacl.hash
import nacl.encoding


def hmac_sha512(key: bytes, message: bytes) -> bytes:
    """Compute HMAC-SHA512.

    Args:
        key: The HMAC key.
        message: The message to authenticate.

    Returns:
        The 64-byte HMAC-SHA512 digest.
    """
    return hmac.new(key, message, hashlib.sha512).digest()


def compute_shared_secret(my_secret_key: bytes, their_public_key: bytes) -> bytes:
    """Compute an X25519 Diffie-Hellman shared secret.

    Performs scalar multiplication: shared = my_secret * their_public.

    Args:
        my_secret_key: Our 32-byte X25519 secret key.
        their_public_key: Their 32-byte X25519 public key.

    Returns:
        The 32-byte shared secret.

    Raises:
        ValueError: If key lengths are incorrect or scalar multiplication fails.
    """
    if len(my_secret_key) != 32:
        raise ValueError(
            f"Secret key must be 32 bytes, got {len(my_secret_key)}"
        )
    if len(their_public_key) != 32:
        raise ValueError(
            f"Public key must be 32 bytes, got {len(their_public_key)}"
        )

    try:
        return nacl.bindings.crypto_scalarmult(my_secret_key, their_public_key)
    except Exception as exc:
        raise ValueError(f"Scalar multiplication failed: {exc}") from exc


def derive_session_key(shared_secret: bytes, context: bytes = b"") -> bytes:
    """Derive a session key from a shared secret using HKDF-like construction.

    Uses HMAC-SHA512 in an extract-and-expand pattern:
    1. Extract: PRK = HMAC-SHA512(salt=context, input_key=shared_secret)
    2. Expand:  OKM = HMAC-SHA512(PRK, context || 0x01)

    Returns the first 32 bytes of the output keying material.

    Args:
        shared_secret: The 32-byte X25519 shared secret.
        context: Optional context/info bytes for domain separation.

    Returns:
        The 32-byte derived session key.
    """
    # Extract phase: PRK = HMAC-SHA512(context, shared_secret)
    prk = hmac_sha512(context, shared_secret)

    # Expand phase: OKM = HMAC-SHA512(PRK, context || 0x01)
    okm = hmac_sha512(prk, context + b"\x01")

    # Return first 32 bytes as the session key
    return okm[:32]
