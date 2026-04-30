"""
AICQ Temp Number Service
==========================
Handles generation, resolution, and revocation of temporary 6-digit
numbers used for P2P handshake discovery.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from db import DatabaseManager, iso_now
from config import Config

logger = logging.getLogger("aicq.temp_number_service")


async def generate(
    db: DatabaseManager,
    node_id: str,
) -> Dict[str, Any]:
    """Generate a unique 6-digit temp number for a node.

    Sets a TTL based on Config.TEMP_NUMBER_TTL_HOURS. If the node already
    has an active temp number, it is replaced.

    Returns a dict with number and expires_at.
    """
    # Delete any existing temp numbers for this node
    await db.execute("DELETE FROM temp_numbers WHERE node_id = ?", (node_id,))

    # Generate a unique 6-digit number (100000–999999)
    number = _generate_unique_number()

    now = iso_now()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=Config.TEMP_NUMBER_TTL_HOURS)).isoformat()

    # Insert, retrying on collision
    inserted = False
    attempts = 0
    while not inserted and attempts < 10:
        try:
            await db.execute(
                """
                INSERT INTO temp_numbers (number, node_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (number, node_id, expires_at, now),
            )
            inserted = True
        except Exception:
            # Likely a unique constraint violation — generate a new number
            number = _generate_unique_number()
            attempts += 1

    if not inserted:
        raise RuntimeError("Failed to generate a unique temp number after 10 attempts")

    logger.info("Temp number generated: %s for node %s", number, node_id)
    return {
        "number": number,
        "node_id": node_id,
        "expires_at": expires_at,
        "created_at": now,
    }


async def resolve(
    db: DatabaseManager,
    number: str,
) -> Optional[Dict[str, Any]]:
    """Lookup a temp number and return the associated node info.

    Returns None if the number doesn't exist or has expired.
    On successful resolution, also returns account details for the node.
    """
    row = await db.fetchone(
        "SELECT * FROM temp_numbers WHERE number = ?",
        (number,),
    )
    if row is None:
        return None

    # Check if expired
    now = iso_now()
    if row["expires_at"] < now:
        # Clean up expired entry
        await db.execute("DELETE FROM temp_numbers WHERE number = ?", (number,))
        return None

    # Get associated account info
    account = await db.fetchone(
        "SELECT id, type, display_name, agent_name, public_key, status FROM accounts WHERE id = ?",
        (row["node_id"],),
    )

    return {
        "number": row["number"],
        "node_id": row["node_id"],
        "expires_at": row["expires_at"],
        "account": account,
    }


async def revoke(
    db: DatabaseManager,
    number: str,
    node_id: str,
) -> bool:
    """Revoke (delete) a temp number.

    Only the node that owns the number can revoke it.
    Returns True if the number was deleted, False otherwise.
    """
    # Verify ownership
    row = await db.fetchone(
        "SELECT node_id FROM temp_numbers WHERE number = ?",
        (number,),
    )
    if row is None:
        return False

    if row["node_id"] != node_id:
        raise ValueError("Cannot revoke a temp number you do not own")

    await db.execute("DELETE FROM temp_numbers WHERE number = ?", (number,))
    logger.info("Temp number revoked: %s by node %s", number, node_id)
    return True


# ─── Internal Helpers ──────────────────────────────────────────────────


def _generate_unique_number() -> str:
    """Generate a random 6-digit number as a string (100000–999999)."""
    return str(100000 + secrets.randbelow(900000))
