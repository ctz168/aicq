"""
AICQ Server — Main Entry Point
================================
The aiohttp web server that ties together all AICQ modules:
database, WebSocket handler, REST API routes, DuckDNS management,
background tasks, and middleware.

Usage::

    python server.py                # runs on 0.0.0.0:61018
    PORT=8080 python server.py      # override port
    DEBUG=true python server.py     # verbose logging

Application context keys
------------------------
app['db']             – DatabaseManager instance
app['ws_handler']     – WebSocketHandler instance
app['start_time']     – time.time() at server start
app['shutdown_event'] – asyncio.Event set during graceful shutdown
app['background_tasks'] – set of asyncio.Task for background workers
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional, Set

from aiohttp import web

# ─── Project-local imports ──────────────────────────────────────────────
# Ensure the project root is on sys.path so that sibling modules resolve
# regardless of the working directory the server was launched from.
_PROJECT_ROOT = str(Path(__file__).resolve().parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from config import Config
from db import DatabaseManager, cleanup_expired, init_db
from duckdns import duckdns_update_task, setup_duckdns_routes
from middleware.cors_middleware import cors_middleware
from ws_handler import WebSocketHandler

logger = logging.getLogger("aicq.server")


# ═══════════════════════════════════════════════════════════════════════════
#  Logging setup
# ═══════════════════════════════════════════════════════════════════════════


def _configure_logging() -> None:
    """Configure structured logging for the server process."""
    level = logging.DEBUG if Config.DEBUG else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(levelname)-8s  %(name)-24s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Quieten noisy third-party loggers
    for noisy in ("aiohttp.access", "aiohttp.server", "aiosqlite"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ═══════════════════════════════════════════════════════════════════════════
#  Auth middleware
# ═══════════════════════════════════════════════════════════════════════════


async def auth_middleware(app: web.Application, handler: Any) -> Any:
    """Lightweight auth middleware.

    - Public paths (health, admin init/login, static) are always allowed.
    - All other ``/api/v1/`` paths require a valid JWT in the
      ``Authorization: Bearer <token>`` header.
    - Admin paths require an admin JWT (signed with JWT_SECRET + "-admin").
    - The decoded payload is stored as ``request['auth']`` for downstream
      handlers.
    """
    import jwt as pyjwt  # local import to avoid top-level circular issues

    PUBLIC_PATHS: set[str] = {
        "/health",
        "/",
        "/admin",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/login/phone",
        "/api/v1/auth/challenge",
        "/api/v1/auth/login/agent",
        "/api/v1/auth/refresh",
        "/api/v1/admin/init",
        "/api/v1/admin/login",
        "/api/v1/admin/setup-status",
    }

    # Prefixes that don't need auth
    PUBLIC_PREFIXES = ("/static/", "/ws")

    async def middleware_handler(request: web.Request) -> web.StreamResponse:
        path = request.path

        # ── Public paths: skip auth ────────────────────────────────
        if path in PUBLIC_PATHS:
            return await handler(request)

        for prefix in PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return await handler(request)

        # ── Extract Bearer token ───────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return web.json_response(
                {"error": "Missing or invalid Authorization header"},
                status=401,
            )

        token = auth_header[7:].strip()
        if not token:
            return web.json_response(
                {"error": "Empty bearer token"},
                status=401,
            )

        # ── Admin paths: verify admin JWT ──────────────────────────
        if path.startswith("/api/v1/admin/"):
            try:
                payload = pyjwt.decode(
                    token,
                    Config.JWT_SECRET + "-admin",
                    algorithms=["HS256"],
                )
                if payload.get("type") != "admin":
                    return web.json_response(
                        {"error": "Admin access required"},
                        status=403,
                    )
                request["auth"] = payload
                return await handler(request)
            except pyjwt.ExpiredSignatureError:
                return web.json_response(
                    {"error": "Admin token expired"}, status=401,
                )
            except pyjwt.InvalidTokenError:
                return web.json_response(
                    {"error": "Invalid admin token"}, status=401,
                )

        # ── Regular API paths: verify standard JWT ─────────────────
        try:
            payload = pyjwt.decode(
                token,
                Config.JWT_SECRET,
                algorithms=["HS256"],
            )
            request["auth"] = payload
        except pyjwt.ExpiredSignatureError:
            return web.json_response(
                {"error": "Token expired"}, status=401,
            )
        except pyjwt.InvalidTokenError:
            return web.json_response(
                {"error": "Invalid token"}, status=401,
            )

        return await handler(request)

    return middleware_handler


# ═══════════════════════════════════════════════════════════════════════════
#  Rate-limiting middleware (in-memory, sliding window)
# ═══════════════════════════════════════════════════════════════════════════


async def rate_limit_middleware(app: web.Application, handler: Any) -> Any:
    """Per-IP rate limiter for HTTP endpoints.

    Uses a simple in-memory dict of {ip: deque[timestamp]}.  The limit
    is configurable via ``Config.GENERAL_RATE_LIMIT`` (requests per 60 s).
    WebSocket and static paths are exempt.
    """
    from collections import deque

    if Config.RATE_LIMIT_DISABLED:
        return await handler  # type: ignore[return-value]

    _windows: Dict[str, deque[float]] = {}
    _WINDOW_SECS = 60.0

    async def middleware_handler(request: web.Request) -> web.StreamResponse:
        path = request.path

        # Exempt paths
        if (path.startswith("/ws") or path.startswith("/static")
                or path in ("/health", "/", "/admin")):
            return await handler(request)

        ip = request.remote or "unknown"
        now = time.monotonic()
        cutoff = now - _WINDOW_SECS

        if ip not in _windows:
            _windows[ip] = deque()

        # Prune old entries
        dq = _windows[ip]
        while dq and dq[0] < cutoff:
            dq.popleft()

        if len(dq) >= Config.GENERAL_RATE_LIMIT:
            return web.json_response(
                {"error": "Rate limit exceeded"}, status=429,
            )

        dq.append(now)
        return await handler(request)

    return middleware_handler


# ═══════════════════════════════════════════════════════════════════════════
#  Health check
# ═══════════════════════════════════════════════════════════════════════════


async def health_check(request: web.Request) -> web.Response:
    """GET /health — Return server status, uptime, and storage backend."""
    start_time: float = request.app.get("start_time", time.time())
    uptime = int(time.time() - start_time)
    return web.json_response({
        "status": "ok",
        "uptime": uptime,
        "storage": "sqlite",
    })


# ═══════════════════════════════════════════════════════════════════════════
#  Auth route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_register(request: web.Request) -> web.Response:
    """POST /api/v1/auth/register — Register a new human account."""
    from services.account_service import register_human

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    email = data.get("email")
    password = data.get("password")
    display_name = data.get("display_name", "")
    public_key = data.get("public_key")
    phone = data.get("phone")

    if not email or not password or not public_key:
        return web.json_response(
            {"error": "email, password, and public_key are required"}, status=400,
        )

    db: DatabaseManager = request.app["db"]
    try:
        account = await register_human(db, email, phone, password, display_name, public_key)
        return web.json_response(account, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_register_ai(request: web.Request) -> web.Response:
    """POST /api/v1/auth/register/ai — Register a new AI agent account."""
    from services.account_service import register_ai_agent

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    public_key = data.get("public_key")
    agent_name = data.get("agent_name", "")

    if not public_key:
        return web.json_response({"error": "public_key is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        account = await register_ai_agent(db, public_key, agent_name)
        return web.json_response(account, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_login(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login — Login with email + password."""
    from services.account_service import login_human

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    email = data.get("email")
    password = data.get("password")
    device_info = data.get("device_info")

    if not email or not password:
        return web.json_response({"error": "email and password are required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await login_human(db, email, password, device_info)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=401)


async def api_login_phone(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login/phone — Login with phone + verification code."""
    from services.account_service import login_human_phone

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    phone = data.get("phone")
    code = data.get("code")
    device_info = data.get("device_info")

    if not phone or not code:
        return web.json_response({"error": "phone and code are required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await login_human_phone(db, phone, code, device_info)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=401)


async def api_challenge(request: web.Request) -> web.Response:
    """POST /api/v1/auth/challenge — Get an Ed25519 challenge for AI agent login."""
    from services.account_service import challenge_agent

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    public_key = data.get("public_key")
    if not public_key:
        return web.json_response({"error": "public_key is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await challenge_agent(db, public_key)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=404)


async def api_login_agent(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login/agent — AI agent login with signed challenge."""
    from services.account_service import login_agent

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    public_key = data.get("public_key")
    signature = data.get("signature")
    challenge = data.get("challenge")
    device_info = data.get("device_info")

    if not public_key or not signature or not challenge:
        return web.json_response(
            {"error": "public_key, signature, and challenge are required"}, status=400,
        )

    db: DatabaseManager = request.app["db"]
    try:
        result = await login_agent(db, public_key, signature, challenge, device_info)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=401)


async def api_refresh_token(request: web.Request) -> web.Response:
    """POST /api/v1/auth/refresh — Refresh access token."""
    from services.account_service import refresh_token

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    refresh_tok = data.get("refresh_token")
    if not refresh_tok:
        return web.json_response({"error": "refresh_token is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await refresh_token(db, refresh_tok)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=401)


# ═══════════════════════════════════════════════════════════════════════════
#  Account route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_get_account(request: web.Request) -> web.Response:
    """GET /api/v1/accounts/me — Get the authenticated user's account."""
    from services.account_service import get_account

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    account = await get_account(db, account_id)
    if not account:
        return web.json_response({"error": "Account not found"}, status=404)

    return web.json_response(account)


async def api_update_account(request: web.Request) -> web.Response:
    """PUT /api/v1/accounts/me — Update the authenticated user's account."""
    from services.account_service import update_account

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    db: DatabaseManager = request.app["db"]
    result = await update_account(db, account_id, data)
    if not result:
        return web.json_response({"error": "Account not found"}, status=404)

    return web.json_response(result)


# ═══════════════════════════════════════════════════════════════════════════
#  Friend request route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_send_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/request — Send a friend request."""
    from services.friend_request_service import send_request

    auth = request.get("auth", {})
    from_id = auth.get("sub")
    if not from_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    to_id = data.get("to_id")
    if not to_id:
        return web.json_response({"error": "to_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await send_request(
            db, from_id, to_id,
            message=data.get("message"),
            permissions=data.get("permissions"),
        )
        return web.json_response(result, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_list_friend_requests(request: web.Request) -> web.Response:
    """GET /api/v1/friends/requests — List sent and received friend requests."""
    from services.friend_request_service import list_requests

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    result = await list_requests(db, account_id)
    return web.json_response(result)


async def api_accept_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/requests/{request_id}/accept — Accept a friend request."""
    from services.friend_request_service import accept_request

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        data = {}

    request_id = request.match_info.get("request_id")
    if not request_id:
        return web.json_response({"error": "request_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await accept_request(db, request_id, data.get("permissions"))
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_reject_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/requests/{request_id}/reject — Reject a friend request."""
    from services.friend_request_service import reject_request

    request_id = request.match_info.get("request_id")
    if not request_id:
        return web.json_response({"error": "request_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await reject_request(db, request_id)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


# ═══════════════════════════════════════════════════════════════════════════
#  Friendship route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_list_friends(request: web.Request) -> web.Response:
    """GET /api/v1/friends — List the authenticated user's friends."""
    from services.friendship_service import list_friends

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    friends = await list_friends(db, account_id)
    return web.json_response({"friends": friends})


async def api_remove_friend(request: web.Request) -> web.Response:
    """DELETE /api/v1/friends/{friend_id} — Remove a friend."""
    from services.friendship_service import remove_friend_bidirectional

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    friend_id = request.match_info.get("friend_id")
    if not friend_id:
        return web.json_response({"error": "friend_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    removed = await remove_friend_bidirectional(db, account_id, friend_id)
    if removed:
        return web.json_response({"message": "Friend removed"})
    return web.json_response({"error": "Friend not found"}, status=404)


# ═══════════════════════════════════════════════════════════════════════════
#  Group route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_create_group(request: web.Request) -> web.Response:
    """POST /api/v1/groups — Create a new group."""
    from services.group_service import create_group

    auth = request.get("auth", {})
    owner_id = auth.get("sub")
    if not owner_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    name = data.get("name")
    if not name:
        return web.json_response({"error": "name is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await create_group(
            db, owner_id, name,
            description=data.get("description"),
            max_members=data.get("max_members", Config.MAX_GROUP_MEMBERS),
        )
        return web.json_response(result, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_list_groups(request: web.Request) -> web.Response:
    """GET /api/v1/groups — List groups the authenticated user belongs to."""
    from services.group_service import list_groups

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    groups = await list_groups(db, account_id)
    return web.json_response({"groups": groups})


async def api_get_group(request: web.Request) -> web.Response:
    """GET /api/v1/groups/{group_id} — Get group detail."""
    from services.group_service import get_group

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    group = await get_group(db, group_id)
    if not group:
        return web.json_response({"error": "Group not found"}, status=404)

    return web.json_response(group)


async def api_update_group(request: web.Request) -> web.Response:
    """PUT /api/v1/groups/{group_id} — Update a group."""
    from services.group_service import update_group

    auth = request.get("auth", {})
    owner_id = auth.get("sub")
    if not owner_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await update_group(db, group_id, owner_id, data)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_disband_group(request: web.Request) -> web.Response:
    """DELETE /api/v1/groups/{group_id} — Disband a group."""
    from services.group_service import disband_group

    auth = request.get("auth", {})
    owner_id = auth.get("sub")
    if not owner_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        await disband_group(db, group_id, owner_id)
        return web.json_response({"message": "Group disbanded"})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_invite_member(request: web.Request) -> web.Response:
    """POST /api/v1/groups/{group_id}/members — Invite a member to a group."""
    from services.group_service import invite_member

    auth = request.get("auth", {})
    inviter_id = auth.get("sub")
    if not inviter_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    account_id = data.get("account_id")
    if not account_id:
        return web.json_response({"error": "account_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        member = await invite_member(db, group_id, account_id, inviter_id)
        return web.json_response(member, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_kick_member(request: web.Request) -> web.Response:
    """DELETE /api/v1/groups/{group_id}/members/{account_id} — Kick a group member."""
    from services.group_service import kick_member

    auth = request.get("auth", {})
    kicker_id = auth.get("sub")
    if not kicker_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    group_id = request.match_info.get("group_id")
    account_id = request.match_info.get("account_id")
    if not group_id or not account_id:
        return web.json_response({"error": "group_id and account_id are required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        await kick_member(db, group_id, account_id, kicker_id)
        return web.json_response({"message": "Member kicked"})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_leave_group(request: web.Request) -> web.Response:
    """POST /api/v1/groups/{group_id}/leave — Leave a group."""
    from services.group_service import leave_group

    auth = request.get("auth", {})
    account_id = auth.get("sub")
    if not account_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        await leave_group(db, group_id, account_id)
        return web.json_response({"message": "Left group"})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_get_group_messages(request: web.Request) -> web.Response:
    """GET /api/v1/groups/{group_id}/messages — Get group messages."""
    from services.group_service import get_group_messages

    group_id = request.match_info.get("group_id")
    if not group_id:
        return web.json_response({"error": "group_id is required"}, status=400)

    limit = int(request.query.get("limit", "50"))
    before = request.query.get("before")

    db: DatabaseManager = request.app["db"]
    messages = await get_group_messages(db, group_id, limit=limit, before=before)
    return web.json_response({"messages": messages})


# ═══════════════════════════════════════════════════════════════════════════
#  Temp number route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_generate_temp_number(request: web.Request) -> web.Response:
    """POST /api/v1/temp-number — Generate a temp number for P2P handshake."""
    from services.temp_number_service import generate

    auth = request.get("auth", {})
    node_id = auth.get("sub")
    if not node_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    result = await generate(db, node_id)
    return web.json_response(result, status=201)


async def api_resolve_temp_number(request: web.Request) -> web.Response:
    """GET /api/v1/temp-number/{number} — Resolve a temp number to a node."""
    from services.temp_number_service import resolve

    number = request.match_info.get("number")
    if not number:
        return web.json_response({"error": "number is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    result = await resolve(db, number)
    if not result:
        return web.json_response({"error": "Invalid or expired temp number"}, status=404)

    return web.json_response(result)


# ═══════════════════════════════════════════════════════════════════════════
#  Handshake route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_initiate_handshake(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/initiate — Initiate a P2P handshake."""
    from services.handshake_service import initiate

    auth = request.get("auth", {})
    requester_id = auth.get("sub")
    if not requester_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    temp_number = data.get("temp_number")
    if not temp_number:
        return web.json_response({"error": "temp_number is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await initiate(db, requester_id, temp_number)
        return web.json_response(result, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_respond_handshake(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/respond — Respond to a handshake."""
    from services.handshake_service import respond

    auth = request.get("auth", {})
    responder_id = auth.get("sub")
    if not responder_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    session_id = data.get("session_id")
    response_data = data.get("response_data")
    if not session_id or not response_data:
        return web.json_response(
            {"error": "session_id and response_data are required"}, status=400,
        )

    db: DatabaseManager = request.app["db"]
    try:
        result = await respond(db, session_id, responder_id, response_data)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_confirm_handshake(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/confirm — Confirm a handshake."""
    from services.handshake_service import confirm

    auth = request.get("auth", {})
    confirmer_id = auth.get("sub")
    if not confirmer_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    session_id = data.get("session_id")
    confirm_data = data.get("confirm_data")
    if not session_id or not confirm_data:
        return web.json_response(
            {"error": "session_id and confirm_data are required"}, status=400,
        )

    db: DatabaseManager = request.app["db"]
    try:
        result = await confirm(db, session_id, confirmer_id, confirm_data)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_get_pending_handshakes(request: web.Request) -> web.Response:
    """GET /api/v1/handshake/pending — Get pending handshake requests."""
    from services.handshake_service import get_pending_requests

    auth = request.get("auth", {})
    node_id = auth.get("sub")
    if not node_id:
        return web.json_response({"error": "Invalid token"}, status=401)

    db: DatabaseManager = request.app["db"]
    requests = await get_pending_requests(db, node_id)
    return web.json_response({"requests": requests})


# ═══════════════════════════════════════════════════════════════════════════
#  Admin route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_admin_init(request: web.Request) -> web.Response:
    """POST /api/v1/admin/init — First-time admin setup."""
    from services.admin_service import is_initialized, init_admin

    db: DatabaseManager = request.app["db"]

    if await is_initialized(db):
        return web.json_response({"error": "Admin is already initialized"}, status=409)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    password = data.get("password")
    if not password or len(password) < 6:
        return web.json_response(
            {"error": "Password is required (min 6 characters)"}, status=400,
        )

    result = await init_admin(db, password)
    return web.json_response(result, status=201)


async def api_admin_login(request: web.Request) -> web.Response:
    """POST /api/v1/admin/login — Admin login."""
    from services.admin_service import login_admin

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    password = data.get("password")
    if not password:
        return web.json_response({"error": "password is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await login_admin(db, password)
        return web.json_response(result)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=401)


async def api_admin_stats(request: web.Request) -> web.Response:
    """GET /api/v1/admin/stats — Dashboard statistics."""
    from services.admin_service import get_stats

    db: DatabaseManager = request.app["db"]
    stats = await get_stats(db)
    return web.json_response(stats)


async def api_admin_list_nodes(request: web.Request) -> web.Response:
    """GET /api/v1/admin/nodes — List all nodes (paginated)."""
    from services.admin_service import list_nodes

    db: DatabaseManager = request.app["db"]
    page = int(request.query.get("page", "1"))
    per_page = int(request.query.get("per_page", "20"))
    search = request.query.get("search")

    result = await list_nodes(db, page=page, per_page=per_page, search=search)
    return web.json_response(result)


async def api_admin_get_node(request: web.Request) -> web.Response:
    """GET /api/v1/admin/nodes/{node_id} — Get node detail."""
    from services.admin_service import get_node

    node_id = request.match_info.get("node_id")
    if not node_id:
        return web.json_response({"error": "node_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    node = await get_node(db, node_id)
    if not node:
        return web.json_response({"error": "Node not found"}, status=404)

    return web.json_response(node)


async def api_admin_list_accounts(request: web.Request) -> web.Response:
    """GET /api/v1/admin/accounts — List all accounts (paginated)."""
    from services.admin_service import list_accounts

    db: DatabaseManager = request.app["db"]
    page = int(request.query.get("page", "1"))
    per_page = int(request.query.get("per_page", "20"))
    search = request.query.get("search")

    result = await list_accounts(db, page=page, per_page=per_page, search=search)
    return web.json_response(result)


async def api_admin_create_account(request: web.Request) -> web.Response:
    """POST /api/v1/admin/accounts — Admin creates an account."""
    from services.admin_service import create_account

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        account = await create_account(db, data)
        return web.json_response(account, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_admin_update_account(request: web.Request) -> web.Response:
    """PUT /api/v1/admin/accounts/{account_id} — Admin updates an account."""
    from services.admin_service import update_account

    account_id = request.match_info.get("account_id")
    if not account_id:
        return web.json_response({"error": "account_id is required"}, status=400)

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    db: DatabaseManager = request.app["db"]
    result = await update_account(db, account_id, data)
    if not result:
        return web.json_response({"error": "Account not found"}, status=404)

    return web.json_response(result)


async def api_admin_delete_account(request: web.Request) -> web.Response:
    """DELETE /api/v1/admin/accounts/{account_id} — Admin deletes an account."""
    from services.admin_service import delete_account

    account_id = request.match_info.get("account_id")
    if not account_id:
        return web.json_response({"error": "account_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    deleted = await delete_account(db, account_id)
    if deleted:
        return web.json_response({"message": "Account deleted"})
    return web.json_response({"error": "Account not found"}, status=404)


async def api_admin_get_config(request: web.Request) -> web.Response:
    """GET /api/v1/admin/config — Get runtime configuration."""
    from services.admin_service import get_config

    db: DatabaseManager = request.app["db"]
    config = await get_config(db)
    return web.json_response(config)


async def api_admin_update_config(request: web.Request) -> web.Response:
    """POST /api/v1/admin/config — Update runtime configuration."""
    from services.admin_service import update_config

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    db: DatabaseManager = request.app["db"]
    result = await update_config(db, data)
    return web.json_response(result)


async def api_admin_get_blacklist(request: web.Request) -> web.Response:
    """GET /api/v1/admin/blacklist — Get blacklist entries."""
    from services.admin_service import get_blacklist

    db: DatabaseManager = request.app["db"]
    entries = await get_blacklist(db)
    return web.json_response({"entries": entries})


async def api_admin_add_blacklist(request: web.Request) -> web.Response:
    """POST /api/v1/admin/blacklist — Add an account to the blacklist."""
    from services.admin_service import add_to_blacklist

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    account_id = data.get("account_id")
    if not account_id:
        return web.json_response({"error": "account_id is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await add_to_blacklist(db, account_id, data.get("reason"))
        return web.json_response(result, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=404)


async def api_admin_remove_blacklist(request: web.Request) -> web.Response:
    """DELETE /api/v1/admin/blacklist/{entry_id} — Remove from blacklist."""
    from services.admin_service import remove_from_blacklist

    try:
        entry_id = int(request.match_info.get("entry_id", "0"))
    except (ValueError, TypeError):
        return web.json_response({"error": "Invalid entry_id"}, status=400)

    db: DatabaseManager = request.app["db"]
    removed = await remove_from_blacklist(db, entry_id)
    if removed:
        return web.json_response({"message": "Blacklist entry removed"})
    return web.json_response({"error": "Blacklist entry not found"}, status=404)


# ═══════════════════════════════════════════════════════════════════════════
#  Verification route handlers
# ═══════════════════════════════════════════════════════════════════════════


async def api_send_verification(request: web.Request) -> web.Response:
    """POST /api/v1/verification/send — Send a verification code."""
    from services.verification_service import send_code

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    target = data.get("target")
    code_type = data.get("type", "email")
    purpose = data.get("purpose", "register")

    if not target:
        return web.json_response({"error": "target is required"}, status=400)

    db: DatabaseManager = request.app["db"]
    try:
        result = await send_code(db, target, code_type, purpose)
        return web.json_response(result, status=201)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=409)


async def api_verify_code(request: web.Request) -> web.Response:
    """POST /api/v1/verification/verify — Verify a code."""
    from services.verification_service import verify_code

    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    target = data.get("target")
    code = data.get("code")
    purpose = data.get("purpose", "register")

    if not target or not code:
        return web.json_response({"error": "target and code are required"}, status=400)

    db: DatabaseManager = request.app["db"]
    verified = await verify_code(db, target, code, purpose)
    if verified:
        return web.json_response({"verified": True})
    return web.json_response({"error": "Invalid or expired code"}, status=400)


# ═══════════════════════════════════════════════════════════════════════════
#  Route registration
# ═══════════════════════════════════════════════════════════════════════════


def setup_auth_routes(app: web.Application) -> None:
    """Register authentication API routes."""
    prefix = "/api/v1/auth"
    app.router.add_post(f"{prefix}/register", api_register)
    app.router.add_post(f"{prefix}/register/ai", api_register_ai)
    app.router.add_post(f"{prefix}/login", api_login)
    app.router.add_post(f"{prefix}/login/phone", api_login_phone)
    app.router.add_post(f"{prefix}/challenge", api_challenge)
    app.router.add_post(f"{prefix}/login/agent", api_login_agent)
    app.router.add_post(f"{prefix}/refresh", api_refresh_token)
    logger.debug("Auth routes registered under %s", prefix)


def setup_account_routes(app: web.Application) -> None:
    """Register account API routes."""
    prefix = "/api/v1/accounts"
    app.router.add_get(f"{prefix}/me", api_get_account)
    app.router.add_put(f"{prefix}/me", api_update_account)
    logger.debug("Account routes registered under %s", prefix)


def setup_friend_routes(app: web.Application) -> None:
    """Register friend and friend-request API routes."""
    prefix = "/api/v1/friends"
    app.router.add_get(prefix, api_list_friends)
    app.router.add_delete(f"{prefix}/{{friend_id}}", api_remove_friend)
    app.router.add_post(f"{prefix}/request", api_send_friend_request)
    app.router.add_get(f"{prefix}/requests", api_list_friend_requests)
    app.router.add_post(f"{prefix}/requests/{{request_id}}/accept", api_accept_friend_request)
    app.router.add_post(f"{prefix}/requests/{{request_id}}/reject", api_reject_friend_request)
    logger.debug("Friend routes registered under %s", prefix)


def setup_group_routes(app: web.Application) -> None:
    """Register group API routes."""
    prefix = "/api/v1/groups"
    app.router.add_post(prefix, api_create_group)
    app.router.add_get(prefix, api_list_groups)
    app.router.add_get(f"{prefix}/{{group_id}}", api_get_group)
    app.router.add_put(f"{prefix}/{{group_id}}", api_update_group)
    app.router.add_delete(f"{prefix}/{{group_id}}", api_disband_group)
    app.router.add_post(f"{prefix}/{{group_id}}/members", api_invite_member)
    app.router.add_delete(f"{prefix}/{{group_id}}/members/{{account_id}}", api_kick_member)
    app.router.add_post(f"{prefix}/{{group_id}}/leave", api_leave_group)
    app.router.add_get(f"{prefix}/{{group_id}}/messages", api_get_group_messages)
    logger.debug("Group routes registered under %s", prefix)


def setup_temp_number_routes(app: web.Application) -> None:
    """Register temp number API routes."""
    prefix = "/api/v1/temp-number"
    app.router.add_post(prefix, api_generate_temp_number)
    app.router.add_get(f"{prefix}/{{number}}", api_resolve_temp_number)
    logger.debug("Temp number routes registered under %s", prefix)


def setup_handshake_routes(app: web.Application) -> None:
    """Register handshake API routes."""
    prefix = "/api/v1/handshake"
    app.router.add_post(f"{prefix}/initiate", api_initiate_handshake)
    app.router.add_post(f"{prefix}/respond", api_respond_handshake)
    app.router.add_post(f"{prefix}/confirm", api_confirm_handshake)
    app.router.add_get(f"{prefix}/pending", api_get_pending_handshakes)
    logger.debug("Handshake routes registered under %s", prefix)


def setup_admin_routes(app: web.Application) -> None:
    """Register admin API routes."""
    prefix = "/api/v1/admin"
    app.router.add_post(f"{prefix}/init", api_admin_init)
    app.router.add_post(f"{prefix}/login", api_admin_login)
    app.router.add_get(f"{prefix}/stats", api_admin_stats)
    app.router.add_get(f"{prefix}/nodes", api_admin_list_nodes)
    app.router.add_get(f"{prefix}/nodes/{{node_id}}", api_admin_get_node)
    app.router.add_get(f"{prefix}/accounts", api_admin_list_accounts)
    app.router.add_post(f"{prefix}/accounts", api_admin_create_account)
    app.router.add_put(f"{prefix}/accounts/{{account_id}}", api_admin_update_account)
    app.router.add_delete(f"{prefix}/accounts/{{account_id}}", api_admin_delete_account)
    app.router.add_get(f"{prefix}/config", api_admin_get_config)
    app.router.add_post(f"{prefix}/config", api_admin_update_config)
    app.router.add_get(f"{prefix}/blacklist", api_admin_get_blacklist)
    app.router.add_post(f"{prefix}/blacklist", api_admin_add_blacklist)
    app.router.add_delete(f"{prefix}/blacklist/{{entry_id}}", api_admin_remove_blacklist)
    logger.debug("Admin routes registered under %s", prefix)


def setup_verification_routes(app: web.Application) -> None:
    """Register verification API routes."""
    prefix = "/api/v1/verification"
    app.router.add_post(f"{prefix}/send", api_send_verification)
    app.router.add_post(f"{prefix}/verify", api_verify_code)
    logger.debug("Verification routes registered under %s", prefix)


# All route setup functions, called in order during startup
_ROUTE_SETUP_FUNCTIONS = [
    setup_auth_routes,
    setup_account_routes,
    setup_friend_routes,
    setup_group_routes,
    setup_temp_number_routes,
    setup_handshake_routes,
    setup_admin_routes,
    setup_verification_routes,
    setup_duckdns_routes,
]


# ═══════════════════════════════════════════════════════════════════════════
#  Background tasks
# ═══════════════════════════════════════════════════════════════════════════


async def _periodic_cleanup(app: web.Application) -> None:
    """Background task: run ``cleanup_expired`` every 60 seconds.

    Checks the shutdown event every 15 seconds for responsive termination.
    """
    INTERVAL = 60
    CHECK = 15
    logger.info("Periodic cleanup task started (interval=%ds)", INTERVAL)

    while True:
        elapsed = 0
        while elapsed < INTERVAL:
            shutdown_event: Optional[asyncio.Event] = app.get("shutdown_event")
            if shutdown_event is not None and shutdown_event.is_set():
                logger.info("Periodic cleanup task stopping (shutdown)")
                return
            await asyncio.sleep(CHECK)
            elapsed += CHECK

        db: DatabaseManager = app["db"]
        try:
            result = await cleanup_expired(db)
            logger.debug("Periodic cleanup: %s", result)
        except Exception:
            logger.exception("Error during periodic cleanup")


# ═══════════════════════════════════════════════════════════════════════════
#  Startup / Cleanup hooks
# ═══════════════════════════════════════════════════════════════════════════


async def on_startup(app: web.Application) -> None:
    """Application startup hook.

    1. Initialize the database
    2. Create the WebSocketHandler
    3. Set application context values
    4. Start background tasks
    """
    logger.info("AICQ server starting up …")

    # ── Database ────────────────────────────────────────────────────
    app["db"] = await init_db(Config.DB_PATH)

    # ── WebSocket handler ───────────────────────────────────────────
    app["ws_handler"] = WebSocketHandler(app["db"])

    # ── Application context ─────────────────────────────────────────
    app["start_time"] = time.time()
    app["shutdown_event"] = asyncio.Event()
    app["background_tasks"]: Set[asyncio.Task] = set()

    # ── Register all routes ─────────────────────────────────────────
    app.router.add_get("/health", health_check)
    app.router.add_get("/ws", app["ws_handler"].handle_websocket)

    # ── Page routes (serve HTML pages without auth) ─────────────────
    static_dir = Path(__file__).resolve().parent / "static"
    if static_dir.is_dir():
        async def serve_index(request: web.Request) -> web.FileResponse:
            idx = static_dir / "index.html"
            if idx.exists():
                return web.FileResponse(idx)
            return web.Response(text="<h1>AICQ Server</h1>", content_type="text/html")

        async def serve_admin(request: web.Request) -> web.FileResponse:
            adm = static_dir / "admin.html"
            if adm.exists():
                return web.FileResponse(adm)
            return web.Response(text="<h1>Admin Panel</h1>", content_type="text/html")

        app.router.add_get("/", serve_index)
        app.router.add_get("/admin", serve_admin)

    for setup_fn in _ROUTE_SETUP_FUNCTIONS:
        setup_fn(app)

    # ── Static files for admin panel ────────────────────────────────
    static_dir = Path(__file__).resolve().parent / "static"
    if static_dir.is_dir():
        app.router.add_static("/static", str(static_dir), name="static")
        logger.info("Serving static files from %s", static_dir)
    else:
        logger.debug("No static directory found at %s — skipping", static_dir)

    # ── Background tasks ────────────────────────────────────────────
    cleanup_task = asyncio.create_task(_periodic_cleanup(app))
    app["background_tasks"].add(cleanup_task)
    cleanup_task.add_done_callback(app["background_tasks"].discard)

    duckdns_task = asyncio.create_task(duckdns_update_task(app))
    app["background_tasks"].add(duckdns_task)
    duckdns_task.add_done_callback(app["background_tasks"].discard)

    logger.info(
        "AICQ server ready — host=%s port=%s db=%s",
        Config.HOST,
        Config.PORT,
        Config.DB_PATH,
    )


async def on_cleanup(app: web.Application) -> None:
    """Application cleanup hook.

    1. Signal background tasks to stop
    2. Wait for them to finish (with timeout)
    3. Close the database connection
    """
    logger.info("AICQ server shutting down …")

    # ── Signal shutdown ──────────────────────────────────────────────
    shutdown_event: Optional[asyncio.Event] = app.get("shutdown_event")
    if shutdown_event is not None:
        shutdown_event.set()

    # ── Cancel background tasks ──────────────────────────────────────
    tasks: Set[asyncio.Task] = app.get("background_tasks", set())
    for task in tasks:
        task.cancel()

    if tasks:
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=10,
            )
        except asyncio.TimeoutError:
            logger.warning("Some background tasks did not finish in time")

    # ── Close database ───────────────────────────────────────────────
    db: Optional[DatabaseManager] = app.get("db")
    if db is not None:
        await db.close()

    logger.info("AICQ server shutdown complete")


# ═══════════════════════════════════════════════════════════════════════════
#  Application factory
# ═══════════════════════════════════════════════════════════════════════════


def create_app() -> web.Application:
    """Build and return the fully configured aiohttp Application.

    Order of middleware matters — they are executed in reverse order
    (last added runs first on the way in), so we add:

    1. CORS   — outermost, so CORS headers are always set
    2. Auth   — authentication gate
    3. Rate limiter — innermost, closest to the handler
    """
    app = web.Application(
        middlewares=[
            cors_middleware,
            auth_middleware,
            rate_limit_middleware,
        ],
    )

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    return app


# ═══════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════


def main() -> None:
    """Entry point — configure logging, create the app, and run."""
    _configure_logging()

    logger.info(
        "Starting AICQ server on %s:%s (debug=%s)",
        Config.HOST,
        Config.PORT,
        Config.DEBUG,
    )

    app = create_app()
    web.run_app(
        app,
        host=Config.HOST,
        port=Config.PORT,
        print=None,  # suppress default "running on …" message
    )


if __name__ == "__main__":
    main()
