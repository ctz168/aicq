"""
Encryption and Decryption
============================
AES-256-GCM encryption for messages and file chunks using session keys.
"""

from __future__ import annotations

import os
import json
from typing import Any, Dict, Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# ─── Session Key Generation ─────────────────────────────────────────────


def generate_session_key() -> bytes:
    """Generate a random 32-byte AES-256 session key.

    Returns
    -------
    bytes
        A cryptographically random 256-bit key.
    """
    return AESGCM.generate_key(bit_length=256)


# ─── Message Encryption ─────────────────────────────────────────────────


def encrypt_message(
    session_key: bytes,
    plaintext: str,
    associated_data: Optional[bytes] = None,
) -> Dict[str, str]:
    """Encrypt a text message using AES-256-GCM.

    Parameters
    ----------
    session_key : bytes
        The 32-byte session key.
    plaintext : str
        The message to encrypt.
    associated_data : bytes, optional
        Additional authenticated data (not encrypted, but integrity-protected).

    Returns
    -------
    dict
        ``{"nonce": "<hex>", "ciphertext": "<hex>"}``
    """
    aesgcm = AESGCM(session_key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), associated_data)
    return {
        "nonce": nonce.hex(),
        "ciphertext": ct.hex(),
    }


def decrypt_message(
    session_key: bytes,
    nonce_hex: str,
    ciphertext_hex: str,
    associated_data: Optional[bytes] = None,
) -> str:
    """Decrypt an AES-256-GCM encrypted message.

    Parameters
    ----------
    session_key : bytes
        The 32-byte session key.
    nonce_hex : str
        The hex-encoded 96-bit nonce.
    ciphertext_hex : str
        The hex-encoded ciphertext (including the 16-byte auth tag).
    associated_data : bytes, optional
        The same AAD used during encryption.

    Returns
    -------
    str
        The decrypted plaintext.

    Raises
    ------
    cryptography.exceptions.InvalidTag
        If decryption fails (wrong key, tampered data, etc.).
    """
    aesgcm = AESGCM(session_key)
    plaintext = aesgcm.decrypt(
        bytes.fromhex(nonce_hex),
        bytes.fromhex(ciphertext_hex),
        associated_data,
    )
    return plaintext.decode("utf-8")


# ─── File Chunk Encryption ──────────────────────────────────────────────


def encrypt_file_chunk(
    session_key: bytes,
    chunk_data: bytes,
    chunk_index: int,
) -> Dict[str, str]:
    """Encrypt a file chunk with its index as associated data.

    Parameters
    ----------
    session_key : bytes
        The 32-byte session key.
    chunk_data : bytes
        The raw chunk bytes.
    chunk_index : int
        The chunk index (used as AAD for ordering verification).

    Returns
    -------
    dict
        ``{"nonce": "<hex>", "ciphertext": "<hex>", "index": chunk_index}``
    """
    aesgcm = AESGCM(session_key)
    nonce = os.urandom(12)
    aad = str(chunk_index).encode("ascii")
    ct = aesgcm.encrypt(nonce, chunk_data, aad)
    return {
        "nonce": nonce.hex(),
        "ciphertext": ct.hex(),
        "index": chunk_index,
    }


def decrypt_file_chunk(
    session_key: bytes,
    nonce_hex: str,
    ciphertext_hex: str,
    chunk_index: int,
) -> bytes:
    """Decrypt a file chunk, verifying its index via AAD.

    Returns
    -------
    bytes
        The raw decrypted chunk data.

    Raises
    ------
    cryptography.exceptions.InvalidTag
        If decryption fails or chunk_index does not match.
    """
    aesgcm = AESGCM(session_key)
    aad = str(chunk_index).encode("ascii")
    return aesgcm.decrypt(
        bytes.fromhex(nonce_hex),
        bytes.fromhex(ciphertext_hex),
        aad,
    )
