"""
Hashing Utilities
====================
SHA-256 hashing for file integrity verification and key fingerprinting.
"""

from __future__ import annotations

import hashlib
from typing import Union


def sha256_hex(data: Union[str, bytes]) -> str:
    """Compute the SHA-256 hash of *data* and return the hex digest.

    Parameters
    ----------
    data : str | bytes
        Input data. Strings are encoded as UTF-8 before hashing.

    Returns
    -------
    str
        The 64-character lowercase hex digest.
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def sha256_bytes(data: Union[str, bytes]) -> bytes:
    """Compute the SHA-256 hash of *data* and return the raw 32-byte digest.

    Parameters
    ----------
    data : str | bytes
        Input data. Strings are encoded as UTF-8 before hashing.

    Returns
    -------
    bytes
        The raw 32-byte SHA-256 digest.
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).digest()
