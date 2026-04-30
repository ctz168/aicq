"""
AICQ Route Middleware & Helpers
================================
JWT authentication middleware, admin auth middleware, optional auth
middleware, rate-limiting middleware, and response helper functions
for aiohttp route handlers.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any, Dict, Optional

import jwt
from aiohttp import web

from config import Config

logger = logging.getLogger("aicq.middleware")


# ─── Response Helpers ────────────────────────────────────────────────────


def json_response(data: Any, status: int = 200) -> web.Response:
    """Return a JSON response with the given data and HTTP status.

    Uses ``web.json_response`` under the hood, ensuring correct
    ``Content-Type`` headers and JSON serialisation.
    """
    return web.json_response(data, status=status)


def error_response(
    message: str,
    status: int = 400,
    code: Optional[str] = None,
) -> web.Response:
    """Return a standardised JSON error response.

    Example output::

        {
            "error": {
                "message": "Invalid credentials",
                "code": "INVALID_CREDENTIALS"
            }
        }
    """
    body: Dict[str, Any] = {"error": {"message": message}}
    if code is not None:
        body["error"]["code"] = code
    return web.json_response(body, status=status)


# ─── App Helper Accessors ───────────────────────────────────────────────


def get_db(request: web.Request) -> Any:
    """Return the :class:`DatabaseManager` stored on ``request.app``."""
    return request.app["db"]


def get_ws_handler(request: web.Request) -> Any:
    """Return the :class:`WebSocketHandler` stored on ``request.app``."""
    return request.app["ws_handler"]


# ─── JWT Auth Middleware ─────────────────────────────────────────────────


@web.middleware
async def auth_middleware(request: web.Request, handler: Any) -> web.Response:
    """Validate JWT Bearer token and set ``request['account']``.

    Returns **401** if the Authorization header is missing, malformed,
    or the token is invalid/expired.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return error_response(
            "Missing or invalid Authorization header",
            status=401,
            code="AUTH_MISSING",
        )

    token = auth_header[7:]  # strip "Bearer "
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return error_response(
            "Token has expired",
            status=401,
            code="TOKEN_EXPIRED",
        )
    except jwt.InvalidTokenError:
        return error_response(
            "Invalid token",
            status=401,
            code="TOKEN_INVALID",
        )

    # Attach decoded payload so handlers can access account info
    request["account"] = payload
    return await handler(request)


# ─── Admin Auth Middleware ───────────────────────────────────────────────


@web.middleware
async def admin_auth_middleware(request: web.Request, handler: Any) -> web.Response:
    """Validate admin JWT and set ``request['admin'] = True``.

    The admin JWT is signed with ``JWT_SECRET + '-admin'`` and carries
    ``type: 'admin'`` in its payload. Returns **401** on failure.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return error_response(
            "Missing or invalid Authorization header",
            status=401,
            code="AUTH_MISSING",
        )

    token = auth_header[7:]
    try:
        payload = jwt.decode(
            token, Config.JWT_SECRET + "-admin", algorithms=["HS256"]
        )
        if payload.get("type") != "admin":
            return error_response(
                "Not an admin token",
                status=401,
                code="NOT_ADMIN",
            )
    except jwt.ExpiredSignatureError:
        return error_response(
            "Admin token has expired",
            status=401,
            code="TOKEN_EXPIRED",
        )
    except jwt.InvalidTokenError:
        return error_response(
            "Invalid admin token",
            status=401,
            code="TOKEN_INVALID",
        )

    request["admin"] = True
    request["admin_payload"] = payload
    return await handler(request)


# ─── Optional Auth Middleware ────────────────────────────────────────────


@web.middleware
async def optional_auth_middleware(
    request: web.Request, handler: Any
) -> web.Response:
    """Attempt JWT validation if an Authorization header is present.

    If the header is present and valid, ``request['account']`` is set.
    If the header is absent, the request proceeds without auth info.
    If the header is present but invalid, returns **401**.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
            request["account"] = payload
        except jwt.ExpiredSignatureError:
            return error_response(
                "Token has expired",
                status=401,
                code="TOKEN_EXPIRED",
            )
        except jwt.InvalidTokenError:
            return error_response(
                "Invalid token",
                status=401,
                code="TOKEN_INVALID",
            )

    return await handler(request)


# ─── Rate Limit Middleware ───────────────────────────────────────────────


class _RateLimitBucket:
    """Sliding-window rate-limit counter for a single IP."""

    __slots__ = ("timestamps",)

    def __init__(self) -> None:
        self.timestamps: list[float] = []

    def check(self, limit: int, window: float = 60.0) -> bool:
        """Return ``True`` if the request is within *limit* per *window* seconds."""
        now = time.monotonic()
        cutoff = now - window

        # Evict old timestamps
        self.timestamps = [t for t in self.timestamps if t > cutoff]

        if len(self.timestamps) >= limit:
            return False

        self.timestamps.append(now)
        return True


_rate_buckets: Dict[str, _RateLimitBucket] = defaultdict(_RateLimitBucket)


@web.middleware
async def rate_limit_middleware(
    request: web.Request, handler: Any
) -> web.Response:
    """Simple per-IP rate limiting.

    Tracks requests per client IP and limits to
    ``Config.GENERAL_RATE_LIMIT`` requests per 60-second window.
    Returns **429** when the limit is exceeded.
    """
    if Config.RATE_LIMIT_DISABLED:
        return await handler(request)

    client_ip = request.remote or "unknown"
    bucket = _rate_buckets[client_ip]

    if not bucket.check(Config.GENERAL_RATE_LIMIT, window=60.0):
        logger.warning("Rate limit exceeded for IP: %s", client_ip)
        return error_response(
            "Rate limit exceeded",
            status=429,
            code="RATE_LIMITED",
        )

    return await handler(request)
