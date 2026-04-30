"""
AICQ Friendship Service
========================
Handles bidirectional friendship management, permissions,
and friend list queries using the node_permissions and accounts tables.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.friendship_service")


# ─── Bidirectional Friendship Management ───────────────────────────────


async def add_friend_bidirectional(
    db: DatabaseManager,
    account_id_1: str,
    account_id_2: str,
    permissions: Optional[List[str]] = None,
) -> None:
    """Add a bidirectional friendship between two accounts.

    Creates entries in node_permissions for both directions and updates
    the friends arrays in both accounts.
    """
    if permissions is None:
        permissions = ["chat"]

    now = iso_now()
    perms_json = json_serialize(permissions)

    # Add permission entries in both directions
    await db.execute(
        """
        INSERT INTO node_permissions (node_id, friend_id, permissions, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(node_id, friend_id) DO UPDATE SET
            permissions = excluded.permissions,
            updated_at = excluded.updated_at
        """,
        (account_id_1, account_id_2, perms_json, now),
    )
    await db.execute(
        """
        INSERT INTO node_permissions (node_id, friend_id, permissions, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(node_id, friend_id) DO UPDATE SET
            permissions = excluded.permissions,
            updated_at = excluded.updated_at
        """,
        (account_id_2, account_id_1, perms_json, now),
    )

    # Update friends arrays in both accounts
    await _add_friend_to_array(db, account_id_1, account_id_2)
    await _add_friend_to_array(db, account_id_2, account_id_1)

    # Update friend_count in nodes table if applicable
    await _update_node_friend_count(db, account_id_1)
    await _update_node_friend_count(db, account_id_2)

    logger.info("Bidirectional friendship added: %s <-> %s", account_id_1, account_id_2)


async def remove_friend_bidirectional(
    db: DatabaseManager,
    account_id_1: str,
    account_id_2: str,
) -> None:
    """Remove a bidirectional friendship between two accounts.

    Removes entries from node_permissions for both directions and updates
    the friends arrays in both accounts.
    """
    # Remove permission entries in both directions
    await db.execute(
        "DELETE FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (account_id_1, account_id_2),
    )
    await db.execute(
        "DELETE FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (account_id_2, account_id_1),
    )

    # Remove from friends arrays
    await _remove_friend_from_array(db, account_id_1, account_id_2)
    await _remove_friend_from_array(db, account_id_2, account_id_1)

    # Update friend_count in nodes table if applicable
    await _update_node_friend_count(db, account_id_1)
    await _update_node_friend_count(db, account_id_2)

    logger.info("Bidirectional friendship removed: %s <-> %s", account_id_1, account_id_2)


# ─── Friend List & Permissions ─────────────────────────────────────────


async def get_friends(
    db: DatabaseManager,
    account_id: str,
) -> List[Dict[str, Any]]:
    """List all friends of an account with their permissions.

    Returns a list of dicts, each containing friend account info and permissions.
    """
    # Get all permission entries where this account is the node
    permissions_rows = await db.fetchall(
        "SELECT friend_id, permissions FROM node_permissions WHERE node_id = ?",
        (account_id,),
    )

    friends: List[Dict[str, Any]] = []
    for perm_row in permissions_rows:
        friend_id = perm_row["friend_id"]
        permissions = json_list(perm_row["permissions"])

        # Get friend account info
        account = await db.fetchone(
            "SELECT id, type, display_name, agent_name, public_key, status FROM accounts WHERE id = ?",
            (friend_id,),
        )
        if account:
            friends.append({
                **account,
                "permissions": permissions,
            })

    return friends


async def get_friend_permissions(
    db: DatabaseManager,
    node_id: str,
    friend_id: str,
) -> List[str]:
    """Get the permissions that node_id has granted to friend_id."""
    row = await db.fetchone(
        "SELECT permissions FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (node_id, friend_id),
    )
    if row is None:
        return []
    return json_list(row["permissions"])


async def update_friend_permissions(
    db: DatabaseManager,
    node_id: str,
    friend_id: str,
    permissions: List[str],
) -> None:
    """Update the permissions that node_id grants to friend_id."""
    now = iso_now()
    perms_json = json_serialize(permissions)
    await db.execute(
        """
        INSERT INTO node_permissions (node_id, friend_id, permissions, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(node_id, friend_id) DO UPDATE SET
            permissions = excluded.permissions,
            updated_at = excluded.updated_at
        """,
        (node_id, friend_id, perms_json, now),
    )
    logger.info("Updated permissions: %s -> %s: %s", node_id, friend_id, permissions)


async def check_friend_permission(
    db: DatabaseManager,
    node_id: str,
    friend_id: str,
    permission: str,
) -> bool:
    """Check if a specific permission is granted from node_id to friend_id.

    Returns True if the permission exists in the permissions list.
    """
    permissions = await get_friend_permissions(db, node_id, friend_id)
    return permission in permissions


async def are_friends(
    db: DatabaseManager,
    node_id: str,
    friend_id: str,
) -> bool:
    """Check if two accounts are friends (bidirectional check).

    Both directions must exist in node_permissions.
    """
    row1 = await db.fetchone(
        "SELECT 1 FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (node_id, friend_id),
    )
    row2 = await db.fetchone(
        "SELECT 1 FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (friend_id, node_id),
    )
    return row1 is not None and row2 is not None


async def init_default_permissions(
    db: DatabaseManager,
    node_id: str,
    friend_id: str,
) -> None:
    """Set default chat permission for a friendship direction.

    Only creates the entry if it doesn't already exist.
    """
    existing = await db.fetchone(
        "SELECT 1 FROM node_permissions WHERE node_id = ? AND friend_id = ?",
        (node_id, friend_id),
    )
    if existing:
        return

    now = iso_now()
    perms_json = json_serialize(["chat"])
    await db.execute(
        """
        INSERT INTO node_permissions (node_id, friend_id, permissions, updated_at)
        VALUES (?, ?, ?, ?)
        """,
        (node_id, friend_id, perms_json, now),
    )
    logger.debug("Initialized default permissions: %s -> %s", node_id, friend_id)


# ─── Internal Helpers ──────────────────────────────────────────────────


async def _add_friend_to_array(db: DatabaseManager, account_id: str, friend_id: str) -> None:
    """Add a friend_id to the account's friends JSON array."""
    row = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (account_id,))
    if row is None:
        return

    friends = json_list(row["friends"])
    if friend_id not in friends:
        friends.append(friend_id)
        await db.execute(
            "UPDATE accounts SET friends = ? WHERE id = ?",
            (json_serialize(friends), account_id),
        )

    # Also update nodes table if a matching node exists
    node = await db.fetchone("SELECT friends FROM nodes WHERE id = ?", (account_id,))
    if node:
        node_friends = json_list(node["friends"])
        if friend_id not in node_friends:
            node_friends.append(friend_id)
            await db.execute(
                "UPDATE nodes SET friends = ?, updated_at = ? WHERE id = ?",
                (json_serialize(node_friends), iso_now(), account_id),
            )


async def _remove_friend_from_array(db: DatabaseManager, account_id: str, friend_id: str) -> None:
    """Remove a friend_id from the account's friends JSON array."""
    row = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (account_id,))
    if row is None:
        return

    friends = json_list(row["friends"])
    if friend_id in friends:
        friends.remove(friend_id)
        await db.execute(
            "UPDATE accounts SET friends = ? WHERE id = ?",
            (json_serialize(friends), account_id),
        )

    # Also update nodes table if a matching node exists
    node = await db.fetchone("SELECT friends FROM nodes WHERE id = ?", (account_id,))
    if node:
        node_friends = json_list(node["friends"])
        if friend_id in node_friends:
            node_friends.remove(friend_id)
            await db.execute(
                "UPDATE nodes SET friends = ?, updated_at = ? WHERE id = ?",
                (json_serialize(node_friends), iso_now(), account_id),
            )


async def _update_node_friend_count(db: DatabaseManager, account_id: str) -> None:
    """Update the friend_count in the nodes table for a given account."""
    row = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (account_id,))
    if row is None:
        return

    friends = json_list(row["friends"])
    count = len(friends)

    await db.execute(
        "UPDATE nodes SET friend_count = ?, updated_at = ? WHERE id = ?",
        (count, iso_now(), account_id),
    )
