"""
Identity management — Ed25519 signing keys + X25519 key-exchange keys.

Supports generating fresh keys on first run, loading existing keys from
the persistent SQLite store, and QR-based private key export/import
with password protection and rate limiting.
"""

from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path
from typing import Optional

import sys
_shared = str(Path(__file__).resolve().parent.parent / "shared")
if _shared not in sys.path:
    sys.path.insert(0, _shared)

from crypto import (
    KeyPair,
    generate_signing_keypair,
    generate_key_exchange_keypair,
    get_public_key_fingerprint,
    encrypt_with_password,
    decrypt_with_password,
    encode_base64,
    decode_base64,
)

try:
    import qrcode
    import io
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

from .db import ClientDatabase

QR_VALIDITY_MS = 60_000          # 60 seconds
MAX_QR_PER_WINDOW = 3
QR_RATE_WINDOW_MS = 5 * 60_000   # 5 minutes


class IdentityManager:
    """Manages Ed25519 signing and X25519 key-exchange identity keys.

    Keys are persisted in the client's SQLite database. On first run,
    fresh key pairs are generated and stored. Subsequent runs reload
    from the database.

    QR-based private key export is rate-limited to prevent abuse.
    """

    def __init__(self, db: ClientDatabase):
        self._db = db
        self._signing_keys: Optional[KeyPair] = None
        self._exchange_keys: Optional[KeyPair] = None
        self._qr_history: list[float] = []

    # ──────────────── Initialise ────────────────

    async def initialize(self, user_id: Optional[str] = None) -> None:
        """Load existing keys from the database or generate fresh ones.

        If *user_id* is provided and differs from the stored one, new
        keys are generated.
        """
        stored = await self._db.load_identity()
        if stored and (not user_id or user_id == stored.get("user_id")):
            self._signing_keys = KeyPair(
                public_key=base64.b64decode(stored["signing_public_key"]),
                secret_key=base64.b64decode(stored["signing_secret_key"]),
            )
            self._exchange_keys = KeyPair(
                public_key=base64.b64decode(stored["exchange_public_key"]),
                secret_key=base64.b64decode(stored["exchange_secret_key"]),
            )
            return

        await self.regenerate_keys(user_id)

    async def regenerate_keys(self, user_id: Optional[str] = None) -> None:
        """Generate a fresh Ed25519 + X25519 key pair and persist."""
        self._signing_keys = generate_signing_keypair()
        self._exchange_keys = generate_key_exchange_keypair()
        await self._db.save_identity(
            user_id=user_id or "",
            signing_pub=encode_base64(self._signing_keys.public_key),
            signing_sec=encode_base64(self._signing_keys.secret_key),
            exchange_pub=encode_base64(self._exchange_keys.public_key),
            exchange_sec=encode_base64(self._exchange_keys.secret_key),
        )

    # ──────────────── Accessors ────────────────

    async def get_user_id(self) -> str:
        identity = await self._db.load_identity()
        return identity["user_id"] if identity else ""

    def get_public_key(self) -> bytes:
        if not self._signing_keys:
            raise RuntimeError("Identity not initialised")
        return self._signing_keys.public_key

    def get_signing_secret_key(self) -> bytes:
        if not self._signing_keys:
            raise RuntimeError("Identity not initialised")
        return self._signing_keys.secret_key

    def get_exchange_public_key(self) -> bytes:
        if not self._exchange_keys:
            raise RuntimeError("Identity not initialised")
        return self._exchange_keys.public_key

    def get_exchange_secret_key(self) -> bytes:
        if not self._exchange_keys:
            raise RuntimeError("Identity not initialised")
        return self._exchange_keys.secret_key

    def get_public_key_fingerprint(self) -> str:
        return get_public_key_fingerprint(self.get_public_key())

    @property
    def signing_keys(self) -> Optional[KeyPair]:
        return self._signing_keys

    @property
    def exchange_keys(self) -> Optional[KeyPair]:
        return self._exchange_keys

    # ──────────────── QR export / import ────────────────

    async def export_private_key_qr(self, password: str) -> dict:
        """Export the private signing key as an encrypted QR code.

        The QR payload format:
            aicq:privkey:v1:{base64(salt)}:{base64(iv)}:{base64(encrypted)}:{expiresAt}

        Returns:
            dict with ``qr_data_url`` and ``expires_at`` keys.

        Raises:
            RuntimeError: If rate-limited or qrcode library not installed.
        """
        if not HAS_QRCODE:
            raise RuntimeError("qrcode library not installed; pip install qrcode[pil]")

        now_ms = int(time.time() * 1000)
        # Rate-limit check
        self._qr_history = [t for t in self._qr_history if now_ms - t < QR_RATE_WINDOW_MS]
        if len(self._qr_history) >= MAX_QR_PER_WINDOW:
            raise RuntimeError(
                f"Rate limit: max {MAX_QR_PER_WINDOW} QR exports per {QR_RATE_WINDOW_MS // 1000}s"
            )

        if not self._signing_keys:
            raise RuntimeError("Identity not initialised")

        user_id = await self.get_user_id()
        payload_obj = json.dumps({
            "userId": user_id,
            "signingSecretKey": encode_base64(self._signing_keys.secret_key),
            "exchangeSecretKey": encode_base64(self._exchange_keys.secret_key),
        }).encode("utf-8")

        encrypted = encrypt_with_password(payload_obj, password)

        expires_at = now_ms + QR_VALIDITY_MS
        qr_payload = ":".join([
            "aicq:privkey:v1",
            encode_base64(encrypted.salt),
            encode_base64(encrypted.iv),
            encode_base64(encrypted.encrypted),
            format(expires_at, "x"),
        ])

        img = qrcode.make(qr_payload)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        qr_data_url = f"data:image/png;base64,{b64}"

        self._qr_history.append(now_ms)
        from datetime import datetime, timezone
        return {
            "qr_data_url": qr_data_url,
            "expires_at": datetime.fromtimestamp(expires_at / 1000, tz=timezone.utc).isoformat(),
        }

    async def import_private_key_from_qr(self, qr_string: str, password: str) -> bool:
        """Import a private key from an encrypted QR code payload string.

        Returns True on success, False on failure.
        """
        try:
            if not qr_string.startswith("aicq:privkey:v1:"):
                return False

            parts = qr_string.split(":")
            if len(parts) < 7:
                return False

            salt = decode_base64(parts[3])
            iv = decode_base64(parts[4])
            encrypted = decode_base64(parts[5])
            expires_at = int(parts[6], 16)

            if int(time.time() * 1000) > expires_at:
                raise RuntimeError("QR code has expired")

            decrypted = decrypt_with_password(salt, iv, encrypted, password)
            if decrypted is None:
                raise RuntimeError("Decryption failed — wrong password?")

            payload_obj = json.loads(decrypted.decode("utf-8"))
            if not payload_obj.get("signingSecretKey") or not payload_obj.get("exchangeSecretKey"):
                raise RuntimeError("Invalid key payload structure")

            signing_sec = decode_base64(payload_obj["signingSecretKey"])
            exchange_sec = decode_base64(payload_obj["exchangeSecretKey"])

            # Derive public keys from secret keys
            if len(signing_sec) == 64:
                # tweetnacl combined format: seed(32) + pub(32)
                signing_pub = signing_sec[32:]
            elif len(signing_sec) == 32:
                import nacl.signing
                sk = nacl.signing.SigningKey(signing_sec)
                signing_pub = bytes(sk.verify_key)
                signing_sec = bytes(sk) + signing_pub
            else:
                raise RuntimeError(f"Invalid signing secret key length: {len(signing_sec)}")

            if len(exchange_sec) == 32:
                import nacl.public
                pk = nacl.public.PrivateKey(exchange_sec)
                exchange_pub = bytes(pk.public_key)
            elif len(exchange_sec) == 64:
                exchange_pub = exchange_sec[32:]
            else:
                raise RuntimeError(f"Invalid exchange secret key length: {len(exchange_sec)}")

            self._signing_keys = KeyPair(public_key=signing_pub, secret_key=signing_sec)
            self._exchange_keys = KeyPair(public_key=exchange_pub, secret_key=exchange_sec)

            user_id = payload_obj.get("userId", "")
            await self._db.save_identity(
                user_id=user_id,
                signing_pub=encode_base64(signing_pub),
                signing_sec=encode_base64(signing_sec),
                exchange_pub=encode_base64(exchange_pub),
                exchange_sec=encode_base64(exchange_sec),
            )
            return True
        except Exception as exc:
            print(f"[IdentityManager] Import failed: {exc}")
            return False
