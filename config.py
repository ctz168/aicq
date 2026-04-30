"""
AICQ Server Configuration Module

Reads configuration from environment variables and an optional `.env` file.
Provides a singleton ``Config`` class with all settings as class attributes,
support for runtime updates from the database (admin API), and helpers for
serialization / deserialization.
"""

from __future__ import annotations

import logging
import os
import secrets
import threading
from pathlib import Path
from typing import Any, ClassVar

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# .env loading
# ---------------------------------------------------------------------------

_ENV_FILE_LOADED: bool = False

try:
    from dotenv import load_dotenv  # type: ignore[import-untyped]

    # Load from the directory that contains *this* file first, then from CWD
    # as a fallback so that running the server from any location still works.
    _this_dir = Path(__file__).resolve().parent
    _env_path = _this_dir / ".env"

    if _env_path.is_file():
        load_dotenv(_env_path, override=False)
        _ENV_FILE_LOADED = True
        logger.debug("Loaded .env from %s", _env_path)

    # Also try CWD (development convenience) – won't overwrite values already set
    load_dotenv(override=False)
except ImportError:
    logger.debug(
        "python-dotenv is not installed; skipping .env file loading. "
        "Relying solely on environment variables."
    )


# ---------------------------------------------------------------------------
# Helper: environment variable parsers
# ---------------------------------------------------------------------------

def _env_int(key: str, default: int) -> int:
    """Read an integer from the environment, falling back to *default*."""
    raw = os.environ.get(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid integer value for %s=%r, using default %d", key, raw, default)
        return default


def _env_str(key: str, default: str) -> str:
    """Read a string from the environment, falling back to *default*."""
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    """Read a boolean from the environment.

    Accepted truthy values: ``true``, ``1``, ``yes``, ``on`` (case-insensitive).
    Everything else is considered falsy.
    """
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in ("true", "1", "yes", "on")


# ---------------------------------------------------------------------------
# JWT secret auto-generation
# ---------------------------------------------------------------------------

def _resolve_jwt_secret() -> str:
    """Return the JWT secret from the environment, or generate & persist one."""
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        return secret

    # Auto-generate a cryptographically strong secret
    secret = secrets.token_urlsafe(48)  # ~64 chars of base64url
    logger.info("JWT_SECRET not set – generated a random secret.")

    # Persist to .env so the same secret survives restarts
    _save_env_var("JWT_SECRET", secret)
    os.environ["JWT_SECRET"] = secret
    return secret


def _save_env_var(key: str, value: str) -> None:
    """Append or update a variable in the ``.env`` file next to this module."""
    env_path = Path(__file__).resolve().parent / ".env"

    # Read existing content
    lines: list[str] = []
    if env_path.is_file():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    # Update in-place if the key already exists
    prefix = f"{key}="
    replaced = False
    for i, line in enumerate(lines):
        if line.strip().startswith(prefix):
            lines[i] = f"{key}={value}"
            replaced = True
            break

    if not replaced:
        # Ensure trailing newline before appending
        if lines and lines[-1].strip() != "":
            lines.append("")
        lines.append(f"{key}={value}")

    try:
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        logger.debug("Saved %s to %s", key, env_path)
    except OSError as exc:
        logger.warning("Could not write %s to .env file: %s", key, exc)


# ---------------------------------------------------------------------------
# Runtime-updatable configuration whitelist
# ---------------------------------------------------------------------------

_RUNTIME_UPDATABLE_KEYS: frozenset[str] = frozenset(
    {
        "MAX_FRIENDS",
        "MAX_FRIENDS_HUMAN_TO_HUMAN",
        "MAX_FRIENDS_HUMAN_TO_AI",
        "MAX_FRIENDS_AI_TO_HUMAN",
        "MAX_FRIENDS_AI_TO_AI",
        "MAX_GROUPS_PER_ACCOUNT",
        "MAX_GROUP_MEMBERS",
        "MAX_GROUP_MESSAGES",
        "MAX_HTTP_CONNECTIONS",
        "MAX_WS_CONNECTIONS",
        "TEMP_NUMBER_TTL_HOURS",
        "ALLOW_LOCALHOST",
    }
)

# Mapping from config key → expected Python type (for validation in update_from_dict)
_KEY_TYPES: dict[str, type] = {
    "MAX_FRIENDS": int,
    "MAX_FRIENDS_HUMAN_TO_HUMAN": int,
    "MAX_FRIENDS_HUMAN_TO_AI": int,
    "MAX_FRIENDS_AI_TO_HUMAN": int,
    "MAX_FRIENDS_AI_TO_AI": int,
    "MAX_GROUPS_PER_ACCOUNT": int,
    "MAX_GROUP_MEMBERS": int,
    "MAX_GROUP_MESSAGES": int,
    "MAX_HTTP_CONNECTIONS": int,
    "MAX_WS_CONNECTIONS": int,
    "TEMP_NUMBER_TTL_HOURS": int,
    "ALLOW_LOCALHOST": bool,
}


# ---------------------------------------------------------------------------
# Config class
# ---------------------------------------------------------------------------

class Config:
    """Central server configuration.

    All settings are class-level attributes so they can be accessed without
    instantiation (``Config.PORT``).  Runtime-updatable settings can be
    changed via :meth:`update_from_dict`, which is thread-safe.
    """

    # ── Server ──────────────────────────────────────────────────────────
    PORT: int = _env_int("PORT", 61018)
    DOMAIN: str = _env_str("DOMAIN", "aicq.online")
    HOST: str = _env_str("HOST", "0.0.0.0")
    DEBUG: bool = _env_bool("DEBUG", False)

    # ── Auth ────────────────────────────────────────────────────────────
    JWT_SECRET: str = _resolve_jwt_secret()
    JWT_ACCESS_TOKEN_EXPIRY: int = _env_int("JWT_ACCESS_TOKEN_EXPIRY", 3600)
    JWT_REFRESH_TOKEN_EXPIRY: int = _env_int("JWT_REFRESH_TOKEN_EXPIRY", 2_592_000)
    ADMIN_JWT_EXPIRY: int = _env_int("ADMIN_JWT_EXPIRY", 86_400)

    # ── Limits ──────────────────────────────────────────────────────────
    MAX_FRIENDS: int = _env_int("MAX_FRIENDS", 200)
    MAX_FRIENDS_HUMAN_TO_HUMAN: int = _env_int("MAX_FRIENDS_HUMAN_TO_HUMAN", 200)
    MAX_FRIENDS_HUMAN_TO_AI: int = _env_int("MAX_FRIENDS_HUMAN_TO_AI", 500)
    MAX_FRIENDS_AI_TO_HUMAN: int = _env_int("MAX_FRIENDS_AI_TO_HUMAN", 1000)
    MAX_FRIENDS_AI_TO_AI: int = _env_int("MAX_FRIENDS_AI_TO_AI", 1000)
    MAX_GROUPS_PER_ACCOUNT: int = _env_int("MAX_GROUPS_PER_ACCOUNT", 20)
    MAX_GROUP_MEMBERS: int = _env_int("MAX_GROUP_MEMBERS", 100)
    MAX_GROUP_MESSAGES: int = _env_int("MAX_GROUP_MESSAGES", 5000)
    MAX_HTTP_CONNECTIONS: int = _env_int("MAX_HTTP_CONNECTIONS", 5000)
    MAX_WS_CONNECTIONS: int = _env_int("MAX_WS_CONNECTIONS", 10000)
    TEMP_NUMBER_TTL_HOURS: int = _env_int("TEMP_NUMBER_TTL_HOURS", 24)

    # ── Feature flags ───────────────────────────────────────────────────
    ALLOW_LOCALHOST: bool = _env_bool("ALLOW_LOCALHOST", False)
    RATE_LIMIT_DISABLED: bool = _env_bool("RATE_LIMIT_DISABLED", False)

    # ── Database ────────────────────────────────────────────────────────
    DB_PATH: str = _env_str("DB_PATH", "aicq.db")

    # ── DuckDNS ─────────────────────────────────────────────────────────
    DUCKDNS_CONFIG_FILE: str = _env_str("DUCKDNS_CONFIG_FILE", "duckdns_config.json")

    # ── Rate limits ─────────────────────────────────────────────────────
    GENERAL_RATE_LIMIT: int = _env_int("GENERAL_RATE_LIMIT", 60)
    TEMP_NUMBER_RATE_LIMIT: int = _env_int("TEMP_NUMBER_RATE_LIMIT", 5)
    HANDSHAKE_RATE_LIMIT: int = _env_int("HANDSHAKE_RATE_LIMIT", 10)
    LOGIN_RATE_LIMIT: int = _env_int("LOGIN_RATE_LIMIT", 5)
    LOGIN_LOCKOUT_MINUTES: int = _env_int("LOGIN_LOCKOUT_MINUTES", 15)

    # ── WebSocket limits ────────────────────────────────────────────────
    WS_RATE_LIMIT_MESSAGES: int = _env_int("WS_RATE_LIMIT_MESSAGES", 30)
    WS_MAX_MESSAGE_SIZE: int = _env_int("WS_MAX_MESSAGE_SIZE", 262_144)

    # ── SMTP ────────────────────────────────────────────────────────────
    SMTP_HOST: str = _env_str("SMTP_HOST", "")
    SMTP_PORT: int = _env_int("SMTP_PORT", 587)
    SMTP_USER: str = _env_str("SMTP_USER", "")
    SMTP_PASS: str = _env_str("SMTP_PASS", "")

    # ── Internal bookkeeping ────────────────────────────────────────────
    _lock: ClassVar[threading.Lock] = threading.Lock()
    """Lock to make runtime updates thread-safe."""

    # ── Public API ──────────────────────────────────────────────────────

    @classmethod
    def to_dict(cls, *, include_secrets: bool = False) -> dict[str, Any]:
        """Return a dictionary of all configuration values.

        Parameters
        ----------
        include_secrets:
            If ``True``, sensitive fields (``JWT_SECRET``, ``SMTP_PASS``) are
            included.  Defaults to ``False`` so the result is safe for API
            responses.
        """
        result: dict[str, Any] = {}

        secret_keys: frozenset[str] = frozenset({"JWT_SECRET", "SMTP_PASS"})

        for key in _ALL_CONFIG_KEYS:
            if not include_secrets and key in secret_keys:
                continue
            result[key] = getattr(cls, key)

        return result

    @classmethod
    def update_from_dict(cls, data: dict[str, Any]) -> dict[str, list[str]]:
        """Apply runtime configuration updates from *data*.

        Only whitelisted keys are accepted.  The method is thread-safe.

        Parameters
        ----------
        data:
            Mapping of config key → new value.  Boolean values may be
            provided as ``bool`` or as the strings ``"true"`` / ``"false"``
            (case-insensitive).  Integer values may be provided as ``int`` or
            as numeric strings.

        Returns
        -------
        dict
            A report with two keys:
            - ``"updated"`` – list of keys that were successfully updated
            - ``"rejected"`` – list of keys that were rejected (not whitelisted
              or invalid type)
        """
        updated: list[str] = []
        rejected: list[str] = []

        with cls._lock:
            for key, value in data.items():
                if key not in _RUNTIME_UPDATABLE_KEYS:
                    rejected.append(key)
                    logger.debug("Rejected runtime config update for non-whitelisted key: %s", key)
                    continue

                expected_type = _KEY_TYPES.get(key)
                if expected_type is None:
                    # Shouldn't happen if whitelists are consistent, but guard anyway
                    rejected.append(key)
                    continue

                coerced = _coerce_value(value, expected_type)
                if coerced is _COERCE_FAILED:
                    rejected.append(key)
                    logger.warning(
                        "Rejected runtime config update for %s: cannot coerce %r to %s",
                        key,
                        value,
                        expected_type.__name__,
                    )
                    continue

                old_value = getattr(cls, key)
                setattr(cls, key, coerced)
                updated.append(key)
                logger.info(
                    "Runtime config update: %s = %r (was %r)", key, coerced, old_value
                )

        return {"updated": updated, "rejected": rejected}

    @classmethod
    def reload_from_env(cls) -> None:
        """Re-read every configuration value from environment variables.

        Useful during testing or when the process environment has been
        modified externally.
        """
        with cls._lock:
            cls.PORT = _env_int("PORT", 61018)
            cls.DOMAIN = _env_str("DOMAIN", "aicq.online")
            cls.HOST = _env_str("HOST", "0.0.0.0")
            cls.DEBUG = _env_bool("DEBUG", False)

            cls.JWT_SECRET = _env_str("JWT_SECRET", "") or cls.JWT_SECRET
            cls.JWT_ACCESS_TOKEN_EXPIRY = _env_int("JWT_ACCESS_TOKEN_EXPIRY", 3600)
            cls.JWT_REFRESH_TOKEN_EXPIRY = _env_int("JWT_REFRESH_TOKEN_EXPIRY", 2_592_000)
            cls.ADMIN_JWT_EXPIRY = _env_int("ADMIN_JWT_EXPIRY", 86_400)

            cls.MAX_FRIENDS = _env_int("MAX_FRIENDS", 200)
            cls.MAX_FRIENDS_HUMAN_TO_HUMAN = _env_int("MAX_FRIENDS_HUMAN_TO_HUMAN", 200)
            cls.MAX_FRIENDS_HUMAN_TO_AI = _env_int("MAX_FRIENDS_HUMAN_TO_AI", 500)
            cls.MAX_FRIENDS_AI_TO_HUMAN = _env_int("MAX_FRIENDS_AI_TO_HUMAN", 1000)
            cls.MAX_FRIENDS_AI_TO_AI = _env_int("MAX_FRIENDS_AI_TO_AI", 1000)
            cls.MAX_GROUPS_PER_ACCOUNT = _env_int("MAX_GROUPS_PER_ACCOUNT", 20)
            cls.MAX_GROUP_MEMBERS = _env_int("MAX_GROUP_MEMBERS", 100)
            cls.MAX_GROUP_MESSAGES = _env_int("MAX_GROUP_MESSAGES", 5000)
            cls.MAX_HTTP_CONNECTIONS = _env_int("MAX_HTTP_CONNECTIONS", 5000)
            cls.MAX_WS_CONNECTIONS = _env_int("MAX_WS_CONNECTIONS", 10000)
            cls.TEMP_NUMBER_TTL_HOURS = _env_int("TEMP_NUMBER_TTL_HOURS", 24)

            cls.ALLOW_LOCALHOST = _env_bool("ALLOW_LOCALHOST", False)
            cls.RATE_LIMIT_DISABLED = _env_bool("RATE_LIMIT_DISABLED", False)

            cls.DB_PATH = _env_str("DB_PATH", "aicq.db")

            cls.DUCKDNS_CONFIG_FILE = _env_str("DUCKDNS_CONFIG_FILE", "duckdns_config.json")

            cls.GENERAL_RATE_LIMIT = _env_int("GENERAL_RATE_LIMIT", 60)
            cls.TEMP_NUMBER_RATE_LIMIT = _env_int("TEMP_NUMBER_RATE_LIMIT", 5)
            cls.HANDSHAKE_RATE_LIMIT = _env_int("HANDSHAKE_RATE_LIMIT", 10)
            cls.LOGIN_RATE_LIMIT = _env_int("LOGIN_RATE_LIMIT", 5)
            cls.LOGIN_LOCKOUT_MINUTES = _env_int("LOGIN_LOCKOUT_MINUTES", 15)

            cls.WS_RATE_LIMIT_MESSAGES = _env_int("WS_RATE_LIMIT_MESSAGES", 30)
            cls.WS_MAX_MESSAGE_SIZE = _env_int("WS_MAX_MESSAGE_SIZE", 262_144)

            cls.SMTP_HOST = _env_str("SMTP_HOST", "")
            cls.SMTP_PORT = _env_int("SMTP_PORT", 587)
            cls.SMTP_USER = _env_str("SMTP_USER", "")
            cls.SMTP_PASS = _env_str("SMTP_PASS", "")

        logger.info("Configuration reloaded from environment variables.")


# ---------------------------------------------------------------------------
# Coercion helper
# ---------------------------------------------------------------------------

_COERCE_FAILED = object()  # sentinel for failed coercions


def _coerce_value(value: Any, target_type: type) -> Any:
    """Attempt to coerce *value* to *target_type*.

    Returns the coerced value, or the ``_COERCE_FAILED`` sentinel on failure.
    """
    if isinstance(value, target_type):
        return value

    if target_type is int:
        if isinstance(value, str):
            try:
                return int(value)
            except (ValueError, TypeError):
                return _COERCE_FAILED
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return _COERCE_FAILED

    if target_type is bool:
        if isinstance(value, str):
            return value.strip().lower() in ("true", "1", "yes", "on")
        # int → bool
        if isinstance(value, int):
            return bool(value)
        return _COERCE_FAILED

    if target_type is str:
        return str(value)

    return _COERCE_FAILED


# ---------------------------------------------------------------------------
# All config keys (for to_dict iteration)
# ---------------------------------------------------------------------------

_ALL_CONFIG_KEYS: tuple[str, ...] = (
    # Server
    "PORT",
    "DOMAIN",
    "HOST",
    "DEBUG",
    # Auth
    "JWT_SECRET",
    "JWT_ACCESS_TOKEN_EXPIRY",
    "JWT_REFRESH_TOKEN_EXPIRY",
    "ADMIN_JWT_EXPIRY",
    # Limits
    "MAX_FRIENDS",
    "MAX_FRIENDS_HUMAN_TO_HUMAN",
    "MAX_FRIENDS_HUMAN_TO_AI",
    "MAX_FRIENDS_AI_TO_HUMAN",
    "MAX_FRIENDS_AI_TO_AI",
    "MAX_GROUPS_PER_ACCOUNT",
    "MAX_GROUP_MEMBERS",
    "MAX_GROUP_MESSAGES",
    "MAX_HTTP_CONNECTIONS",
    "MAX_WS_CONNECTIONS",
    "TEMP_NUMBER_TTL_HOURS",
    # Feature flags
    "ALLOW_LOCALHOST",
    "RATE_LIMIT_DISABLED",
    # Database
    "DB_PATH",
    # DuckDNS
    "DUCKDNS_CONFIG_FILE",
    # Rate limits
    "GENERAL_RATE_LIMIT",
    "TEMP_NUMBER_RATE_LIMIT",
    "HANDSHAKE_RATE_LIMIT",
    "LOGIN_RATE_LIMIT",
    "LOGIN_LOCKOUT_MINUTES",
    # WS limits
    "WS_RATE_LIMIT_MESSAGES",
    "WS_MAX_MESSAGE_SIZE",
    # SMTP
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
)
