"""
AICQ Handshake Service
========================
Handles the P2P handshake flow: initiate a connection by temp number,
respond with data, confirm to establish bidirectional friendship,
and manage pending requests.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, iso_now
from config import Config

logger = logging.getLogger("aicq.handshake_service")


async def initiate(
    db: DatabaseManager,
    requester_id: str,
    target_temp_number: str,
) -> Dict[str, Any]:
    """Initiate a handshake by looking up a target via temp number.

    Creates a handshake_session with status='initiated' and a pending_request.
    Returns the handshake session details.

    Raises ValueError if the temp number is invalid, expired, or the requester
    is the same as the target.
    """
    # Resolve temp number to target node
    from services.temp_number_service import resolve
    target = await resolve(db, target_temp_number)
    if not target:
        raise ValueError("Invalid or expired temp number")

    target_node_id = target["node_id"]

    if requester_id == target_node_id:
        raise ValueError("Cannot initiate a handshake with yourself")

    # Verify requester account exists
    requester = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (requester_id,))
    if not requester:
        raise ValueError("Requester account not found")

    # Check for existing pending handshake
    existing = await db.fetchone(
        """
        SELECT id FROM handshake_sessions
        WHERE requester_id = ? AND target_node_id = ? AND status = 'initiated'
        """,
        (requester_id, target_node_id),
    )
    if existing:
        raise ValueError("A pending handshake already exists with this target")

    session_id = uuid.uuid4().hex
    now = iso_now()
    # Handshake expires in 1 hour
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    # Create handshake session
    await db.execute(
        """
        INSERT INTO handshake_sessions
            (id, requester_id, target_node_id, status, created_at, expires_at)
        VALUES (?, ?, ?, 'initiated', ?, ?)
        """,
        (session_id, requester_id, target_node_id, now, expires_at),
    )

    # Create pending request for the target
    await db.execute(
        """
        INSERT OR REPLACE INTO pending_requests
            (target_node_id, from_node_id, temp_number, session_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (target_node_id, requester_id, target_temp_number, session_id, now),
    )

    logger.info("Handshake initiated: %s -> %s (session %s)", requester_id, target_node_id, session_id)
    return {
        "id": session_id,
        "requester_id": requester_id,
        "target_node_id": target_node_id,
        "status": "initiated",
        "created_at": now,
        "expires_at": expires_at,
    }


async def respond(
    db: DatabaseManager,
    session_id: str,
    responder_id: str,
    response_data: str,
) -> Dict[str, Any]:
    """Respond to a handshake session.

    Updates the session status to 'responded' and stores the response data.
    Only the target of the handshake can respond.

    Raises ValueError if the session is not found, not in 'initiated' status,
    or the responder is not the target.
    """
    session = await db.fetchone("SELECT * FROM handshake_sessions WHERE id = ?", (session_id,))
    if not session:
        raise ValueError("Handshake session not found")

    if session["status"] != "initiated":
        raise ValueError(f"Handshake session is already {session['status']}")

    if session["target_node_id"] != responder_id:
        raise ValueError("Only the target can respond to this handshake")

    # Check if expired
    now_iso = iso_now()
    if session["expires_at"] < now_iso:
        await db.execute(
            "UPDATE handshake_sessions SET status = 'failed' WHERE id = ?",
            (session_id,),
        )
        raise ValueError("Handshake session has expired")

    now = iso_now()
    await db.execute(
        """
        UPDATE handshake_sessions
        SET status = 'responded', response_data = ?
        WHERE id = ?
        """,
        (response_data, session_id),
    )

    logger.info("Handshake responded: session %s by %s", session_id, responder_id)
    return {
        "id": session_id,
        "status": "responded",
        "response_data": response_data,
    }


async def confirm(
    db: DatabaseManager,
    session_id: str,
    confirmer_id: str,
    confirm_data: str,
) -> Dict[str, Any]:
    """Confirm a handshake, creating a bidirectional friendship.

    Updates the session status to 'confirmed', stores the confirm data,
    and creates a bidirectional friendship via friendship_service.
    Either the requester or target can confirm.

    Raises ValueError if the session is not found or not in 'responded' status.
    """
    session = await db.fetchone("SELECT * FROM handshake_sessions WHERE id = ?", (session_id,))
    if not session:
        raise ValueError("Handshake session not found")

    if session["status"] != "responded":
        raise ValueError(f"Handshake session must be in 'responded' status (currently {session['status']})")

    # Only the requester or target can confirm
    if confirmer_id not in (session["requester_id"], session["target_node_id"]):
        raise ValueError("Only the requester or target can confirm this handshake")

    # Check if expired
    now_iso = iso_now()
    if session["expires_at"] < now_iso:
        await db.execute(
            "UPDATE handshake_sessions SET status = 'failed' WHERE id = ?",
            (session_id,),
        )
        raise ValueError("Handshake session has expired")

    now = iso_now()
    await db.execute(
        """
        UPDATE handshake_sessions
        SET status = 'confirmed', confirm_data = ?
        WHERE id = ?
        """,
        (confirm_data, session_id),
    )

    # Remove pending request
    await db.execute(
        "DELETE FROM pending_requests WHERE session_id = ?",
        (session_id,),
    )

    # Create bidirectional friendship
    from services.friendship_service import add_friend_bidirectional
    await add_friend_bidirectional(db, session["requester_id"], session["target_node_id"])

    logger.info(
        "Handshake confirmed: session %s, friendship %s <-> %s",
        session_id,
        session["requester_id"],
        session["target_node_id"],
    )
    return {
        "id": session_id,
        "status": "confirmed",
        "confirm_data": confirm_data,
        "friendship_established": True,
    }


async def get_pending_requests(
    db: DatabaseManager,
    node_id: str,
) -> List[Dict[str, Any]]:
    """List pending handshake requests for a node.

    Returns requests where the node is the target.
    """
    requests = await db.fetchall(
        """
        SELECT pr.*, hs.status as session_status, hs.created_at as session_created_at
        FROM pending_requests pr
        JOIN handshake_sessions hs ON pr.session_id = hs.id
        WHERE pr.target_node_id = ? AND hs.status = 'initiated'
        ORDER BY pr.created_at DESC
        """,
        (node_id,),
    )

    return requests


async def cleanup_expired(db: DatabaseManager) -> Dict[str, int]:
    """Delete expired handshake sessions and stale pending requests.

    Returns a dict with the count of deleted records per table.
    """
    now = iso_now()
    results: Dict[str, int] = {}

    # Mark expired handshake sessions as failed
    cursor = await db.execute(
        "UPDATE handshake_sessions SET status = 'failed' WHERE expires_at < ? AND status IN ('initiated', 'responded')",
        (now,),
    )
    results["handshake_sessions_failed"] = cursor.rowcount

    # Delete pending requests for failed/expired sessions
    cursor = await db.execute(
        """
        DELETE FROM pending_requests
        WHERE session_id IN (
            SELECT id FROM handshake_sessions WHERE status = 'failed'
        )
        """,
    )
    results["pending_requests_deleted"] = cursor.rowcount

    # Also clean up old pending requests (older than 48 hours)
    cursor = await db.execute(
        "DELETE FROM pending_requests WHERE created_at < datetime(?, '-48 hours')",
        (now,),
    )
    results["pending_requests_stale"] = cursor.rowcount

    logger.info("Handshake cleanup: %s", results)
    return results
