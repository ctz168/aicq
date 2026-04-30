"""
AICQ Friend Request Service
=============================
Handles sending, listing, accepting, and rejecting friend requests.
On acceptance, delegates to friendship_service to create the bidirectional
friendship.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.friend_request_service")


async def send_request(
    db: DatabaseManager,
    from_id: str,
    to_id: str,
    message: Optional[str] = None,
    permissions: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Send a friend request.

    Creates a friend_request with status='pending'.
    Raises ValueError if:
      - from_id and to_id are the same
      - a pending request already exists in either direction
      - the accounts are already friends
    """
    if from_id == to_id:
        raise ValueError("Cannot send a friend request to yourself")

    # Verify both accounts exist
    from_account = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (from_id,))
    if not from_account:
        raise ValueError("Sender account not found")

    to_account = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (to_id,))
    if not to_account:
        raise ValueError("Target account not found")

    # Check for existing pending request in either direction
    existing = await db.fetchone(
        """
        SELECT id FROM friend_requests
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND status = 'pending'
        """,
        (from_id, to_id, to_id, from_id),
    )
    if existing:
        raise ValueError("A pending friend request already exists between these accounts")

    # Check if already friends
    from services.friendship_service import are_friends
    if await are_friends(db, from_id, to_id):
        raise ValueError("These accounts are already friends")

    # Check friend limits
    from_friends_row = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (from_id,))
    to_friends_row = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (to_id,))

    from_friend_count = len(json_list(from_friends_row["friends"])) if from_friends_row else 0
    to_friend_count = len(json_list(to_friends_row["friends"])) if to_friends_row else 0

    if from_friend_count >= Config.MAX_FRIENDS:
        raise ValueError("Sender has reached the maximum number of friends")
    if to_friend_count >= Config.MAX_FRIENDS:
        raise ValueError("Target has reached the maximum number of friends")

    if permissions is None:
        permissions = ["chat"]

    request_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO friend_requests
            (id, from_id, to_id, status, message, granted_permissions, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
        """,
        (request_id, from_id, to_id, message, json_serialize(permissions), now, now),
    )

    logger.info("Friend request sent: %s -> %s", from_id, to_id)
    return {
        "id": request_id,
        "from_id": from_id,
        "to_id": to_id,
        "status": "pending",
        "message": message,
        "granted_permissions": permissions,
        "created_at": now,
        "updated_at": now,
    }


async def list_requests(
    db: DatabaseManager,
    account_id: str,
) -> Dict[str, List[Dict[str, Any]]]:
    """List sent and received friend requests for an account.

    Returns a dict with 'sent' and 'received' lists.
    """
    sent = await db.fetchall(
        """
        SELECT fr.*, a.display_name as to_display_name, a.agent_name as to_agent_name
        FROM friend_requests fr
        LEFT JOIN accounts a ON fr.to_id = a.id
        WHERE fr.from_id = ?
        ORDER BY fr.created_at DESC
        """,
        (account_id,),
    )

    received = await db.fetchall(
        """
        SELECT fr.*, a.display_name as from_display_name, a.agent_name as from_agent_name
        FROM friend_requests fr
        LEFT JOIN accounts a ON fr.from_id = a.id
        WHERE fr.to_id = ?
        ORDER BY fr.created_at DESC
        """,
        (account_id,),
    )

    # Deserialize JSON permissions
    for req in sent:
        req["granted_permissions"] = json_list(req.get("granted_permissions"))
    for req in received:
        req["granted_permissions"] = json_list(req.get("granted_permissions"))

    return {"sent": sent, "received": received}


async def accept_request(
    db: DatabaseManager,
    request_id: str,
    permissions: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Accept a friend request.

    Updates the request status to 'accepted' and creates a bidirectional
    friendship using the friendship_service.

    Raises ValueError if the request is not found or not in 'pending' status.
    """
    request = await db.fetchone("SELECT * FROM friend_requests WHERE id = ?", (request_id,))
    if not request:
        raise ValueError("Friend request not found")

    if request["status"] != "pending":
        raise ValueError(f"Friend request is already {request['status']}")

    # Use the request's granted_permissions if none provided
    if permissions is None:
        permissions = json_list(request.get("granted_permissions"))
    if not permissions:
        permissions = ["chat"]

    now = iso_now()

    # Update the request status
    await db.execute(
        "UPDATE friend_requests SET status = 'accepted', updated_at = ?, granted_permissions = ? WHERE id = ?",
        (now, json_serialize(permissions), request_id),
    )

    # Create bidirectional friendship
    from services.friendship_service import add_friend_bidirectional
    await add_friend_bidirectional(db, request["from_id"], request["to_id"], permissions)

    logger.info("Friend request accepted: %s (%s -> %s)", request_id, request["from_id"], request["to_id"])

    return {
        "id": request_id,
        "from_id": request["from_id"],
        "to_id": request["to_id"],
        "status": "accepted",
        "granted_permissions": permissions,
        "updated_at": now,
    }


async def reject_request(
    db: DatabaseManager,
    request_id: str,
) -> Dict[str, Any]:
    """Reject a friend request.

    Updates the request status to 'rejected'.
    Raises ValueError if the request is not found or not in 'pending' status.
    """
    request = await db.fetchone("SELECT * FROM friend_requests WHERE id = ?", (request_id,))
    if not request:
        raise ValueError("Friend request not found")

    if request["status"] != "pending":
        raise ValueError(f"Friend request is already {request['status']}")

    now = iso_now()
    await db.execute(
        "UPDATE friend_requests SET status = 'rejected', updated_at = ? WHERE id = ?",
        (now, request_id),
    )

    logger.info("Friend request rejected: %s", request_id)
    return {
        "id": request_id,
        "from_id": request["from_id"],
        "to_id": request["to_id"],
        "status": "rejected",
        "updated_at": now,
    }
