"""
AICQ Admin Service
==================
Handles admin initialization, authentication, dashboard statistics,
node/account management, runtime configuration, and blacklist operations.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import bcrypt
import jwt

from db import DatabaseManager, json_serialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.admin_service")


# ─── Password Helpers ───────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ─── Admin JWT ──────────────────────────────────────────────────────────


def _create_admin_token() -> str:
    """Create an admin JWT token with 24h expiry, signed with JWT_SECRET + '-admin'."""
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(seconds=Config.ADMIN_JWT_EXPIRY)
    payload = {
        "sub": "admin",
        "type": "admin",
        "iat": now,
        "exp": expiry,
    }
    return jwt.encode(payload, Config.JWT_SECRET + "-admin", algorithm="HS256")


def verify_admin_token(token: str) -> Dict[str, Any]:
    """Verify an admin JWT token.

    Returns the decoded payload dict.
    Raises jwt.PyJWTError on invalid or expired tokens.
    """
    payload = jwt.decode(token, Config.JWT_SECRET + "-admin", algorithms=["HS256"])
    if payload.get("type") != "admin":
        raise jwt.InvalidTokenError("Not an admin token")
    return payload


# ─── Admin Initialization ──────────────────────────────────────────────


async def is_initialized(db: DatabaseManager) -> bool:
    """Check if the admin account has been initialized.

    Returns True if an 'admin_password' key exists in admin_config.
    """
    row = await db.fetchone("SELECT value FROM admin_config WHERE key = 'admin_password'")
    return row is not None


async def init_admin(db: DatabaseManager, password: str) -> Dict[str, Any]:
    """First-time admin setup: hash and store the admin password.

    Raises RuntimeError if the admin is already initialized.
    Returns the admin JWT token.
    """
    if await is_initialized(db):
        raise RuntimeError("Admin is already initialized")

    password_hash = _hash_password(password)
    now = iso_now()

    await db.execute(
        "INSERT INTO admin_config (key, value, updated_at) VALUES (?, ?, ?)",
        ("admin_password", password_hash, now),
    )

    token = _create_admin_token()
    logger.info("Admin initialized")
    return {"token": token}


async def login_admin(db: DatabaseManager, password: str) -> Dict[str, Any]:
    """Authenticate admin with password.

    Returns a dict with the admin JWT token.
    Raises ValueError on invalid credentials.
    """
    row = await db.fetchone("SELECT value FROM admin_config WHERE key = 'admin_password'")
    if not row:
        raise ValueError("Admin not initialized")

    if not _verify_password(password, row["value"]):
        raise ValueError("Invalid admin password")

    token = _create_admin_token()
    logger.info("Admin login successful")
    return {"token": token}


# ─── Dashboard Stats ───────────────────────────────────────────────────


async def get_stats(db: DatabaseManager) -> Dict[str, Any]:
    """Return dashboard statistics: total nodes, accounts, friendships, groups, blacklisted count."""
    nodes_count = await db.fetchone("SELECT COUNT(*) as cnt FROM nodes")
    accounts_count = await db.fetchone("SELECT COUNT(*) as cnt FROM accounts")
    friendships_count = await db.fetchone("SELECT COUNT(*) as cnt FROM node_permissions")
    groups_count = await db.fetchone("SELECT COUNT(*) as cnt FROM groups")
    blacklist_count = await db.fetchone("SELECT COUNT(*) as cnt FROM blacklist")

    return {
        "total_nodes": nodes_count["cnt"] if nodes_count else 0,
        "total_accounts": accounts_count["cnt"] if accounts_count else 0,
        "total_friendships": friendships_count["cnt"] if friendships_count else 0,
        "total_groups": groups_count["cnt"] if groups_count else 0,
        "total_blacklisted": blacklist_count["cnt"] if blacklist_count else 0,
    }


# ─── Node Management ───────────────────────────────────────────────────


async def list_nodes(
    db: DatabaseManager,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a paginated list of nodes, optionally filtered by search."""
    offset = (page - 1) * per_page
    params: list[Any] = []

    where_clause = ""
    if search:
        where_clause = "WHERE id LIKE ? OR public_key LIKE ?"
        search_pattern = f"%{search}%"
        params.extend([search_pattern, search_pattern])

    # Count total
    count_row = await db.fetchone(f"SELECT COUNT(*) as cnt FROM nodes {where_clause}", params)
    total = count_row["cnt"] if count_row else 0

    # Fetch page
    query = f"SELECT * FROM nodes {where_clause} ORDER BY last_seen DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])
    rows = await db.fetchall(query, params)

    # Deserialize JSON fields
    for row in rows:
        row["friends"] = json_list(row.get("friends"))

    return {
        "nodes": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


async def get_node(db: DatabaseManager, node_id: str) -> Optional[Dict[str, Any]]:
    """Get node detail by ID. Returns None if not found."""
    node = await db.fetchone("SELECT * FROM nodes WHERE id = ?", (node_id,))
    if node is None:
        return None
    node["friends"] = json_list(node.get("friends"))
    return node


# ─── Account Management (Admin) ────────────────────────────────────────


async def list_accounts(
    db: DatabaseManager,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a paginated list of accounts, optionally filtered by search."""
    offset = (page - 1) * per_page
    params: list[Any] = []

    where_clause = ""
    if search:
        where_clause = (
            "WHERE id LIKE ? OR email LIKE ? OR display_name LIKE ? "
            "OR agent_name LIKE ? OR public_key LIKE ?"
        )
        search_pattern = f"%{search}%"
        params.extend([search_pattern] * 5)

    count_row = await db.fetchone(f"SELECT COUNT(*) as cnt FROM accounts {where_clause}", params)
    total = count_row["cnt"] if count_row else 0

    query = f"SELECT * FROM accounts {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])
    rows = await db.fetchall(query, params)

    # Remove password_hash and deserialize JSON
    for row in rows:
        row.pop("password_hash", None)
        row["friends"] = json_list(row.get("friends"))
        row["visit_permissions"] = json_list(row.get("visit_permissions"))

    return {
        "accounts": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


async def create_account(db: DatabaseManager, data: Dict[str, Any]) -> Dict[str, Any]:
    """Admin creates an account.

    Required in data: type, public_key
    For human: email, password, display_name
    For ai: agent_name
    """
    account_type = data.get("type", "human")
    public_key = data.get("public_key")
    if not public_key:
        raise ValueError("public_key is required")

    # Check for duplicate public_key
    existing = await db.fetchone("SELECT id FROM accounts WHERE public_key = ?", (public_key,))
    if existing:
        raise ValueError("Public key already registered")

    account_id = uuid.uuid4().hex
    now = iso_now()

    if account_type == "human":
        email = data.get("email")
        password = data.get("password")
        display_name = data.get("display_name", "")
        phone = data.get("phone")
        password_hash = _hash_password(password) if password else None

        # Check duplicate email
        if email:
            dup = await db.fetchone("SELECT id FROM accounts WHERE email = ?", (email,))
            if dup:
                raise ValueError("Email already registered")

        await db.execute(
            """
            INSERT INTO accounts
                (id, type, email, phone, password_hash, display_name, public_key,
                 created_at, status, friends, visit_permissions)
            VALUES (?, 'human', ?, ?, ?, ?, ?, ?, 'active', '[]', '[]')
            """,
            (account_id, email, phone, password_hash, display_name, public_key, now),
        )
    else:
        agent_name = data.get("agent_name", "")
        await db.execute(
            """
            INSERT INTO accounts
                (id, type, agent_name, public_key, created_at, status, friends, visit_permissions)
            VALUES (?, 'ai', ?, ?, ?, 'active', '[]', '[]')
            """,
            (account_id, agent_name, public_key, now),
        )

    account = await db.fetchone("SELECT * FROM accounts WHERE id = ?", (account_id,))
    account.pop("password_hash", None)
    account["friends"] = json_list(account.get("friends"))
    account["visit_permissions"] = json_list(account.get("visit_permissions"))
    logger.info("Admin created account: %s", account_id)
    return account


async def update_account(
    db: DatabaseManager,
    account_id: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Admin updates an account. Returns the updated account or None."""
    allowed_fields = {
        "display_name", "agent_name", "phone", "email", "public_key",
        "fingerprint", "status", "visit_permissions", "max_friends",
    }

    updates: list[str] = []
    params: list[Any] = []

    for field, value in data.items():
        if field not in allowed_fields:
            continue
        if field in ("visit_permissions",):
            value = json_serialize(value)
        if field == "password":
            value = _hash_password(value)
            field = "password_hash"
        updates.append(f"{field} = ?")
        params.append(value)

    if not updates:
        row = await db.fetchone("SELECT * FROM accounts WHERE id = ?", (account_id,))
        if row is None:
            return None
        row.pop("password_hash", None)
        row["friends"] = json_list(row.get("friends"))
        row["visit_permissions"] = json_list(row.get("visit_permissions"))
        return row

    updates.append("updated_at = ?")
    params.append(iso_now())
    params.append(account_id)

    await db.execute(
        f"UPDATE accounts SET {', '.join(updates)} WHERE id = ?",
        params,
    )

    row = await db.fetchone("SELECT * FROM accounts WHERE id = ?", (account_id,))
    if row is None:
        return None
    row.pop("password_hash", None)
    row["friends"] = json_list(row.get("friends"))
    row["visit_permissions"] = json_list(row.get("visit_permissions"))
    return row


async def delete_account(db: DatabaseManager, account_id: str) -> bool:
    """Admin deletes an account and all related data."""
    # Delegate to account_service which handles cleanup
    from services.account_service import delete_account as _delete_account
    return await _delete_account(db, account_id)


# ─── Runtime Configuration ─────────────────────────────────────────────


async def get_config(db: DatabaseManager) -> Dict[str, Any]:
    """Get all runtime configuration from admin_config table + Config class."""
    rows = await db.fetchall("SELECT key, value FROM admin_config ORDER BY key")
    db_config = {row["key"]: row["value"] for row in rows}

    # Merge with live Config values
    live_config = Config.to_dict(include_secrets=False)

    return {"database": db_config, "runtime": live_config}


async def update_config(db: DatabaseManager, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update runtime configuration.

    Only whitelisted keys are accepted. Updates both the in-memory Config
    and persists to admin_config table.
    """
    result = Config.update_from_dict(data)

    # Persist updated keys to database
    now = iso_now()
    for key in result["updated"]:
        value = getattr(Config, key, None)
        if value is not None:
            await db.execute(
                "INSERT OR REPLACE INTO admin_config (key, value, updated_at) VALUES (?, ?, ?)",
                (key.lower(), str(value), now),
            )

    logger.info("Config update: updated=%s, rejected=%s", result["updated"], result["rejected"])
    return result


# ─── Blacklist Management ──────────────────────────────────────────────


async def get_blacklist(db: DatabaseManager) -> List[Dict[str, Any]]:
    """List all blacklist entries with account info."""
    rows = await db.fetchall(
        """
        SELECT b.id, b.account_id, b.reason, b.created_at,
               a.display_name, a.agent_name, a.email, a.type
        FROM blacklist b
        LEFT JOIN accounts a ON b.account_id = a.id
        ORDER BY b.created_at DESC
        """,
    )
    return rows


async def add_to_blacklist(
    db: DatabaseManager,
    account_id: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Add an account to the blacklist and suspend it."""
    # Verify account exists
    account = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (account_id,))
    if not account:
        raise ValueError("Account not found")

    now = iso_now()
    await db.execute(
        "INSERT INTO blacklist (account_id, reason, created_at) VALUES (?, ?, ?)",
        (account_id, reason, now),
    )

    # Suspend the account
    await db.execute(
        "UPDATE accounts SET status = 'suspended', updated_at = ? WHERE id = ?",
        (now, account_id),
    )

    logger.info("Added account %s to blacklist: %s", account_id, reason)
    return {"account_id": account_id, "reason": reason, "created_at": now}


async def remove_from_blacklist(db: DatabaseManager, entry_id: int) -> bool:
    """Remove a blacklist entry by ID and reactivate the account."""
    entry = await db.fetchone("SELECT account_id FROM blacklist WHERE id = ?", (entry_id,))
    if not entry:
        return False

    account_id = entry["account_id"]
    await db.execute("DELETE FROM blacklist WHERE id = ?", (entry_id,))

    # Reactivate the account
    now = iso_now()
    await db.execute(
        "UPDATE accounts SET status = 'active', updated_at = ? WHERE id = ?",
        (now, account_id),
    )

    logger.info("Removed account %s from blacklist (entry %d)", account_id, entry_id)
    return True
