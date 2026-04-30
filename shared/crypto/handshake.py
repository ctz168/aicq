"""
Noise-XK-inspired authenticated key exchange handshake.

Implements a three-message handshake pattern:
1. Initiator → Responder: HandshakeRequest(identity_pub, ephemeral_pub)
2. Responder → Initiator: HandshakeResponse(identity_pub, ephemeral_pub, proof)

Key derivation:
1. Compute ee = X25519(ephemeral_secret, their_ephemeral_public)
2. Derive handshake key = HMAC-SHA512(ee, all_4_public_keys_concatenated)
3. Session key = first 32 bytes of the derived key
4. Proof = HMAC-SHA512(session_key, transcript_of_all_public_keys)

The transcript is the concatenation of all four public keys in canonical
order: initiator_identity + initiator_ephemeral + responder_identity +
responder_ephemeral.
"""

from typing import Tuple

from .types import KeyPair, HandshakeRequest, HandshakeResponse
from .key_exchange import compute_shared_secret, hmac_sha512


def _build_transcript(
    initiator_identity_pub: bytes,
    initiator_ephemeral_pub: bytes,
    responder_identity_pub: bytes,
    responder_ephemeral_pub: bytes,
) -> bytes:
    """Build the handshake transcript from all four public keys.

    The canonical ordering is: initiator_identity, initiator_ephemeral,
    responder_identity, responder_ephemeral.

    Args:
        initiator_identity_pub: Initiator's 32-byte identity public key.
        initiator_ephemeral_pub: Initiator's 32-byte ephemeral public key.
        responder_identity_pub: Responder's 32-byte identity public key.
        responder_ephemeral_pub: Responder's 32-byte ephemeral public key.

    Returns:
        The 128-byte concatenated transcript.
    """
    return (
        initiator_identity_pub
        + initiator_ephemeral_pub
        + responder_identity_pub
        + responder_ephemeral_pub
    )


def create_handshake_request(
    identity_pub_key: bytes,
    ephemeral_pub_key: bytes,
) -> HandshakeRequest:
    """Create a handshake request as the initiator.

    Args:
        identity_pub_key: The initiator's long-term Ed25519 public key (32 bytes).
        ephemeral_pub_key: The initiator's ephemeral X25519 public key (32 bytes).

    Returns:
        A HandshakeRequest containing both public keys.

    Raises:
        ValueError: If key lengths are incorrect.
    """
    if len(identity_pub_key) != 32:
        raise ValueError(
            f"Identity public key must be 32 bytes, got {len(identity_pub_key)}"
        )
    if len(ephemeral_pub_key) != 32:
        raise ValueError(
            f"Ephemeral public key must be 32 bytes, got {len(ephemeral_pub_key)}"
        )

    return HandshakeRequest(
        identity_public_key=identity_pub_key,
        ephemeral_public_key=ephemeral_pub_key,
    )


def create_handshake_response(
    request: HandshakeRequest,
    my_identity_keys: KeyPair,
    my_ephemeral_keys: KeyPair,
) -> Tuple[HandshakeResponse, bytes]:
    """Create a handshake response as the responder.

    Computes the shared secret, derives the session key, and generates
    an HMAC proof that binds all public keys to the session.

    Args:
        request: The initiator's HandshakeRequest.
        my_identity_keys: The responder's long-term identity KeyPair
            (Ed25519, public key used for transcript).
        my_ephemeral_keys: The responder's ephemeral KeyPair (X25519)
            used for the DH key exchange.

    Returns:
        A tuple of (HandshakeResponse, session_key) where:
        - HandshakeResponse contains the responder's public keys and proof.
        - session_key is the 32-byte derived session key.

    Raises:
        ValueError: If key lengths are incorrect or DH fails.
    """
    # Step 1: Compute ee = X25519(my_ephemeral_secret, their_ephemeral_public)
    ee = compute_shared_secret(
        my_ephemeral_keys.secret_key,
        request.ephemeral_public_key,
    )

    # Build transcript: initiator keys first, then responder keys
    transcript = _build_transcript(
        initiator_identity_pub=request.identity_public_key,
        initiator_ephemeral_pub=request.ephemeral_public_key,
        responder_identity_pub=my_identity_keys.public_key,
        responder_ephemeral_pub=my_ephemeral_keys.public_key,
    )

    # Step 2: Derive handshake key = HMAC-SHA512(ee, transcript)
    handshake_key = hmac_sha512(ee, transcript)

    # Step 3: Session key = first 32 bytes
    session_key = handshake_key[:32]

    # Step 4: Proof = HMAC-SHA512(session_key, transcript)
    proof = hmac_sha512(session_key, transcript)

    response = HandshakeResponse(
        identity_public_key=my_identity_keys.public_key,
        ephemeral_public_key=my_ephemeral_keys.public_key,
        proof=proof,
    )

    return response, session_key


def complete_handshake(
    response: HandshakeResponse,
    request: HandshakeRequest,
    my_identity_keys: KeyPair,
    my_ephemeral_keys: KeyPair,
) -> bytes:
    """Complete the handshake as the initiator.

    Computes the same shared secret and session key, then verifies
    the responder's proof to authenticate the handshake.

    Args:
        response: The responder's HandshakeResponse.
        request: The original HandshakeRequest that was sent.
        my_identity_keys: The initiator's long-term identity KeyPair
            (Ed25519, public key used for transcript).
        my_ephemeral_keys: The initiator's ephemeral KeyPair (X25519)
            used for the DH key exchange.

    Returns:
        The 32-byte session key.

    Raises:
        ValueError: If the proof verification fails, key lengths are
            incorrect, or the DH computation fails.
    """
    # Step 1: Compute ee = X25519(my_ephemeral_secret, their_ephemeral_public)
    ee = compute_shared_secret(
        my_ephemeral_keys.secret_key,
        response.ephemeral_public_key,
    )

    # Build transcript: initiator keys first, then responder keys
    transcript = _build_transcript(
        initiator_identity_pub=my_identity_keys.public_key,
        initiator_ephemeral_pub=my_ephemeral_keys.public_key,
        responder_identity_pub=response.identity_public_key,
        responder_ephemeral_pub=response.ephemeral_public_key,
    )

    # Step 2: Derive handshake key = HMAC-SHA512(ee, transcript)
    handshake_key = hmac_sha512(ee, transcript)

    # Step 3: Session key = first 32 bytes
    session_key = handshake_key[:32]

    # Step 4: Verify proof
    expected_proof = hmac_sha512(session_key, transcript)
    if not _constant_time_compare(response.proof, expected_proof):
        raise ValueError("Handshake proof verification failed")

    return session_key


def _constant_time_compare(a: bytes, b: bytes) -> bool:
    """Constant-time comparison of two byte strings.

    Uses hmac.compare_digest for timing-attack resistance.

    Args:
        a: First byte string.
        b: Second byte string.

    Returns:
        True if the strings are equal, False otherwise.
    """
    import hmac as _hmac
    return _hmac.compare_digest(a, b)
