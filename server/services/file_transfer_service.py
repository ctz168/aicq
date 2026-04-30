"""
AICQ File Transfer Service
============================
Handles P2P file transfer session management: initiation, progress
tracking, chunk management, and completion/cancellation.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, json_deserialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.file_transfer_service")


async def initiate_transfer(
    db: DatabaseManager,
    sender_id: str,
    receiver_id: str,
    file_name: str,
    file_size: int,
    file_hash: str,
    total_chunks: int,
    chunk_size: int,
) -> Dict[str, Any]:
    """Create a new file transfer session.

    Returns the transfer session details.
    Raises ValueError if sender or receiver accounts don't exist.
    """
    # Verify sender and receiver exist
    sender = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (sender_id,))
    if not sender:
        raise ValueError("Sender account not found")

    receiver = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (receiver_id,))
    if not receiver:
        raise ValueError("Receiver account not found")

    if sender_id == receiver_id:
        raise ValueError("Cannot send a file to yourself")

    session_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO file_transfers
            (id, sender_id, receiver_id, file_name, file_size, file_hash,
             total_chunks, chunk_size, chunks_received_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
        """,
        (
            session_id, sender_id, receiver_id, file_name, file_size,
            file_hash, total_chunks, chunk_size, now, now,
        ),
    )

    transfer = await get_transfer(db, session_id)
    logger.info("File transfer initiated: %s (%s -> %s)", session_id, sender_id, receiver_id)
    return transfer


async def get_transfer(
    db: DatabaseManager,
    session_id: str,
) -> Optional[Dict[str, Any]]:
    """Get file transfer info by session ID.

    Returns the transfer record with deserialized chunks, or None.
    """
    transfer = await db.fetchone("SELECT * FROM file_transfers WHERE id = ?", (session_id,))
    if transfer is None:
        return None

    transfer["chunks_received"] = json_list(transfer.get("chunks_received_json"))
    transfer.pop("chunks_received_json", None)
    return transfer


async def update_chunks(
    db: DatabaseManager,
    session_id: str,
    chunks_received: List[int],
) -> Optional[Dict[str, Any]]:
    """Update the progress of a file transfer by recording received chunk indices.

    Merges new chunk indices with existing ones (deduped, sorted).
    Returns the updated transfer info, or None if not found.
    """
    transfer = await db.fetchone("SELECT * FROM file_transfers WHERE id = ?", (session_id,))
    if transfer is None:
        return None

    if transfer.get("completed_at") or transfer.get("cancelled_at"):
        raise ValueError("Cannot update chunks on a completed or cancelled transfer")

    # Merge existing chunks with new ones
    existing_chunks = set(json_list(transfer.get("chunks_received_json")))
    existing_chunks.update(chunks_received)
    merged_chunks = sorted(existing_chunks)

    now = iso_now()
    await db.execute(
        "UPDATE file_transfers SET chunks_received_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(merged_chunks), now, session_id),
    )

    return await get_transfer(db, session_id)


async def get_missing_chunks(
    db: DatabaseManager,
    session_id: str,
) -> List[int]:
    """Get the indices of missing chunks for a transfer.

    Returns a list of chunk indices that have not been received yet.
    """
    transfer = await db.fetchone("SELECT * FROM file_transfers WHERE id = ?", (session_id,))
    if transfer is None:
        raise ValueError("Transfer session not found")

    total_chunks = transfer["total_chunks"]
    received_chunks = set(json_list(transfer.get("chunks_received_json")))

    missing = [i for i in range(total_chunks) if i not in received_chunks]
    return missing


async def complete_transfer(
    db: DatabaseManager,
    session_id: str,
) -> Optional[Dict[str, Any]]:
    """Mark a file transfer as completed.

    Sets completed_at timestamp. Returns the updated transfer info.
    Raises ValueError if the transfer is not found or already cancelled.
    """
    transfer = await db.fetchone("SELECT * FROM file_transfers WHERE id = ?", (session_id,))
    if transfer is None:
        raise ValueError("Transfer session not found")

    if transfer.get("cancelled_at"):
        raise ValueError("Cannot complete a cancelled transfer")

    if transfer.get("completed_at"):
        # Already completed — idempotent
        return await get_transfer(db, session_id)

    now = iso_now()
    await db.execute(
        "UPDATE file_transfers SET completed_at = ?, updated_at = ? WHERE id = ?",
        (now, now, session_id),
    )

    logger.info("File transfer completed: %s", session_id)
    return await get_transfer(db, session_id)


async def cancel_transfer(
    db: DatabaseManager,
    session_id: str,
) -> Optional[Dict[str, Any]]:
    """Mark a file transfer as cancelled.

    Sets cancelled_at timestamp. Returns the updated transfer info.
    Raises ValueError if the transfer is not found or already completed.
    """
    transfer = await db.fetchone("SELECT * FROM file_transfers WHERE id = ?", (session_id,))
    if transfer is None:
        raise ValueError("Transfer session not found")

    if transfer.get("completed_at"):
        raise ValueError("Cannot cancel a completed transfer")

    if transfer.get("cancelled_at"):
        # Already cancelled — idempotent
        return await get_transfer(db, session_id)

    now = iso_now()
    await db.execute(
        "UPDATE file_transfers SET cancelled_at = ?, updated_at = ? WHERE id = ?",
        (now, now, session_id),
    )

    logger.info("File transfer cancelled: %s", session_id)
    return await get_transfer(db, session_id)
