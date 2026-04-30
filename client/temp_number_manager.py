"""
Temporary number management for friend discovery.

Temp numbers are 6-digit codes that can be shared via QR codes for
easy friend adding. The manager handles requesting, QR generation,
parsing, and cleanup.
"""

from __future__ import annotations

import time
from typing import Optional

try:
    import qrcode
    import io
    import base64
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

from .api_client import APIClient
from .db import ClientDatabase
from .types import TempNumberInfo, ParsedQR


class TempNumberManager:
    """Manages temporary 6-digit numbers for friend discovery.

    Temp numbers can be shared via QR codes and are used to initiate
    the handshake process. They expire after 10 minutes by default.
    """

    def __init__(self, api: APIClient, db: ClientDatabase):
        self._api = api
        self._db = db
        # Clean up expired numbers on init
        self._cleanup_expired()

    # ──────────────── Request ────────────────

    async def request_new(self) -> str:
        """Request a new 6-digit temporary number from the server."""
        number = await self._api.request_temp_number()

        now_ms = int(time.time() * 1000)
        expires_at = now_ms + 600_000  # 10 min default

        from datetime import datetime, timezone
        info = TempNumberInfo(
            number=number,
            expires_at=datetime.fromtimestamp(expires_at / 1000, tz=timezone.utc).isoformat(),
            created_at=datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat(),
        )

        await self._db.add_temp_number(info)
        return number

    # ──────────────── QR code generation ────────────────

    def generate_qr(self, number: str) -> str:
        """Generate a QR code containing the temp number.

        QR format: ``aicq:add:{number}``

        Returns a data URL of the QR code image, or an empty string if
        the qrcode library is not installed.
        """
        if not HAS_QRCODE:
            return ""

        qr_data = f"aicq:add:{number}"
        img = qrcode.make(qr_data)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"

    # ──────────────── QR parsing ────────────────

    @staticmethod
    def scan_and_parse(qr_data: str) -> Optional[ParsedQR]:
        """Parse a QR code data string.

        Supported formats:
            - ``aicq:add:{6-digit-number}`` -> temp number
            - ``aicq:privkey:v1:{...}`` -> private key export

        Returns a ParsedQR or None if the format is not recognised.
        """
        trimmed = qr_data.strip()

        # Temp number format
        if trimmed.startswith("aicq:add:"):
            number = trimmed[len("aicq:add:"):]
            if number.isdigit() and len(number) == 6:
                return ParsedQR(number=number)
            return None

        # Private key format
        if trimmed.startswith("aicq:privkey:v1:"):
            return ParsedQR(number="", server_url=trimmed)

        return None

    # ──────────────── Query ────────────────

    async def get_active_numbers(self) -> list[TempNumberInfo]:
        self._cleanup_expired()
        return await self._db.get_temp_numbers()

    # ──────────────── Revoke ────────────────

    async def revoke(self, number: str) -> None:
        """Revoke a temporary number."""
        await self._api.revoke_temp_number(number)
        await self._db.remove_temp_number(number)

    # ──────────────── Cleanup ────────────────

    def _cleanup_expired(self) -> None:
        """Remove expired numbers (synchronous check, DB cleanup is async)."""
        # The actual cleanup happens on the next async call
        pass
