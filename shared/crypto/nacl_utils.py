"""
Utility helpers for encoding and decoding binary data.

Provides Base64 and UTF-8 convenience functions used across the
cryptographic library for serializing keys, nonces, and ciphertext.
"""

import base64


def encode_base64(data: bytes) -> str:
    """Encode bytes to a Base64 string.

    Args:
        data: Raw bytes to encode.

    Returns:
        Base64-encoded string (standard alphabet, with padding).
    """
    return base64.b64encode(data).decode("ascii")


def decode_base64(s: str) -> bytes:
    """Decode a Base64 string to bytes.

    Args:
        s: Base64-encoded string.

    Returns:
        Decoded raw bytes.

    Raises:
        ValueError: If the input is not valid Base64.
    """
    try:
        return base64.b64decode(s)
    except Exception as exc:
        raise ValueError(f"Invalid Base64 input: {exc}") from exc


def encode_utf8(s: str) -> bytes:
    """Encode a Unicode string to UTF-8 bytes.

    Args:
        s: Unicode string.

    Returns:
        UTF-8 encoded bytes.
    """
    return s.encode("utf-8")


def decode_utf8(data: bytes) -> str:
    """Decode UTF-8 bytes to a Unicode string.

    Args:
        data: UTF-8 encoded bytes.

    Returns:
        Decoded Unicode string.

    Raises:
        ValueError: If the input is not valid UTF-8.
    """
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"Invalid UTF-8 input: {exc}") from exc
