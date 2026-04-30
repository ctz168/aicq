"""
Password-based key derivation and encryption using PBKDF2-SHA512.

Provides utilities to derive cryptographic keys from passwords using
PBKDF2-HMAC-SHA512, and to encrypt/decrypt data with those keys
using XSalsa20-Poly1305 (NaCl secretbox).
"""

from typing import Optional

import hashlib

import nacl.utils

from .types import EncryptedData
from .cipher import encrypt as _encrypt, decrypt as _decrypt

# Default PBKDF2 parameters
DEFAULT_ITERATIONS = 100_000
DEFAULT_KEY_LENGTH = 32
SALT_SIZE = 32


def derive_key_from_password(
    password: str,
    salt: bytes,
    iterations: int = DEFAULT_ITERATIONS,
    key_length: int = DEFAULT_KEY_LENGTH,
) -> bytes:
    """Derive a cryptographic key from a password using PBKDF2-HMAC-SHA512.

    Args:
        password: The password string.
        salt: The cryptographic salt (recommended 32 bytes).
        iterations: Number of PBKDF2 iterations (default 100,000).
        key_length: Desired key length in bytes (default 32).

    Returns:
        The derived key bytes of the specified length.

    Raises:
        ValueError: If iterations or key_length are not positive.
    """
    if iterations <= 0:
        raise ValueError(f"Iterations must be positive, got {iterations}")
    if key_length <= 0:
        raise ValueError(f"Key length must be positive, got {key_length}")

    return hashlib.pbkdf2_hmac(
        "sha512",
        password.encode("utf-8"),
        salt,
        iterations,
        dklen=key_length,
    )


def encrypt_with_password(
    data: bytes,
    password: str,
    iterations: int = DEFAULT_ITERATIONS,
) -> EncryptedData:
    """Encrypt data using a password.

    Generates a random salt and nonce, derives a key from the password
    via PBKDF2-SHA512, and encrypts with XSalsa20-Poly1305.

    Args:
        data: The plaintext bytes to encrypt.
        password: The password string.
        iterations: Number of PBKDF2 iterations (default 100,000).

    Returns:
        An EncryptedData containing the salt, IV (nonce), and ciphertext.
    """
    # Generate random salt
    salt = nacl.utils.random(SALT_SIZE)

    # Derive key from password
    key = derive_key_from_password(password, salt, iterations)

    # Encrypt with derived key
    ciphertext, nonce = _encrypt(data, key)

    return EncryptedData(
        salt=salt,
        iv=nonce,
        encrypted=ciphertext,
    )


def decrypt_with_password(
    salt: bytes,
    iv: bytes,
    encrypted: bytes,
    password: str,
    iterations: int = DEFAULT_ITERATIONS,
) -> Optional[bytes]:
    """Decrypt data that was encrypted with a password.

    Re-derives the key from the password and salt via PBKDF2-SHA512,
    then decrypts with XSalsa20-Poly1305.

    Args:
        salt: The salt used during encryption.
        iv: The nonce (24 bytes) used during encryption.
        encrypted: The ciphertext (including Poly1305 MAC).
        password: The password string.
        iterations: Number of PBKDF2 iterations (must match encryption).

    Returns:
        The decrypted plaintext bytes, or None if decryption fails
        (e.g., wrong password, tampered data).
    """
    # Derive key from password and salt
    key = derive_key_from_password(password, salt, iterations)

    # Decrypt
    return _decrypt(encrypted, key, iv)
