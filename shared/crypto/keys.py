"""
Key Generation and Management
================================
Ed25519 signing keys and X25519 key-exchange keys using PyNaCl.
"""

from __future__ import annotations

import hashlib
from typing import Tuple

from nacl.signing import SigningKey, VerifyKey
from nacl.public import PrivateKey, PublicKey, Box
from nacl.encoding import HexEncoder


# ─── Signing Keypair (Ed25519) ──────────────────────────────────────────


def generate_signing_keypair() -> Tuple[SigningKey, VerifyKey]:
    """Generate a new Ed25519 signing keypair.

    Returns
    -------
    (SigningKey, VerifyKey)
        The private signing key and its corresponding public verify key.
    """
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    return signing_key, verify_key


def sign_bytes(signing_key: SigningKey, data: bytes) -> bytes:
    """Sign arbitrary bytes with an Ed25519 signing key.

    Returns the 64-byte detached signature.
    """
    signed = signing_key.sign(data)
    return signed.signature


def verify_signature(verify_key: VerifyKey, data: bytes, signature: bytes) -> bool:
    """Verify an Ed25519 detached signature.

    Returns ``True`` if the signature is valid, ``False`` otherwise.
    """
    try:
        verify_key.verify(data, signature)
        return True
    except Exception:
        return False


# ─── Key Exchange Keypair (X25519) ──────────────────────────────────────


def generate_exchange_keypair() -> Tuple[PrivateKey, PublicKey]:
    """Generate a new X25519 key-exchange keypair.

    Returns
    -------
    (PrivateKey, PublicKey)
        The private key and its corresponding public key for ECDH.
    """
    private_key = PrivateKey.generate()
    public_key = private_key.public_key
    return private_key, public_key


def derive_shared_secret(
    my_private: PrivateKey,
    their_public: PublicKey,
) -> bytes:
    """Derive a 32-byte shared secret using X25519 ECDH.

    Parameters
    ----------
    my_private : PrivateKey
        Your X25519 private key.
    their_public : PublicKey
        The peer's X25519 public key.

    Returns
    -------
    bytes
        The 32-byte shared secret.
    """
    box = Box(my_private, their_public)
    return box.shared_key()


# ─── Fingerprint ────────────────────────────────────────────────────────


def get_public_key_fingerprint(public_key: bytes | VerifyKey | PublicKey) -> str:
    """Compute a human-readable fingerprint from a public key.

    Returns a hex string like ``AB12:CD34:...`` (5 groups of 4 hex chars).

    Parameters
    ----------
    public_key : bytes | VerifyKey | PublicKey
        The raw public key bytes (32 bytes).

    Returns
    -------
    str
        The colon-separated fingerprint string.
    """
    if isinstance(public_key, (VerifyKey, PublicKey)):
        raw = bytes(public_key)
    else:
        raw = public_key

    digest = hashlib.sha256(raw).hexdigest().upper()
    # Split into groups of 4 for readability
    groups = [digest[i:i + 4] for i in range(0, min(20, len(digest)), 4)]
    return ":".join(groups)


# ─── Hex Serialization ──────────────────────────────────────────────────


def key_to_hex(key) -> str:
    """Serialize any NaCl key to a hex string."""
    if isinstance(key, (SigningKey, PrivateKey)):
        return bytes(key).hex()
    elif isinstance(key, (VerifyKey, PublicKey)):
        return bytes(key).hex()
    elif isinstance(key, bytes):
        return key.hex()
    else:
        raise TypeError(f"Unsupported key type: {type(key)}")


def hex_to_signing_key(hex_str: str) -> SigningKey:
    """Deserialize a hex string to a SigningKey."""
    return SigningKey(bytes.fromhex(hex_str))


def hex_to_verify_key(hex_str: str) -> VerifyKey:
    """Deserialize a hex string to a VerifyKey."""
    return VerifyKey(bytes.fromhex(hex_str))


def hex_to_public_key(hex_str: str) -> PublicKey:
    """Deserialize a hex string to an X25519 PublicKey."""
    return PublicKey(bytes.fromhex(hex_str))


def hex_to_secret_key(hex_str: str) -> PrivateKey:
    """Deserialize a hex string to an X25519 PrivateKey."""
    return PrivateKey(bytes.fromhex(hex_str))
