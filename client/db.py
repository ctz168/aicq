"""
AICQ Client Database
=======================
Async SQLite database for client-side persistence. Replaces the JSON store
from the original TypeScript client with a proper relational store.

Tables
------
- **identity**: User's cryptographic identity keys
- **friends**: Friend contact list
- **sessions**: Per-peer session keys (derived from handshake)
- **chat_history**: Message history for all conversations
- **temp_numbers**: Active temporary numbers
- **file_transfers**: Ongoing and completed file transfers
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import aiosqlite

logger = logging.getLogger("aicq.client.db")


# ─── Helpers ────────────────────────────────────────────────────────────


def iso_now() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ─── Schema DDL ─────────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS identity (
    user_id                 TEXT PRIMARY KEY,
    signing_public_key      TEXT NOT NULL,
    signing_secret_key      TEXT NOT NULL,
    exchange_public_key     TEXT NOT NULL,
    exchange_secret_key     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
    id              TEXT PRIMARY KEY,
    public_key      TEXT NOT NULL,
    fingerprint     TEXT,
    added_at        TEXT NOT NULL,
    last_seen       TEXT,
    is_online       INTEGER NOT NULL DEFAULT 0,
    permissions     TEXT NOT NULL DEFAULT '[]',
    friend_type     TEXT NOT NULL DEFAULT 'human',
    ai_name         TEXT NOT NULL DEFAULT '',
    ai_avatar       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
    peer_id         TEXT PRIMARY KEY,
    session_key     TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_history (
    id              TEXT PRIMARY KEY,
    friend_id       TEXT NOT NULL,
    from_id         TEXT NOT NULL,
    to_id           TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'text',
    content         TEXT NOT NULL DEFAULT '',
    timestamp       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_chat_history_friend_id ON chat_history(friend_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_timestamp ON chat_history(friend_id, timestamp);

CREATE TABLE IF NOT EXISTS temp_numbers (
    number          TEXT PRIMARY KEY,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_transfers (
    session_id          TEXT PRIMARY KEY,
    friend_id           TEXT NOT NULL,
    file_name           TEXT NOT NULL,
    file_size           INTEGER NOT NULL DEFAULT 0,
    file_hash           TEXT NOT NULL DEFAULT '',
    progress            REAL NOT NULL DEFAULT 0.0,
    status              TEXT NOT NULL DEFAULT 'pending',
    chunks_received     TEXT NOT NULL DEFAULT '[]',
    direction           TEXT NOT NULL DEFAULT 'send',
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_transfers_friend_id ON file_transfers(friend_id);
"""


# ─── ClientDatabase ─────────────────────────────────────────────────────


class ClientDatabase:
    """Asynchronous SQLite database manager for the AICQ client.

    Usage::

        db = ClientDatabase(Path("~/.aicq-client/client.db"))
        await db.connect()
        # ... CRUD operations ...
        await db.close()
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._conn: Optional[aiosqlite.Connection] = None

    # ── Connection lifecycle ─────────────────────────────────────────────

    async def connect(self) -> None:
        """Open the SQLite connection and create tables if needed."""
        if self._conn is not None:
            return

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(str(self.db_path))
        self._conn.row_factory = aiosqlite.Row

        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA foreign_keys=ON")
        await self._conn.execute("PRAGMA busy_timeout=5000")

        await self._conn.executescript(_SCHEMA_SQL)
        logger.info("Client database connected: %s", self.db_path)

    async def close(self) -> None:
        """Close the database connection."""
        if self._conn is not None:
            await self._conn.close()
            self._conn = None
            logger.info("Client database closed")

    @property
    def conn(self) -> aiosqlite.Connection:
        """Return the active connection or raise."""
        if self._conn is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._conn

    # ── Query helpers ────────────────────────────────────────────────────

    async def execute(self, query: str, params: Optional[Sequence[Any]] = None) -> aiosqlite.Cursor:
        cursor = await self.conn.execute(query, params)
        await self.conn.commit()
        return cursor

    async def fetchone(self, query: str, params: Optional[Sequence[Any]] = None) -> Optional[Dict[str, Any]]:
        cursor = await self.conn.execute(query, params)
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def fetchall(self, query: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
        cursor = await self.conn.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ─── Identity CRUD ───────────────────────────────────────────────────

    async def save_identity(
        self,
        user_id: str,
        signing_public_key: str,
        signing_secret_key: str,
        exchange_public_key: str,
        exchange_secret_key: str,
    ) -> None:
        """Save or replace the user's identity keys."""
        await self.execute(
            """
            INSERT OR REPLACE INTO identity
                (user_id, signing_public_key, signing_secret_key,
                 exchange_public_key, exchange_secret_key)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, signing_public_key, signing_secret_key,
             exchange_public_key, exchange_secret_key),
        )

    async def load_identity(self) -> Optional[Dict[str, Any]]:
        """Load the identity row, or ``None`` if no identity exists."""
        return await self.fetchone("SELECT * FROM identity LIMIT 1")

    async def delete_identity(self) -> None:
        """Remove the identity record."""
        await self.execute("DELETE FROM identity")

    # ─── Friends CRUD ────────────────────────────────────────────────────

    async def add_friend(self, friend: Dict[str, Any]) -> None:
        """Insert or replace a friend record."""
        await self.execute(
            """
            INSERT OR REPLACE INTO friends
                (id, public_key, fingerprint, added_at, last_seen,
                 is_online, permissions, friend_type, ai_name, ai_avatar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                friend["id"],
                friend.get("public_key", ""),
                friend.get("fingerprint", ""),
                friend.get("added_at", iso_now()),
                friend.get("last_seen", ""),
                1 if friend.get("is_online") else 0,
                json.dumps(friend.get("permissions", [])),
                friend.get("friend_type", "human"),
                friend.get("ai_name", ""),
                friend.get("ai_avatar", ""),
            ),
        )

    async def remove_friend(self, friend_id: str) -> bool:
        """Remove a friend. Returns ``True`` if a row was deleted."""
        cursor = await self.execute("DELETE FROM friends WHERE id = ?", (friend_id,))
        return cursor.rowcount > 0

    async def get_friend(self, friend_id: str) -> Optional[Dict[str, Any]]:
        """Get a single friend by ID."""
        row = await self.fetchone("SELECT * FROM friends WHERE id = ?", (friend_id,))
        if row:
            row["is_online"] = bool(row["is_online"])
            row["permissions"] = json.loads(row.get("permissions", "[]"))
        return row

    async def get_all_friends(self) -> List[Dict[str, Any]]:
        """Return all friends."""
        rows = await self.fetchall("SELECT * FROM friends ORDER BY added_at DESC")
        for r in rows:
            r["is_online"] = bool(r["is_online"])
            r["permissions"] = json.loads(r.get("permissions", "[]"))
        return rows

    async def get_friend_count(self) -> int:
        row = await self.fetchone("SELECT COUNT(*) as cnt FROM friends")
        return row["cnt"] if row else 0

    async def update_friend_online(self, friend_id: str, is_online: bool) -> None:
        """Update a friend's online status."""
        await self.execute(
            "UPDATE friends SET is_online = ?, last_seen = ? WHERE id = ?",
            (1 if is_online else 0, iso_now(), friend_id),
        )

    # ─── Sessions CRUD ───────────────────────────────────────────────────

    async def set_session_key(self, peer_id: str, session_key_hex: str) -> None:
        """Store or update a session key for a peer."""
        await self.execute(
            "INSERT OR REPLACE INTO sessions (peer_id, session_key, created_at) VALUES (?, ?, ?)",
            (peer_id, session_key_hex, iso_now()),
        )

    async def get_session_key(self, peer_id: str) -> Optional[str]:
        """Get the session key for a peer, or ``None``."""
        row = await self.fetchone("SELECT session_key FROM sessions WHERE peer_id = ?", (peer_id,))
        return row["session_key"] if row else None

    async def delete_session(self, peer_id: str) -> None:
        """Remove a peer's session key."""
        await self.execute("DELETE FROM sessions WHERE peer_id = ?", (peer_id,))

    # ─── Chat History CRUD ───────────────────────────────────────────────

    async def add_message(self, msg: Dict[str, Any]) -> str:
        """Insert a chat message. Returns the message ID."""
        msg_id = msg.get("id") or str(uuid.uuid4())
        await self.execute(
            """
            INSERT OR REPLACE INTO chat_history
                (id, friend_id, from_id, to_id, type, content, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                msg_id,
                msg["friend_id"],
                msg["from_id"],
                msg["to_id"],
                msg.get("type", "text"),
                msg.get("content", ""),
                msg.get("timestamp", iso_now()),
                msg.get("status", "pending"),
            ),
        )
        return msg_id

    async def get_messages(
        self, friend_id: str, limit: int = 50, before: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get chat messages with a friend, ordered by timestamp descending."""
        if before:
            return await self.fetchall(
                "SELECT * FROM chat_history WHERE friend_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
                (friend_id, before, limit),
            )
        return await self.fetchall(
            "SELECT * FROM chat_history WHERE friend_id = ? ORDER BY timestamp DESC LIMIT ?",
            (friend_id, limit),
        )

    async def delete_message(self, message_id: str) -> bool:
        cursor = await self.execute("DELETE FROM chat_history WHERE id = ?", (message_id,))
        return cursor.rowcount > 0

    async def mark_messages_read(self, friend_id: str) -> None:
        """Mark all messages from *friend_id* as read."""
        await self.execute(
            "UPDATE chat_history SET status = 'read' WHERE friend_id = ? AND from_id = ? AND status != 'read'",
            (friend_id, friend_id),
        )

    async def get_unread_count(self, friend_id: str) -> int:
        row = await self.fetchone(
            "SELECT COUNT(*) as cnt FROM chat_history WHERE friend_id = ? AND from_id = ? AND status != 'read'",
            (friend_id, friend_id),
        )
        return row["cnt"] if row else 0

    # ─── Temp Numbers CRUD ───────────────────────────────────────────────

    async def add_temp_number(self, number: str, expires_at: str) -> None:
        await self.execute(
            "INSERT OR REPLACE INTO temp_numbers (number, expires_at, created_at) VALUES (?, ?, ?)",
            (number, expires_at, iso_now()),
        )

    async def get_active_temp_numbers(self) -> List[Dict[str, Any]]:
        now = iso_now()
        return await self.fetchall(
            "SELECT * FROM temp_numbers WHERE expires_at > ? ORDER BY created_at DESC",
            (now,),
        )

    async def revoke_temp_number(self, number: str) -> bool:
        cursor = await self.execute("DELETE FROM temp_numbers WHERE number = ?", (number,))
        return cursor.rowcount > 0

    async def cleanup_expired_temp_numbers(self) -> int:
        now = iso_now()
        cursor = await self.execute("DELETE FROM temp_numbers WHERE expires_at <= ?", (now,))
        return cursor.rowcount

    # ─── File Transfers CRUD ─────────────────────────────────────────────

    async def add_file_transfer(self, transfer: Dict[str, Any]) -> None:
        await self.execute(
            """
            INSERT OR REPLACE INTO file_transfers
                (session_id, friend_id, file_name, file_size, file_hash,
                 progress, status, chunks_received, direction, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transfer["session_id"],
                transfer["friend_id"],
                transfer.get("file_name", ""),
                transfer.get("file_size", 0),
                transfer.get("file_hash", ""),
                transfer.get("progress", 0.0),
                transfer.get("status", "pending"),
                json.dumps(transfer.get("chunks_received", [])),
                transfer.get("direction", "send"),
                transfer.get("created_at", iso_now()),
            ),
        )

    async def get_file_transfer(self, session_id: str) -> Optional[Dict[str, Any]]:
        row = await self.fetchone(
            "SELECT * FROM file_transfers WHERE session_id = ?", (session_id,)
        )
        if row:
            row["chunks_received"] = json.loads(row.get("chunks_received", "[]"))
        return row

    async def update_file_transfer_progress(
        self, session_id: str, progress: float, chunks_received: List[int], status: str
    ) -> None:
        await self.execute(
            """
            UPDATE file_transfers
            SET progress = ?, chunks_received = ?, status = ?
            WHERE session_id = ?
            """,
            (progress, json.dumps(chunks_received), status, session_id),
        )

    async def update_file_transfer_status(self, session_id: str, status: str) -> None:
        await self.execute(
            "UPDATE file_transfers SET status = ? WHERE session_id = ?",
            (status, session_id),
        )

    async def delete_file_transfer(self, session_id: str) -> None:
        await self.execute("DELETE FROM file_transfers WHERE session_id = ?", (session_id,))
