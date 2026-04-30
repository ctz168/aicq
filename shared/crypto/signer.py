"""
Ed25519 digital signature operations.

Provides detached signing and verification using the Ed25519 curve,
matching the tweetnacl convention used in the original @aicq/crypto
TypeScript library.
"""

import nacl.signing


def sign(message: bytes, secret_key: bytes) -> bytes:
    """Create an Ed25519 detached signature.

    Args:
        message: The message bytes to sign.
        secret_key: The 64-byte Ed25519 secret key (seed || public_key).

    Returns:
        The 64-byte detached signature.

    Raises:
        ValueError: If the secret key is not 64 bytes.
    """
    if len(secret_key) != 64:
        raise ValueError(
            f"Ed25519 secret key must be 64 bytes, got {len(secret_key)}"
        )

    # Extract the 32-byte seed (first half of the 64-byte key)
    seed = secret_key[:32]
    signing_key = nacl.signing.SigningKey(seed)
    signed = signing_key.sign(message)
    return signed.signature


def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """Verify an Ed25519 detached signature.

    Args:
        message: The original message bytes.
        signature: The 64-byte detached signature.
        public_key: The 32-byte Ed25519 public key.

    Returns:
        True if the signature is valid, False otherwise.
    """
    if len(signature) != 64:
        return False
    if len(public_key) != 32:
        return False

    try:
        verify_key = nacl.signing.VerifyKey(public_key)
        verify_key.verify(message, signature)
        return True
    except (nacl.exceptions.BadSignatureError, Exception):
        return False
