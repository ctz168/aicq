"""
Binary wire-format message encoding and end-to-end encrypt/decrypt.

Wire format:
    version(1) + senderFP(32) + nonce(24) + ciphertext(N) + signature(64)

This matches the original @aicq/crypto TypeScript library's message
serialization format.
"""

from typing import Optional

from .types import ParsedMessage
from .cipher import encrypt as _encrypt, decrypt as _decrypt
from .signer import sign, verify
from .keygen import get_public_key_fingerprint

# Protocol version byte
MESSAGE_VERSION = 1

# Fixed field sizes (in bytes)
VERSION_SIZE = 1
FINGERPRINT_SIZE = 32
NONCE_SIZE = 24
SIGNATURE_SIZE = 64


def create_message(
    sender_pub_key: bytes,
    nonce: bytes,
    ciphertext: bytes,
    signature: bytes,
) -> bytes:
    """Serialize an encrypted message into the binary wire format.

    Wire format: version(1) + senderFP(32) + nonce(24) + ciphertext(N) + signature(64)

    Args:
        sender_pub_key: The sender's 32-byte public key (converted to
            fingerprint internally).
        nonce: The 24-byte encryption nonce.
        ciphertext: The encrypted payload bytes.
        signature: The 64-byte Ed25519 detached signature.

    Returns:
        The serialized binary message.

    Raises:
        ValueError: If any field has an incorrect length.
    """
    if len(sender_pub_key) != 32:
        raise ValueError(
            f"Sender public key must be 32 bytes, got {len(sender_pub_key)}"
        )
    if len(nonce) != NONCE_SIZE:
        raise ValueError(
            f"Nonce must be {NONCE_SIZE} bytes, got {len(nonce)}"
        )
    if len(signature) != SIGNATURE_SIZE:
        raise ValueError(
            f"Signature must be {SIGNATURE_SIZE} bytes, got {len(signature)}"
        )

    fingerprint = get_public_key_fingerprint(sender_pub_key)
    fingerprint_bytes = bytes.fromhex(fingerprint)

    return (
        bytes([MESSAGE_VERSION])
        + fingerprint_bytes
        + nonce
        + ciphertext
        + signature
    )


def parse_message(data: bytes) -> Optional[ParsedMessage]:
    """Parse a binary wire-format message.

    Args:
        data: The serialized binary message.

    Returns:
        A ParsedMessage with all fields extracted, or None if the data
        is too short or has an unsupported version.
    """
    # Minimum message size: version(1) + FP(32) + nonce(24) + ciphertext(0) + signature(64) = 121
    min_size = VERSION_SIZE + FINGERPRINT_SIZE + NONCE_SIZE + SIGNATURE_SIZE
    if len(data) < min_size:
        return None

    offset = 0

    version = data[offset]
    offset += VERSION_SIZE
    if version != MESSAGE_VERSION:
        return None

    sender_fingerprint = data[offset : offset + FINGERPRINT_SIZE]
    offset += FINGERPRINT_SIZE

    nonce = data[offset : offset + NONCE_SIZE]
    offset += NONCE_SIZE

    # Ciphertext is everything between nonce and the last 64 bytes (signature)
    signature = data[-SIGNATURE_SIZE:]
    ciphertext = data[offset : -SIGNATURE_SIZE]

    return ParsedMessage(
        version=version,
        sender_fingerprint=sender_fingerprint,
        nonce=nonce,
        ciphertext=ciphertext,
        signature=signature,
    )


def encrypt_message(
    plaintext: str,
    session_key: bytes,
    signing_secret_key: bytes,
    sender_pub_key: bytes,
) -> bytes:
    """Encrypt a string message and sign it with the sender's Ed25519 key.

    Performs the following steps:
    1. Encode the plaintext string as UTF-8.
    2. Encrypt with XSalsa20-Poly1305 using the session key.
    3. Sign the ciphertext with the sender's Ed25519 secret key.
    4. Serialize into the binary wire format.

    Args:
        plaintext: The message string to encrypt.
        session_key: The 32-byte symmetric session key.
        signing_secret_key: The sender's 64-byte Ed25519 secret key.
        sender_pub_key: The sender's 32-byte Ed25519 public key.

    Returns:
        The serialized encrypted message in wire format.

    Raises:
        ValueError: If any input has an incorrect length.
    """
    # Encode plaintext
    plaintext_bytes = plaintext.encode("utf-8")

    # Encrypt
    ciphertext, nonce = _encrypt(plaintext_bytes, session_key)

    # Sign the ciphertext
    signature = sign(ciphertext, signing_secret_key)

    # Serialize
    return create_message(sender_pub_key, nonce, ciphertext, signature)


def decrypt_message(
    data: bytes,
    session_key: bytes,
    sender_pub_key: bytes,
) -> Optional[str]:
    """Decrypt and verify a wire-format encrypted message.

    Performs the following steps:
    1. Parse the binary wire format.
    2. Verify the Ed25519 signature on the ciphertext.
    3. Decrypt the ciphertext with XSalsa20-Poly1305.
    4. Decode the UTF-8 plaintext.

    Args:
        data: The serialized encrypted message.
        session_key: The 32-byte symmetric session key.
        sender_pub_key: The sender's 32-byte Ed25519 public key.

    Returns:
        The decrypted plaintext string, or None if parsing, signature
        verification, or decryption fails.
    """
    # Parse
    parsed = parse_message(data)
    if parsed is None:
        return None

    # Verify signature
    if not verify(parsed.ciphertext, parsed.signature, sender_pub_key):
        return None

    # Decrypt
    plaintext_bytes = _decrypt(parsed.ciphertext, session_key, parsed.nonce)
    if plaintext_bytes is None:
        return None

    # Decode UTF-8
    try:
        return plaintext_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None
