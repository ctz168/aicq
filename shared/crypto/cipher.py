"""
Symmetric encryption using XSalsa20-Poly1305 (NaCl secretbox).

Provides authenticated encryption with associated data (AEAD) via the
NaCl secretbox construction, matching the original @aicq/crypto
TypeScript library's use of nacl.secretbox.
"""

from typing import Optional

import nacl.secret
import nacl.utils


def generate_nonce() -> bytes:
    """Generate a cryptographically secure 24-byte nonce for XSalsa20-Poly1305.

    Returns:
        24 random bytes suitable for use as a secretbox nonce.
    """
    return nacl.utils.random(nacl.secret.SecretBox.NONCE_SIZE)


def encrypt(plaintext: bytes, key: bytes) -> tuple[bytes, bytes]:
    """Encrypt plaintext using XSalsa20-Poly1305 (NaCl secretbox).

    Args:
        plaintext: The data to encrypt.
        key: The 32-byte symmetric key.

    Returns:
        A tuple of (ciphertext, nonce) where:
        - ciphertext includes the 16-byte Poly1305 authentication tag
          prepended to the encrypted data (NaCl convention).
        - nonce is the 24-byte nonce used for encryption.

    Raises:
        ValueError: If the key is not 32 bytes.
    """
    if len(key) != 32:
        raise ValueError(f"Key must be 32 bytes, got {len(key)}")

    box = nacl.secret.SecretBox(key)
    nonce = generate_nonce()
    encrypted = box.encrypt(plaintext, nonce)
    # encrypted.ciphertext includes the 16-byte MAC + encrypted data
    return bytes(encrypted.ciphertext), nonce


def decrypt(ciphertext: bytes, key: bytes, nonce: bytes) -> Optional[bytes]:
    """Decrypt ciphertext using XSalsa20-Poly1305 (NaCl secretbox).

    Args:
        ciphertext: The encrypted data including the 16-byte Poly1305 MAC.
        key: The 32-byte symmetric key.
        nonce: The 24-byte nonce used during encryption.

    Returns:
        The decrypted plaintext bytes, or None if decryption fails
        (e.g., wrong key, tampered ciphertext).
    """
    if len(key) != 32:
        return None
    if len(nonce) != 24:
        return None
    if len(ciphertext) < 16:  # Minimum: MAC only (no data)
        return None

    try:
        box = nacl.secret.SecretBox(key)
        plaintext = box.decrypt(ciphertext, nonce)
        return bytes(plaintext)
    except Exception:
        return None
