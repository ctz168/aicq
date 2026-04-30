"""
Key generation utilities for Ed25519 signing and X25519 key exchange.

Provides functions to generate key pairs, derive X25519 keys from Ed25519
keys (matching the tweetnacl/NaCl convention), and compute public key
fingerprints for identification.
"""

import hashlib

import nacl.signing
import nacl.public
import nacl.hash
import nacl.encoding

from .types import KeyPair


def generate_signing_keypair() -> KeyPair:
    """Generate a new Ed25519 signing key pair.

    Returns:
        A KeyPair with 32-byte public key and 64-byte secret key
        (seed + public key concatenated, matching tweetnacl convention).
    """
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    # In PyNaCl, the signing key's encode() gives the 32-byte seed.
    # The full 64-byte secret key (seed || public_key) matches tweetnacl.
    secret_key = bytes(signing_key) + bytes(verify_key)
    return KeyPair(
        public_key=bytes(verify_key),
        secret_key=secret_key,
    )


def generate_key_exchange_keypair() -> KeyPair:
    """Generate a new X25519 key exchange key pair.

    Returns:
        A KeyPair with 32-byte public key and 32-byte secret key.
    """
    private_key = nacl.public.PrivateKey.generate()
    public_key = private_key.public_key
    return KeyPair(
        public_key=bytes(public_key),
        secret_key=bytes(private_key),
    )


def derive_x25519_from_ed25519(ed25519_secret_key: bytes) -> bytes:
    """Derive an X25519 secret key from an Ed25519 secret key.

    This follows the tweetnacl convention: take the SHA-512 hash of the
    Ed25519 seed (first 32 bytes of the 64-byte secret key), then clamp
    the first 32 bytes of the hash to produce a valid X25519 scalar.

    Args:
        ed25519_secret_key: The 64-byte Ed25519 secret key
            (seed || public_key).

    Returns:
        The 32-byte X25519 secret key.

    Raises:
        ValueError: If the input is not exactly 64 bytes.
    """
    if len(ed25519_secret_key) != 64:
        raise ValueError(
            f"Ed25519 secret key must be 64 bytes, got {len(ed25519_secret_key)}"
        )

    # Extract the 32-byte seed
    seed = ed25519_secret_key[:32]

    # SHA-512 hash of the seed
    h = nacl.hash.sha512(seed, encoder=nacl.encoding.RawEncoder)

    # Clamp the first 32 bytes to produce a valid X25519 scalar
    # This matches tweetnacl's crypto_sign_ed25519_pk_to_x25519 behavior
    scalar = bytearray(h[:32])
    scalar[0] &= 248    # Clear bottom 3 bits
    scalar[31] &= 127   # Clear top bit
    scalar[31] |= 64    # Set second-to-top bit

    return bytes(scalar)


def get_public_key_fingerprint(public_key: bytes) -> str:
    """Compute a short fingerprint of a public key.

    Takes the SHA-512 hash of the public key, truncates to the first
    16 bytes, and returns as a lowercase hex string (32 characters).

    Args:
        public_key: The 32-byte public key.

    Returns:
        A 32-character lowercase hex fingerprint string.

    Raises:
        ValueError: If the input is not exactly 32 bytes.
    """
    if len(public_key) != 32:
        raise ValueError(
            f"Public key must be 32 bytes, got {len(public_key)}"
        )

    full_hash = nacl.hash.sha512(public_key, encoder=nacl.encoding.RawEncoder)
    truncated = full_hash[:16]
    return truncated.hex()
