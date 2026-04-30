"""
AICQ Notification Service
===========================
Handles creation, retrieval, and cleanup of push-style notifications
for unread messages, friend requests, and group activity.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from db import DatabaseManager, iso_now
from config import Config

logger = logging.getLogger("aicq.notification_service")


async def create_notification(
    db: DatabaseManager,
    account_id: str,
    chat_id: str,
    sender_id: str,
    sender_name: str,
    message_preview: str = "",
    is_group: bool = False,
) -> Dict[str, Any]:
    """Create a new notification for an account.

    Args:
        account_id: The recipient account ID.
        chat_id: The chat or group ID this notification references.
        sender_id: The account ID of the message sender.
        sender_name: Display name of the sender.
        message_preview: A short preview of the message content.
        is_group: Whether this notification is for a group chat.

    Returns the created notification record.
    """
    notification_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO notifications
            (id, account_id, chat_id, sender_id, sender_name,
             message_preview, is_group, read_flag, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        """,
        (
            notification_id, account_id, chat_id, sender_id, sender_name,
            message_preview[:200], 1 if is_group else 0, now,
        ),
    )

    notification = await db.fetchone("SELECT * FROM notifications WHERE id = ?", (notification_id,))
    logger.debug("Notification created: %s for account %s", notification_id, account_id)
    return notification


async def get_notifications(
    db: DatabaseManager,
    account_id: str,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List notifications for an account, ordered by most recent first.

    Args:
        account_id: The account to fetch notifications for.
        limit: Maximum number of notifications to return.

    Returns a list of notification records.
    """
    notifications = await db.fetchall(
        """
        SELECT * FROM notifications
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (account_id, limit),
    )

    # Convert SQLite integer booleans
    for n in notifications:
        n["is_group"] = bool(n.get("is_group", 0))
        n["read_flag"] = bool(n.get("read_flag", 0))

    return notifications


async def mark_read(
    db: DatabaseManager,
    notification_id: str,
) -> bool:
    """Mark a notification as read.

    Returns True if the notification was found and updated, False otherwise.
    """
    notification = await db.fetchone("SELECT id FROM notifications WHERE id = ?", (notification_id,))
    if notification is None:
        return False

    await db.execute(
        "UPDATE notifications SET read_flag = 1 WHERE id = ?",
        (notification_id,),
    )

    return True


async def mark_all_read(
    db: DatabaseManager,
    account_id: str,
) -> int:
    """Mark all notifications as read for an account.

    Returns the number of notifications marked as read.
    """
    cursor = await db.execute(
        "UPDATE notifications SET read_flag = 1 WHERE account_id = ? AND read_flag = 0",
        (account_id,),
    )
    return cursor.rowcount


async def get_unread_count(
    db: DatabaseManager,
    account_id: str,
) -> int:
    """Get the count of unread notifications for an account."""
    row = await db.fetchone(
        "SELECT COUNT(*) as cnt FROM notifications WHERE account_id = ? AND read_flag = 0",
        (account_id,),
    )
    return row["cnt"] if row else 0


async def cleanup_old_notifications(db: DatabaseManager) -> int:
    """Delete notifications older than 7 days.

    Returns the number of deleted notifications.
    """
    now = iso_now()
    cursor = await db.execute(
        "DELETE FROM notifications WHERE created_at < datetime(?, '-7 days')",
        (now,),
    )
    deleted = cursor.rowcount

    if deleted > 0:
        logger.info("Cleaned up %d old notifications", deleted)

    return deleted
