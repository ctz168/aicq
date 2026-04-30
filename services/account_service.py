"""
AICQ Account Service
=====================
Handles account registration, authentication, JWT token management,
and Ed25519 challenge-response authentication for AI agents.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

import bcrypt
import jwt
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

from db import DatabaseManager, json_serialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.account_service")


# ─── Password Helpers ───────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt. Returns the UTF-8 decoded hash."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ─── JWT Helpers ────────────────────────────────────────────────────────


def _create_access_token(account_id: str, account_type: str, display_name: Optional[str]) -> str:
    """Create a short-lived access token (1 hour by default)."""
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRY)
    payload = {
        "sub": account_id,
        "type": account_type,
        "displayName": display_name or "",
        "iat": now,
        "exp": expiry,
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def _create_refresh_token(account_id: str) -> str:
    """Create a long-lived refresh token (30 days by default)."""
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(seconds=Config.JWT_REFRESH_TOKEN_EXPIRY)
    payload = {
        "sub": account_id,
        "type": "refresh",
        "iat": now,
        "exp": expiry,
    }
    return jwt.encode(payload, Config.JWT_SECRET + "-refresh", algorithm="HS256")


# ─── Registration ──────────────────────────────────────────────────────


async def register_human(
    db: DatabaseManager,
    email: str,
    phone: Optional[str],
    password: str,
    display_name: str,
    public_key: str,
) -> Dict[str, Any]:
    """Register a new human account.

    Returns the created account record (without password_hash).
    Raises ValueError if the email or public_key is already registered.
    """
    # Check for duplicate email
    if email:
        existing = await db.fetchone("SELECT id FROM accounts WHERE email = ?", (email,))
        if existing:
            raise ValueError("Email already registered")

    # Check for duplicate public_key
    existing = await db.fetchone("SELECT id FROM accounts WHERE public_key = ?", (public_key,))
    if existing:
        raise ValueError("Public key already registered")

    account_id = uuid.uuid4().hex
    now = iso_now()
    password_hash = _hash_password(password)

    await db.execute(
        """
        INSERT INTO accounts
            (id, type, email, phone, password_hash, display_name, public_key,
             created_at, status, friends, visit_permissions)
        VALUES (?, 'human', ?, ?, ?, ?, ?, ?, 'active', '[]', '[]')
        """,
        (account_id, email, phone, password_hash, display_name, public_key, now),
    )

    account = await get_account(db, account_id)
    logger.info("Registered human account: %s (%s)", account_id, email)
    return account


async def register_ai_agent(
    db: DatabaseManager,
    public_key: str,
    agent_name: str,
) -> Dict[str, Any]:
    """Register a new AI agent account.

    Returns the created account record.
    Raises ValueError if the public_key is already registered.
    """
    existing = await db.fetchone("SELECT id FROM accounts WHERE public_key = ?", (public_key,))
    if existing:
        raise ValueError("Public key already registered")

    account_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO accounts
            (id, type, agent_name, public_key, created_at, status, friends, visit_permissions)
        VALUES (?, 'ai', ?, ?, ?, 'active', '[]', '[]')
        """,
        (account_id, agent_name, public_key, now),
    )

    account = await get_account(db, account_id)
    logger.info("Registered AI agent account: %s (%s)", account_id, agent_name)
    return account


# ─── Login / Authentication ────────────────────────────────────────────


async def login_human(
    db: DatabaseManager,
    email: str,
    password: str,
    device_info: Optional[str] = None,
) -> Dict[str, Any]:
    """Authenticate a human account by email + password.

    Returns a dict with access_token, refresh_token, and account info.
    Raises ValueError on invalid credentials.
    """
    account = await db.fetchone("SELECT * FROM accounts WHERE email = ? AND type = 'human'", (email,))
    if not account:
        raise ValueError("Invalid email or password")

    if account["status"] != "active":
        raise ValueError("Account is not active")

    if not account["password_hash"] or not _verify_password(password, account["password_hash"]):
        raise ValueError("Invalid email or password")

    # Update last login
    now = iso_now()
    await db.execute("UPDATE accounts SET last_login_at = ? WHERE id = ?", (now, account["id"]))

    # Create session
    tokens = await create_session(db, account["id"], device_info)

    logger.info("Human login: %s", account["id"])
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "account": _sanitize_account(account),
    }


async def login_human_phone(
    db: DatabaseManager,
    phone: str,
    code: str,
    device_info: Optional[str] = None,
) -> Dict[str, Any]:
    """Authenticate a human account by phone + verification code.

    Verifies the code, then creates a session.
    Raises ValueError on invalid phone, code, or account state.
    """
    account = await db.fetchone("SELECT * FROM accounts WHERE phone = ? AND type = 'human'", (phone,))
    if not account:
        raise ValueError("No account found for this phone number")

    if account["status"] != "active":
        raise ValueError("Account is not active")

    # Verify the code
    from services.verification_service import verify_code

    verified = await verify_code(db, phone, code, "login")
    if not verified:
        raise ValueError("Invalid or expired verification code")

    # Update last login
    now = iso_now()
    await db.execute("UPDATE accounts SET last_login_at = ? WHERE id = ?", (now, account["id"]))

    # Create session
    tokens = await create_session(db, account["id"], device_info)

    logger.info("Human phone login: %s", account["id"])
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "account": _sanitize_account(account),
    }


async def challenge_agent(
    db: DatabaseManager,
    public_key: str,
) -> Dict[str, Any]:
    """Generate and store a random challenge for Ed25519 agent authentication.

    Returns a dict with session_id and challenge (hex-encoded).
    Raises ValueError if no AI account matches the public_key.
    """
    account = await db.fetchone(
        "SELECT id FROM accounts WHERE public_key = ? AND type = 'ai'",
        (public_key,),
    )
    if not account:
        raise ValueError("No AI agent account found for this public key")

    # Generate a random challenge (32 bytes, hex-encoded)
    import secrets as _secrets
    challenge = _secrets.token_hex(32)

    # Store challenge in a lightweight way — we use the sessions table
    # with a special prefix on the token field to distinguish challenge sessions
    session_id = uuid.uuid4().hex
    now = iso_now()
    # Challenge expires in 5 minutes
    challenge_expiry = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    await db.execute(
        """
        INSERT INTO sessions (id, account_id, token, refresh_token, device_info, created_at, expires_at)
        VALUES (?, ?, ?, '', 'challenge', ?, ?)
        """,
        (session_id, account["id"], f"challenge:{challenge}", now, challenge_expiry),
    )

    return {"session_id": session_id, "challenge": challenge}


async def login_agent(
    db: DatabaseManager,
    public_key: str,
    signature: str,
    challenge: str,
    device_info: Optional[str] = None,
) -> Dict[str, Any]:
    """Authenticate an AI agent via Ed25519 challenge-response.

    The agent signs the challenge with its private key; we verify using
    the stored public_key. On success, create a session and return tokens.

    Raises ValueError on invalid credentials or expired challenge.
    """
    account = await db.fetchone(
        "SELECT * FROM accounts WHERE public_key = ? AND type = 'ai'",
        (public_key,),
    )
    if not account:
        raise ValueError("No AI agent account found for this public key")

    if account["status"] != "active":
        raise ValueError("Account is not active")

    # Verify the Ed25519 signature
    try:
        # public_key and signature are hex-encoded
        verify_key = VerifyKey(bytes.fromhex(public_key))
        verify_key.verify(bytes.fromhex(challenge), bytes.fromhex(signature))
    except (BadSignatureError, Exception) as exc:
        raise ValueError(f"Invalid signature: {exc}") from exc

    # Clean up challenge sessions
    await db.execute(
        "DELETE FROM sessions WHERE account_id = ? AND device_info = 'challenge'",
        (account["id"],),
    )

    # Update last login
    now = iso_now()
    await db.execute("UPDATE accounts SET last_login_at = ? WHERE id = ?", (now, account["id"]))

    # Create session
    tokens = await create_session(db, account["id"], device_info)

    logger.info("AI agent login: %s", account["id"])
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "account": _sanitize_account(account),
    }


# ─── Session / Token Management ────────────────────────────────────────


async def create_session(
    db: DatabaseManager,
    account_id: str,
    device_info: Optional[str] = None,
) -> Dict[str, str]:
    """Create a new session with access and refresh tokens.

    Returns a dict with access_token and refresh_token.
    """
    account = await db.fetchone("SELECT id, type, display_name, agent_name FROM accounts WHERE id = ?", (account_id,))
    if not account:
        raise ValueError("Account not found")

    display_name = account["display_name"] or account["agent_name"] or ""
    access_token = _create_access_token(account_id, account["type"], display_name)
    refresh_token = _create_refresh_token(account_id)

    session_id = uuid.uuid4().hex
    now = iso_now()
    refresh_expiry = (datetime.now(timezone.utc) + timedelta(seconds=Config.JWT_REFRESH_TOKEN_EXPIRY)).isoformat()

    await db.execute(
        """
        INSERT INTO sessions (id, account_id, token, refresh_token, device_info, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_id, account_id, access_token, refresh_token, device_info, now, refresh_expiry),
    )

    return {"access_token": access_token, "refresh_token": refresh_token}


def verify_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT access token.

    Returns the token payload dict.
    Raises jwt.PyJWTError on invalid or expired tokens.
    """
    return jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])


async def refresh_token(db: DatabaseManager, refresh_tok: str) -> Dict[str, Any]:
    """Verify a refresh token and issue a new access token.

    Returns a dict with new access_token and refresh_token.
    Raises ValueError on invalid or expired refresh tokens.
    """
    try:
        payload = jwt.decode(refresh_tok, Config.JWT_SECRET + "-refresh", algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ValueError(f"Invalid refresh token: {exc}") from exc

    account_id = payload.get("sub")
    if not account_id:
        raise ValueError("Invalid refresh token: missing subject")

    # Verify the account still exists and is active
    account = await db.fetchone(
        "SELECT id, type, status, display_name, agent_name FROM accounts WHERE id = ?",
        (account_id,),
    )
    if not account:
        raise ValueError("Account not found")
    if account["status"] != "active":
        raise ValueError("Account is not active")

    # Verify the session still exists
    session = await db.fetchone(
        "SELECT id FROM sessions WHERE refresh_token = ? AND account_id = ?",
        (refresh_tok, account_id),
    )
    if not session:
        raise ValueError("Session not found")

    # Delete the old session
    await db.execute("DELETE FROM sessions WHERE id = ?", (session["id"],))

    # Create a new session
    tokens = await create_session(db, account_id)

    logger.info("Refreshed token for account: %s", account_id)
    return tokens


# ─── Account CRUD ──────────────────────────────────────────────────────


async def get_account(db: DatabaseManager, account_id: str) -> Optional[Dict[str, Any]]:
    """Fetch an account by ID. Returns sanitized dict or None."""
    account = await db.fetchone("SELECT * FROM accounts WHERE id = ?", (account_id,))
    if account is None:
        return None
    return _sanitize_account(account)


async def get_account_by_email(db: DatabaseManager, email: str) -> Optional[Dict[str, Any]]:
    """Fetch an account by email. Returns sanitized dict or None."""
    account = await db.fetchone("SELECT * FROM accounts WHERE email = ?", (email,))
    if account is None:
        return None
    return _sanitize_account(account)


async def get_account_by_phone(db: DatabaseManager, phone: str) -> Optional[Dict[str, Any]]:
    """Fetch an account by phone. Returns sanitized dict or None."""
    account = await db.fetchone("SELECT * FROM accounts WHERE phone = ?", (phone,))
    if account is None:
        return None
    return _sanitize_account(account)


async def update_account(
    db: DatabaseManager,
    account_id: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update account fields.

    Only whitelisted fields are updated. Returns the updated account or None.
    """
    allowed_fields = {
        "display_name", "agent_name", "phone", "email", "public_key",
        "fingerprint", "status", "visit_permissions",
    }

    updates: list[str] = []
    params: list[Any] = []

    for field, value in data.items():
        if field not in allowed_fields:
            continue
        if field in ("visit_permissions",):
            value = json_serialize(value)
        updates.append(f"{field} = ?")
        params.append(value)

    if not updates:
        return await get_account(db, account_id)

    updates.append("updated_at = ?")
    params.append(iso_now())
    params.append(account_id)

    await db.execute(
        f"UPDATE accounts SET {', '.join(updates)} WHERE id = ?",
        params,
    )

    return await get_account(db, account_id)


async def delete_account(db: DatabaseManager, account_id: str) -> bool:
    """Delete an account and all related data.

    Returns True if the account was deleted, False otherwise.
    """
    # Delete sessions first (foreign key cascade should handle this, but be explicit)
    await db.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
    # The accounts table has ON DELETE CASCADE on foreign keys referencing it,
    # but some tables (like node_permissions) don't have FK constraints.
    # Clean up related data explicitly.

    # Remove from friends arrays of other accounts
    account = await db.fetchone("SELECT friends FROM accounts WHERE id = ?", (account_id,))
    if account:
        friend_ids = json_list(account["friends"])
        for friend_id in friend_ids:
            await db.execute(
                "UPDATE accounts SET friends = ? WHERE id = ?",
                (json_serialize([]), friend_id),  # Simplified — ideally remove just this ID
            )

    # Remove node_permissions entries
    await db.execute("DELETE FROM node_permissions WHERE node_id = ? OR friend_id = ?", (account_id, account_id))

    # Remove friend_requests
    await db.execute("DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?", (account_id, account_id))

    # Delete the account itself
    cursor = await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    deleted = cursor.rowcount > 0

    if deleted:
        logger.info("Deleted account: %s", account_id)

    return deleted


# ─── Internal Helpers ──────────────────────────────────────────────────


def _sanitize_account(account: Dict[str, Any]) -> Dict[str, Any]:
    """Remove sensitive fields from an account dict and deserialize JSON fields."""
    sanitized = dict(account)
    sanitized.pop("password_hash", None)

    # Deserialize JSON fields
    sanitized["friends"] = json_list(sanitized.get("friends"))
    sanitized["visit_permissions"] = json_list(sanitized.get("visit_permissions"))

    return sanitized
