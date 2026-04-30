"""
AICQ SQLite Database Module
============================
Async SQLite database manager for the AICQ Python rewrite.

Converted from the original Node.js + ClickHouse architecture to
Python aiohttp + SQLite. All ClickHouse Array(String) columns are
stored as JSON-encoded TEXT in SQLite with helper serialize/deserialize
functions. Timestamps are ISO-8601 strings.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import aiosqlite

logger = logging.getLogger("aicq.db")

# ─── JSON Helpers ────────────────────────────────────────────────────────


def json_serialize(value: Any) -> str:
    """Serialize a Python object to a JSON string for SQLite storage.

    Handles lists, dicts, and primitive values. Returns ``'[]'`` for
    ``None`` or empty inputs that represent collections.
    """
    if value is None:
        return "[]"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_deserialize(value: Optional[str], default: Any = None) -> Any:
    """Deserialize a JSON string from SQLite back to a Python object.

    Returns *default* (``None`` by default) when *value* is ``None`` or
    cannot be parsed.
    """
    if value is None:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


def json_list(value: Optional[str]) -> List[str]:
    """Shorthand: deserialize a JSON TEXT column into a list of strings.

    Always returns a list — never ``None``.
    """
    result = json_deserialize(value, default=[])
    return result if isinstance(result, list) else []


# ─── Timestamp Helpers ───────────────────────────────────────────────────


def iso_now() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def to_iso(ts: Optional[float | int | datetime | str]) -> Optional[str]:
    """Convert various timestamp representations to ISO-8601 strings.

    Accepts:
    - ``None`` → ``None``
    - ``datetime`` → ``.isoformat()``
    - ``float`` / ``int`` (epoch ms or s) → ISO string
    - ``str`` → returned as-is (assumed already ISO)
    """
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts.isoformat()
    if isinstance(ts, (int, float)):
        # Heuristic: values > 1e12 are probably epoch milliseconds
        if ts > 1e12:
            ts = ts / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    if isinstance(ts, str):
        return ts
    return str(ts)


# ─── Schema DDL ─────────────────────────────────────────────────────────

# Every CREATE TABLE uses IF NOT EXISTS so the module is idempotent.

_SCHEMA_SQL = """
-- ═══════════════════════════════════════════════════════════════════════
--  accounts
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL DEFAULT 'human' CHECK(type IN ('human', 'ai')),
    email           TEXT,
    phone           TEXT,
    password_hash   TEXT,
    display_name    TEXT,
    agent_name      TEXT,
    fingerprint     TEXT,
    public_key      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'suspended')),
    friends         TEXT NOT NULL DEFAULT '[]',
    max_friends     INTEGER NOT NULL DEFAULT 200,
    visit_permissions TEXT NOT NULL DEFAULT '[]',
    updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_email      ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_phone      ON accounts(phone);
CREATE INDEX IF NOT EXISTS idx_accounts_public_key ON accounts(public_key);
CREATE INDEX IF NOT EXISTS idx_accounts_type       ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_status     ON accounts(status);

-- ═══════════════════════════════════════════════════════════════════════
--  sessions
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL,
    token           TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    device_info     TEXT,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id   ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token        ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at   ON sessions(expires_at);

-- ═══════════════════════════════════════════════════════════════════════
--  verification_codes
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS verification_codes (
    id              TEXT PRIMARY KEY,
    target          TEXT NOT NULL,
    code            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('email', 'phone')),
    purpose         TEXT NOT NULL CHECK(purpose IN ('register', 'login', 'reset_password')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    verified_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_target  ON verification_codes(target);
CREATE INDEX IF NOT EXISTS idx_verification_codes_type    ON verification_codes(type, purpose);

-- ═══════════════════════════════════════════════════════════════════════
--  temp_numbers
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS temp_numbers (
    number          TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temp_numbers_node_id    ON temp_numbers(node_id);
CREATE INDEX IF NOT EXISTS idx_temp_numbers_expires_at ON temp_numbers(expires_at);

-- ═══════════════════════════════════════════════════════════════════════
--  nodes
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nodes (
    id              TEXT PRIMARY KEY,
    public_key      TEXT NOT NULL,
    last_seen       TEXT NOT NULL,
    socket_id       TEXT,
    friend_count    INTEGER NOT NULL DEFAULT 0,
    friends         TEXT NOT NULL DEFAULT '[]',
    gateway_url     TEXT,
    updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_nodes_public_key  ON nodes(public_key);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen   ON nodes(last_seen);

-- ═══════════════════════════════════════════════════════════════════════
--  friend_requests
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS friend_requests (
    id                  TEXT PRIMARY KEY,
    from_id             TEXT NOT NULL,
    to_id               TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    message             TEXT,
    granted_permissions TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (from_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from_id ON friend_requests(from_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_id   ON friend_requests(to_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status   ON friend_requests(status);

-- ═══════════════════════════════════════════════════════════════════════
--  groups
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    members_json    TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    max_members     INTEGER NOT NULL DEFAULT 100,
    description     TEXT,
    avatar          TEXT,
    FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id);

-- ═══════════════════════════════════════════════════════════════════════
--  group_messages
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS group_messages (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    from_id         TEXT NOT NULL,
    sender_name     TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'text',
    content         TEXT NOT NULL DEFAULT '',
    media           TEXT,
    file_info       TEXT,
    timestamp       TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id  ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_timestamp ON group_messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_group_messages_from_id   ON group_messages(from_id);

-- ═══════════════════════════════════════════════════════════════════════
--  handshake_sessions
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS handshake_sessions (
    id              TEXT PRIMARY KEY,
    requester_id    TEXT NOT NULL,
    target_node_id  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'initiated'
                        CHECK(status IN ('initiated', 'responded', 'confirmed', 'failed')),
    response_data   TEXT,
    confirm_data    TEXT,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handshake_sessions_requester  ON handshake_sessions(requester_id);
CREATE INDEX IF NOT EXISTS idx_handshake_sessions_target     ON handshake_sessions(target_node_id);
CREATE INDEX IF NOT EXISTS idx_handshake_sessions_status     ON handshake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_handshake_sessions_expires_at ON handshake_sessions(expires_at);

-- ═══════════════════════════════════════════════════════════════════════
--  pending_requests
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pending_requests (
    target_node_id  TEXT NOT NULL,
    from_node_id    TEXT NOT NULL,
    temp_number     TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    PRIMARY KEY (target_node_id, from_node_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_requests_temp_number ON pending_requests(temp_number);

-- ═══════════════════════════════════════════════════════════════════════
--  node_permissions
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS node_permissions (
    node_id         TEXT NOT NULL,
    friend_id       TEXT NOT NULL,
    permissions     TEXT NOT NULL DEFAULT '[]',
    updated_at      TEXT,
    PRIMARY KEY (node_id, friend_id)
);

-- ═══════════════════════════════════════════════════════════════════════
--  file_transfers
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS file_transfers (
    id                      TEXT PRIMARY KEY,
    sender_id               TEXT NOT NULL,
    receiver_id             TEXT NOT NULL,
    file_name               TEXT NOT NULL,
    file_size               INTEGER NOT NULL DEFAULT 0,
    file_hash               TEXT NOT NULL,
    total_chunks            INTEGER NOT NULL DEFAULT 0,
    chunk_size              INTEGER NOT NULL DEFAULT 0,
    chunks_received_json    TEXT NOT NULL DEFAULT '[]',
    created_at              TEXT NOT NULL,
    completed_at            TEXT,
    cancelled_at            TEXT,
    updated_at              TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_transfers_sender   ON file_transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_file_transfers_receiver ON file_transfers(receiver_id);

-- ═══════════════════════════════════════════════════════════════════════
--  notifications
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL,
    chat_id         TEXT NOT NULL,
    sender_id       TEXT NOT NULL,
    sender_name     TEXT NOT NULL,
    message_preview TEXT NOT NULL DEFAULT '',
    is_group        INTEGER NOT NULL DEFAULT 0,
    read_flag       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_id  ON notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read_flag   ON notifications(account_id, read_flag);

-- ═══════════════════════════════════════════════════════════════════════
--  sub_agents
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sub_agents (
    id                  TEXT PRIMARY KEY,
    parent_message_id   TEXT NOT NULL,
    task                TEXT NOT NULL,
    context             TEXT,
    status              TEXT NOT NULL DEFAULT 'running'
                            CHECK(status IN ('running', 'completed', 'waiting_human', 'error')),
    output              TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL,
    updated_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sub_agents_parent_message ON sub_agents(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_sub_agents_status         ON sub_agents(status);

-- ═══════════════════════════════════════════════════════════════════════
--  admin_config
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT
);

-- ═══════════════════════════════════════════════════════════════════════
--  blacklist
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blacklist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  TEXT NOT NULL,
    reason      TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blacklist_account_id ON blacklist(account_id);

-- ═══════════════════════════════════════════════════════════════════════
--  duckdns_config
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS duckdns_config (
    id          INTEGER PRIMARY KEY,
    domain      TEXT NOT NULL,
    token       TEXT NOT NULL,
    updated_at  TEXT
);
"""

# ─── Migration Column Additions ─────────────────────────────────────────
# Each tuple: (table, column, column_definition)
# Wrapped in try/except during execution so adding an already-existing
# column is a no-op.

_MIGRATIONS: List[tuple[str, str, str]] = [
    # Example future migrations — uncomment and adjust as needed:
    # ("accounts",  "avatar",          "TEXT"),
    # ("nodes",     "region",          "TEXT DEFAULT 'default'"),
    # ("groups",    "is_public",       "INTEGER NOT NULL DEFAULT 0"),
]

# ─── Default Admin Config ───────────────────────────────────────────────

_DEFAULT_CONFIG: Dict[str, str] = {
    "port": "61018",
    "domain": "aicq.online",
    "max_friends": "200",
    "max_friends_human_to_human": "200",
    "max_friends_human_to_ai": "500",
    "max_friends_ai_to_human": "1000",
    "max_friends_ai_to_ai": "1000",
    "max_groups_per_account": "20",
    "max_group_members": "100",
    "max_group_messages": "5000",
    "temp_number_ttl_hours": "24",
    "max_http_connections": "5000",
    "max_ws_connections": "10000",
    "allow_localhost": "false",
}


# ─── DatabaseManager ────────────────────────────────────────────────────


class DatabaseManager:
    """Asynchronous SQLite database manager for AICQ.

    Usage::

        db = DatabaseManager("aicq.db")
        await db.connect()
        # ... use db.execute / db.fetchone / db.fetchall ...
        await db.close()
    """

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = str(db_path)
        self._conn: Optional[aiosqlite.Connection] = None

    # ── Connection lifecycle ────────────────────────────────────────────

    async def connect(self) -> None:
        """Open (or reuse) the async SQLite connection.

        Enables WAL journal mode and foreign keys for every connection.
        """
        if self._conn is not None:
            return

        self._conn = await aiosqlite.connect(self.db_path)
        self._conn.row_factory = aiosqlite.Row

        # Performance & integrity pragmas
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA synchronous=NORMAL")
        await self._conn.execute("PRAGMA foreign_keys=ON")
        await self._conn.execute("PRAGMA busy_timeout=5000")
        await self._conn.execute("PRAGMA cache_size=-64000")  # 64 MB

        logger.info("Database connected: %s", self.db_path)

    async def close(self) -> None:
        """Close the connection if open."""
        if self._conn is not None:
            await self._conn.close()
            self._conn = None
            logger.info("Database closed: %s", self.db_path)

    @property
    def conn(self) -> aiosqlite.Connection:
        """Return the active connection or raise ``RuntimeError``."""
        if self._conn is None:
            raise RuntimeError("Database connection is not open. Call connect() first.")
        return self._conn

    # ── Query helpers ───────────────────────────────────────────────────

    async def execute(self, query: str, params: Optional[Sequence[Any]] = None) -> aiosqlite.Cursor:
        """Execute a single SQL statement and return the cursor."""
        cursor = await self.conn.execute(query, params)
        await self.conn.commit()
        return cursor

    async def fetchone(self, query: str, params: Optional[Sequence[Any]] = None) -> Optional[Dict[str, Any]]:
        """Execute *query* and return the first row as a dict, or ``None``."""
        cursor = await self.conn.execute(query, params)
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    async def fetchall(self, query: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
        """Execute *query* and return all rows as a list of dicts."""
        cursor = await self.conn.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def execute_many(self, query: str, params_list: Sequence[Sequence[Any]]) -> None:
        """Execute *query* for every parameter set in *params_list*."""
        await self.conn.executemany(query, params_list)
        await self.conn.commit()

    async def table_exists(self, table_name: str) -> bool:
        """Return ``True`` if *table_name* exists in the database."""
        row = await self.fetchone(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        )
        return row is not None

    # ── Migration helper ────────────────────────────────────────────────

    async def add_column(self, table: str, column: str, definition: str) -> bool:
        """Add a column to an existing table.

        Returns ``True`` if the column was added, ``False`` if it already
        existed.  Any other error is re-raised.
        """
        try:
            await self.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            logger.info("Migration: added column %s.%s", table, column)
            return True
        except aiosqlite.OperationalError as exc:
            if "duplicate column name" in str(exc).lower():
                return False
            raise

    # ── Convenience: JSON-field readers ─────────────────────────────────

    async def get_json_field(
        self,
        table: str,
        column: str,
        where: str,
        params: Optional[Sequence[Any]] = None,
    ) -> Any:
        """Fetch a single JSON-encoded column and deserialize it."""
        row = await self.fetchone(f"SELECT {column} FROM {table} WHERE {where}", params)
        if row is None:
            return None
        return json_deserialize(row.get(column))

    async def set_json_field(
        self,
        table: str,
        column: str,
        value: Any,
        where: str,
        params: Optional[Sequence[Any]] = None,
    ) -> None:
        """Serialize *value* as JSON and update the matching row(s)."""
        encoded = json_serialize(value)
        # Merge the where-clause params with the new value
        if params:
            await self.execute(
                f"UPDATE {table} SET {column}=? WHERE {where}",
                (encoded, *params),
            )
        else:
            await self.execute(
                f"UPDATE {table} SET {column}=? WHERE {where}",
                (encoded,),
            )


# ─── Initialization ─────────────────────────────────────────────────────


async def init_db(db_path: str | Path = "aicq.db") -> DatabaseManager:
    """Create all tables, run pending migrations, and seed default config.

    Returns a ready-to-use :class:`DatabaseManager` instance.
    """
    db = DatabaseManager(db_path)
    await db.connect()

    # Create schema
    await db.conn.executescript(_SCHEMA_SQL)
    logger.info("Schema created / verified")

    # Run migration column additions
    for table, column, definition in _MIGRATIONS:
        await db.add_column(table, column, definition)

    # Seed default configuration
    await seed_default_config(db)

    logger.info("Database initialization complete")
    return db


async def seed_default_config(db: DatabaseManager) -> None:
    """Insert default admin_config rows if they do not already exist.

    Uses INSERT OR IGNORE so repeated calls are safe.
    """
    now = iso_now()
    for key, value in _DEFAULT_CONFIG.items():
        await db.execute(
            "INSERT OR IGNORE INTO admin_config (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, now),
        )
    logger.debug("Default config seeded (%d keys)", len(_DEFAULT_CONFIG))


# ─── Cleanup helpers ────────────────────────────────────────────────────


async def cleanup_expired(db: DatabaseManager) -> Dict[str, int]:
    """Delete expired rows from time-sensitive tables.

    Returns a dict mapping table name to the number of rows deleted.
    """
    now = iso_now()
    results: Dict[str, int] = {}

    # Expired sessions
    cursor = await db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    results["sessions"] = cursor.rowcount

    # Expired temp numbers
    cursor = await db.execute("DELETE FROM temp_numbers WHERE expires_at < ?", (now,))
    results["temp_numbers"] = cursor.rowcount

    # Expired verification codes
    cursor = await db.execute("DELETE FROM verification_codes WHERE expires_at < ?", (now,))
    results["verification_codes"] = cursor.rowcount

    # Expired handshake sessions
    cursor = await db.execute("DELETE FROM handshake_sessions WHERE expires_at < ?", (now,))
    results["handshake_sessions"] = cursor.rowcount

    # Stale pending requests (older than 48 hours)
    cursor = await db.execute(
        "DELETE FROM pending_requests WHERE created_at < datetime(?, '-48 hours')",
        (now,),
    )
    results["pending_requests"] = cursor.rowcount

    # Old notifications (older than 30 days)
    cursor = await db.execute(
        "DELETE FROM notifications WHERE created_at < datetime(?, '-30 days')",
        (now,),
    )
    results["notifications"] = cursor.rowcount

    logger.info("Cleanup results: %s", results)
    return results


# ─── Standalone test / demo ─────────────────────────────────────────────

async def _demo() -> None:
    """Quick smoke test: init the DB, seed config, run a few queries."""
    import os
    import tempfile

    logging.basicConfig(level=logging.DEBUG)

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "aicq_test.db")
        db = await init_db(db_path)

        # Verify tables
        tables = await db.fetchall(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        print("Tables:", [t["name"] for t in tables])

        # Check default config
        configs = await db.fetchall("SELECT key, value FROM admin_config ORDER BY key")
        print("Config:")
        for c in configs:
            print(f"  {c['key']}: {c['value']}")

        # Verify JSON helpers
        await db.execute(
            "INSERT INTO accounts (id, type, public_key, created_at, status, friends, visit_permissions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("test-001", "human", "pk-test", iso_now(), "active", json_serialize(["friend-a", "friend-b"]), json_serialize([])),
        )
        row = await db.fetchone("SELECT * FROM accounts WHERE id = ?", ("test-001",))
        print("Account friends:", json_list(row["friends"]))

        # Test table_exists
        print("accounts exists:", await db.table_exists("accounts"))
        print("nonexistent exists:", await db.table_exists("nonexistent"))

        # Test cleanup (should be a no-op on fresh DB)
        cleaned = await cleanup_expired(db)
        print("Cleanup:", cleaned)

        await db.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(_demo())
