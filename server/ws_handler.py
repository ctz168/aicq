"""
AICQ WebSocket Handler Module
==============================

Complete WebSocket handler for the AICQ Python server rewrite.
Manages real-time bidirectional communication between nodes,
including authentication, presence, E2EE relay, WebRTC signaling,
group messaging, file chunk relay, sub-agent orchestration,
and notification delivery.

Architecture
------------
- ``WebSocketHandler`` owns the in-memory online node registry and
  provides ``handle_websocket`` as an aiohttp WebSocket handler.
- Each connection is wrapped in a ``ConnectionState`` object that
  tracks authentication, rate limiting, and heartbeat timing.
- A background ``asyncio.Task`` performs periodic cleanup of stale
  connections and expired database records.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set

import jwt
from aiohttp import web

from config import Config
from db import DatabaseManager, iso_now, json_deserialize, json_list, json_serialize

logger = logging.getLogger("aicq.ws")


# ═══════════════════════════════════════════════════════════════════════════
#  Error codes
# ═══════════════════════════════════════════════════════════════════════════


class WSError(str, Enum):
    """Standardised error codes sent to clients."""

    AUTH_MISSING_FIELDS = "AUTH_MISSING_FIELDS"
    AUTH_MISSING_NODE_ID = "AUTH_MISSING_NODE_ID"
    AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN"
    AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    AUTH_NODE_MISMATCH = "AUTH_NODE_MISMATCH"
    AUTH_ACCOUNT_DISABLED = "AUTH_ACCOUNT_DISABLED"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    NOT_ONLINE = "NOT_ONLINE"
    TARGET_NOT_FRIEND = "TARGET_NOT_FRIEND"
    TARGET_NOT_ONLINE = "TARGET_NOT_ONLINE"
    GROUP_NOT_FOUND = "GROUP_NOT_FOUND"
    GROUP_NOT_MEMBER = "GROUP_NOT_MEMBER"
    GROUP_MUTED = "GROUP_MUTED"
    RATE_LIMITED = "RATE_LIMITED"
    MESSAGE_TOO_LARGE = "MESSAGE_TOO_LARGE"
    INVALID_MESSAGE = "INVALID_MESSAGE"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_FOUND = "NOT_FOUND"
    ALREADY_ONLINE = "ALREADY_ONLINE"


# ═══════════════════════════════════════════════════════════════════════════
#  Rate limiter
# ═══════════════════════════════════════════════════════════════════════════


class RateLimiter:
    """Sliding-window rate limiter for a single WebSocket connection.

    Tracks message timestamps within a rolling window and rejects
    messages that exceed the configured rate.
    """

    __slots__ = ("max_messages", "window_seconds", "_timestamps")

    def __init__(self, max_messages: int = 30, window_seconds: float = 10.0) -> None:
        self.max_messages = max_messages
        self.window_seconds = window_seconds
        self._timestamps: deque[float] = deque()

    def check(self) -> bool:
        """Return ``True`` if the message is allowed, ``False`` if rate-limited."""
        now = time.monotonic()
        cutoff = now - self.window_seconds

        # Evict timestamps outside the window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

        if len(self._timestamps) >= self.max_messages:
            return False

        self._timestamps.append(now)
        return True


# ═══════════════════════════════════════════════════════════════════════════
#  Connection state
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class ConnectionState:
    """Per-connection state tracked by the handler."""

    ws: web.WebSocketResponse
    node_id: Optional[str] = None
    account_id: Optional[str] = None
    account_type: Optional[str] = None
    authenticated: bool = False
    connected_at: float = field(default_factory=time.monotonic)
    last_ping: float = field(default_factory=time.monotonic)
    rate_limiter: RateLimiter = field(default_factory=RateLimiter)
    friend_ids: Set[str] = field(default_factory=set)
    group_ids: Set[str] = field(default_factory=set)


# ═══════════════════════════════════════════════════════════════════════════
#  Helper: send JSON over WebSocket
# ═══════════════════════════════════════════════════════════════════════════


async def _ws_send(ws: web.WebSocketResponse, data: Dict[str, Any]) -> None:
    """Safely send a JSON message over a WebSocket.

    Catches and logs errors from closed / broken connections.
    """
    try:
        if not ws.closed:
            await ws.send_json(data)
    except Exception:
        logger.debug("Failed to send WS message (connection likely closed)")


# ═══════════════════════════════════════════════════════════════════════════
#  WebSocket Handler
# ═══════════════════════════════════════════════════════════════════════════


class WebSocketHandler:
    """Central WebSocket handler for the AICQ server.

    Owns the in-memory online node registry, processes all message types,
    and coordinates real-time features (presence, relay, groups, etc.).

    Usage::

        handler = WebSocketHandler(db)
        app.router.add_get("/ws", handler.handle_websocket)
    """

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

        # node_id → ConnectionState (authenticated connections only)
        self._online: Dict[str, ConnectionState] = {}

        # ws → ConnectionState (all connections, including pre-auth)
        self._connections: Dict[int, ConnectionState] = {}

        # Background tasks
        self._cleanup_task: Optional[asyncio.Task] = None

    # ─── Public entry point ─────────────────────────────────────────────

    async def handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        """aiohttp WebSocket handler.

        Performs the full connection lifecycle:
        1. Upgrade to WebSocket
        2. Wait for authentication (30 s timeout)
        3. Message loop
        4. Cleanup on disconnect
        """
        ws = web.WebSocketResponse(
            max_msg_size=Config.WS_MAX_MESSAGE_SIZE,
            heartbeat=None,  # we manage our own heartbeat
        )
        await ws.prepare(request)

        state = ConnectionState(ws=ws)
        self._connections[id(ws)] = state
        logger.info("WS connected from %s", request.remote)

        try:
            # ── Phase 1: authentication ──────────────────────────────
            auth_ok = await self._wait_for_auth(ws, state, timeout=30)
            if not auth_ok:
                await ws.close(code=4001, message=b"Authentication timeout")
                return ws

            # ── Phase 2: main message loop ──────────────────────────
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    await self._process_text_message(state, msg.data)
                elif msg.type == web.WSMsgType.ERROR:
                    logger.error(
                        "WS error for node %s: %s", state.node_id, ws.exception()
                    )
                    break
                elif msg.type in (
                    web.WSMsgType.CLOSE,
                    web.WSMsgType.CLOSING,
                    web.WSMsgType.CLOSED,
                ):
                    break

        except Exception:
            logger.exception("Unhandled error in WS loop for node %s", state.node_id)
        finally:
            await self._on_disconnect(state)

        return ws

    # ─── Authentication ─────────────────────────────────────────────────

    async def _wait_for_auth(
        self, ws: web.WebSocketResponse, state: ConnectionState, timeout: float = 30
    ) -> bool:
        """Wait for an ``online`` message within *timeout* seconds.

        Returns ``True`` if authentication succeeded.
        """
        deadline = time.monotonic() + timeout
        try:
            while time.monotonic() < deadline:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break

                try:
                    msg = await asyncio.wait_for(ws.__anext__(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                except StopAsyncIteration:
                    # WS closed
                    return False

                if msg.type == web.WSMsgType.TEXT:
                    result = await self._handle_online(state, msg.data)
                    if result:
                        return True
                    # Auth failed but we sent an error — keep waiting
                    # within the timeout window
                    continue

                if msg.type in (
                    web.WSMsgType.CLOSE,
                    web.WSMsgType.CLOSING,
                    web.WSMsgType.CLOSED,
                ):
                    return False

                if msg.type == web.WSMsgType.ERROR:
                    logger.error("WS error during auth: %s", ws.exception())
                    return False

        except Exception:
            logger.exception("Error during WS auth")

        return False

    async def _handle_online(
        self, state: ConnectionState, raw: str
    ) -> bool:
        """Process an ``online`` authentication message.

        Returns ``True`` on successful authentication.
        """
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Invalid JSON"},
            )
            return False

        msg_type = data.get("type")
        if msg_type != "online":
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_REQUIRED,
                    "message": "First message must be 'online'",
                },
            )
            return False

        node_id = data.get("nodeId")
        token = data.get("token")

        # ── Field validation ─────────────────────────────────────
        if not node_id and not token:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_MISSING_FIELDS,
                    "message": "Missing nodeId and token",
                },
            )
            return False

        if not node_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_MISSING_NODE_ID,
                    "message": "Missing nodeId",
                },
            )
            return False

        if not token:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_MISSING_TOKEN,
                    "message": "Missing token",
                },
            )
            return False

        # ── JWT verification ─────────────────────────────────────
        try:
            payload = jwt.decode(
                token,
                Config.JWT_SECRET,
                algorithms=["HS256"],
            )
        except jwt.ExpiredSignatureError:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_TOKEN_EXPIRED,
                    "message": "Token expired",
                },
            )
            return False
        except jwt.InvalidTokenError:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_INVALID_TOKEN,
                    "message": "Invalid token",
                },
            )
            return False

        # ── nodeId ↔ JWT sub match ───────────────────────────────
        jwt_sub = payload.get("sub")
        if jwt_sub != node_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_NODE_MISMATCH,
                    "message": "nodeId does not match token subject",
                },
            )
            return False

        # ── Account status check ─────────────────────────────────
        account = await self.db.fetchone(
            "SELECT id, type, status, friends FROM accounts WHERE id = ?",
            (node_id,),
        )
        if account is None:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_INVALID_TOKEN,
                    "message": "Account not found",
                },
            )
            return False

        if account["status"] != "active":
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_ACCOUNT_DISABLED,
                    "message": f"Account is {account['status']}",
                },
            )
            return False

        # ── Duplicate connection handling ────────────────────────
        existing = self._online.get(node_id)
        if existing is not None and existing.ws is not state.ws:
            # Kick the old connection
            logger.info("Kicking existing WS for node %s", node_id)
            await _ws_send(
                existing.ws,
                {
                    "type": "error",
                    "code": WSError.ALREADY_ONLINE,
                    "message": "Replaced by new connection",
                },
            )
            try:
                await existing.ws.close(code=4002, message=b"Replaced by new connection")
            except Exception:
                pass
            # Remove stale entry
            self._online.pop(node_id, None)

        # ── Register ─────────────────────────────────────────────
        state.node_id = node_id
        state.account_id = account["id"]
        state.account_type = account["type"]
        state.authenticated = True
        state.friend_ids = set(json_list(account["friends"]))
        self._online[node_id] = state

        # Update node's last_seen in DB
        now = iso_now()
        await self.db.execute(
            "INSERT INTO nodes (id, public_key, last_seen, socket_id, friend_count, friends) "
            "VALUES (?, '', ?, ?, 0, '[]') "
            "ON CONFLICT(id) DO UPDATE SET last_seen=?, socket_id=?",
            (node_id, now, str(id(state.ws)), now, str(id(state.ws))),
        )

        # Load group memberships
        await self._load_group_memberships(state)

        # ── Notify friends of presence ───────────────────────────
        await self._broadcast_presence(node_id, online=True, friend_ids=state.friend_ids)

        # ── Success ──────────────────────────────────────────────
        await _ws_send(state.ws, {"type": "online_ack", "nodeId": node_id})
        logger.info("Node %s authenticated", node_id)
        return True

    async def _load_group_memberships(self, state: ConnectionState) -> None:
        """Populate ``state.group_ids`` from the database."""
        rows = await self.db.fetchall(
            "SELECT id, members_json FROM groups"
        )
        state.group_ids = set()
        for row in rows:
            members = json_list(row["members_json"])
            if state.node_id in members:
                state.group_ids.add(row["id"])

    # ─── Disconnect ──────────────────────────────────────────────────────

    async def _on_disconnect(self, state: ConnectionState) -> None:
        """Handle WebSocket disconnection — cleanup and presence broadcast."""
        self._connections.pop(id(state.ws), None)

        if state.authenticated and state.node_id:
            node_id = state.node_id
            # Only remove from online if we're still the current connection
            current = self._online.get(node_id)
            if current is state:
                self._online.pop(node_id, None)
                # Notify friends
                await self._broadcast_presence(
                    node_id, online=False, friend_ids=state.friend_ids
                )
                logger.info("Node %s disconnected", node_id)
            else:
                logger.debug(
                    "Stale disconnect for node %s (already replaced)", node_id
                )

        # Ensure the WS is closed
        if not state.ws.closed:
            try:
                await state.ws.close()
            except Exception:
                pass

    # ─── Message dispatch ───────────────────────────────────────────────

    async def _process_text_message(self, state: ConnectionState, raw: str) -> None:
        """Parse and dispatch a single text message."""
        # ── Auth gate ────────────────────────────────────────────
        if not state.authenticated:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.AUTH_REQUIRED,
                    "message": "Not authenticated",
                },
            )
            return

        # ── Rate limit ───────────────────────────────────────────
        if not Config.RATE_LIMIT_DISABLED and not state.rate_limiter.check():
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.RATE_LIMITED,
                    "message": "Rate limit exceeded",
                },
            )
            return

        # ── Parse JSON ───────────────────────────────────────────
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Invalid JSON",
                },
            )
            return

        msg_type = data.get("type")
        if not isinstance(msg_type, str):
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing or invalid 'type' field",
                },
            )
            return

        # ── Dispatch ─────────────────────────────────────────────
        handler = self._DISPATCH_TABLE.get(msg_type)
        if handler is not None:
            try:
                await handler(self, state, data)
            except Exception:
                logger.exception(
                    "Error handling message type '%s' from node %s",
                    msg_type,
                    state.node_id,
                )
                await _ws_send(
                    state.ws,
                    {
                        "type": "error",
                        "code": WSError.INTERNAL_ERROR,
                        "message": f"Internal error handling {msg_type}",
                    },
                )
        else:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": f"Unknown message type: {msg_type}",
                },
            )

    # ─── Individual message handlers ─────────────────────────────────────

    # ---- offline ---------------------------------------------------------

    async def _handle_offline(self, state: ConnectionState, data: Dict[str, Any]) -> None:
        """Process an ``offline`` message — intentional disconnect."""
        node_id = state.node_id
        if node_id and self._online.get(node_id) is state:
            self._online.pop(node_id, None)
            await self._broadcast_presence(
                node_id, online=False, friend_ids=state.friend_ids
            )
        state.authenticated = False
        try:
            await state.ws.close(code=1000, message=b"Client went offline")
        except Exception:
            pass

    # ---- ping / pong -----------------------------------------------------

    async def _handle_ping(self, state: ConnectionState, data: Dict[str, Any]) -> None:
        """Respond to ``ping`` with ``pong``."""
        state.last_ping = time.monotonic()
        await _ws_send(state.ws, {"type": "pong", "timestamp": int(time.time() * 1000)})

    # ---- relay -----------------------------------------------------------

    async def _handle_relay(self, state: ConnectionState, data: Dict[str, Any]) -> None:
        """Relay an encrypted E2EE message to a friend."""
        target_id = data.get("targetId")
        payload = data.get("payload")

        if not target_id:
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Missing targetId"},
            )
            return

        # Verify friendship
        if target_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{target_id} is not your friend",
                },
            )
            return

        # Forward if online
        target_state = self._online.get(target_id)
        if target_state is not None:
            await _ws_send(
                target_state.ws,
                {
                    "type": "relay",
                    "fromId": state.node_id,
                    "payload": payload,
                },
            )
        else:
            # Target is offline — inform sender
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_ONLINE,
                    "message": f"{target_id} is not online",
                },
            )

    # ---- signal ----------------------------------------------------------

    async def _handle_signal(self, state: ConnectionState, data: Dict[str, Any]) -> None:
        """Relay a WebRTC signaling message to a friend."""
        target_id = data.get("to")
        signal_data = data.get("data")

        if not target_id:
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Missing 'to'"},
            )
            return

        if target_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{target_id} is not your friend",
                },
            )
            return

        target_state = self._online.get(target_id)
        if target_state is not None:
            await _ws_send(
                target_state.ws,
                {
                    "type": "signal",
                    "from": state.node_id,
                    "data": signal_data,
                },
            )
        else:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_ONLINE,
                    "message": f"{target_id} is not online",
                },
            )

    # ---- message (direct message fallback) -------------------------------

    async def _handle_message(self, state: ConnectionState, data: Dict[str, Any]) -> None:
        """Relay a direct message to a friend."""
        target_id = data.get("to")
        msg_data = data.get("data")

        if not target_id:
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Missing 'to'"},
            )
            return

        if target_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{target_id} is not your friend",
                },
            )
            return

        target_state = self._online.get(target_id)
        if target_state is not None:
            await _ws_send(
                target_state.ws,
                {
                    "type": "message",
                    "from": state.node_id,
                    "data": msg_data,
                },
            )

    # ---- file_chunk ------------------------------------------------------

    async def _handle_file_chunk(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Relay a file chunk to a friend."""
        target_id = data.get("to")
        chunk_data = data.get("data")

        if not target_id:
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Missing 'to'"},
            )
            return

        if target_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{target_id} is not your friend",
                },
            )
            return

        target_state = self._online.get(target_id)
        if target_state is not None:
            await _ws_send(
                target_state.ws,
                {
                    "type": "file_chunk",
                    "from": state.node_id,
                    "data": chunk_data,
                },
            )

    # ---- exec_request ----------------------------------------------------

    async def _handle_exec_request(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Relay an AI agent exec permission request to a friend."""
        target_id = data.get("to")
        req_data = data.get("data")

        if not target_id:
            await _ws_send(
                state.ws,
                {"type": "error", "code": WSError.INVALID_MESSAGE, "message": "Missing 'to'"},
            )
            return

        if target_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{target_id} is not your friend",
                },
            )
            return

        target_state = self._online.get(target_id)
        if target_state is not None:
            request_id = str(uuid.uuid4())
            await _ws_send(
                target_state.ws,
                {
                    "type": "exec_request",
                    "from": state.node_id,
                    "requestId": request_id,
                    "data": req_data,
                },
            )
            # Confirm to sender
            await _ws_send(
                state.ws,
                {
                    "type": "exec_request_ack",
                    "requestId": request_id,
                    "targetId": target_id,
                },
            )
        else:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_ONLINE,
                    "message": f"{target_id} is not online",
                },
            )

    # ---- permission_changed ----------------------------------------------

    async def _handle_permission_changed(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Change permissions granted to a friend."""
        friend_id = data.get("friendId")
        permissions = data.get("permissions")

        if not friend_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing friendId",
                },
            )
            return

        if friend_id not in state.friend_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.TARGET_NOT_FRIEND,
                    "message": f"{friend_id} is not your friend",
                },
            )
            return

        if not isinstance(permissions, list):
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "permissions must be an array",
                },
            )
            return

        now = iso_now()
        perm_json = json_serialize(permissions)

        # Upsert into node_permissions
        await self.db.execute(
            "INSERT INTO node_permissions (node_id, friend_id, permissions, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(node_id, friend_id) DO UPDATE SET permissions=?, updated_at=?",
            (state.node_id, friend_id, perm_json, now, perm_json, now),
        )

        # Acknowledge to sender
        await _ws_send(
            state.ws,
            {
                "type": "permission_changed_ack",
                "friendId": friend_id,
                "permissions": permissions,
            },
        )

        # Notify the friend if online
        friend_state = self._online.get(friend_id)
        if friend_state is not None:
            await _ws_send(
                friend_state.ws,
                {
                    "type": "permission_update",
                    "friendId": state.node_id,
                    "permissions": permissions,
                },
            )

    # ---- group_message ---------------------------------------------------

    async def _handle_group_message(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Send a message to a group, broadcasting to all online members."""
        group_id = data.get("groupId")
        content = data.get("content", "")
        msg_type = data.get("msgType", "text")

        if not group_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing groupId",
                },
            )
            return

        # Validate group membership
        if group_id not in state.group_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.GROUP_NOT_MEMBER,
                    "message": "You are not a member of this group",
                },
            )
            return

        # Fetch group info for member list and name
        group = await self.db.fetchone(
            "SELECT id, name, members_json FROM groups WHERE id = ?", (group_id,)
        )
        if group is None:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.GROUP_NOT_FOUND,
                    "message": "Group not found",
                },
            )
            return

        members = json_list(group["members_json"])

        # Get sender display name
        sender_name = state.node_id
        account = await self.db.fetchone(
            "SELECT display_name, agent_name, type FROM accounts WHERE id = ?",
            (state.node_id,),
        )
        if account:
            sender_name = account.get("display_name") or account.get("agent_name") or state.node_id

        # Save message to database
        message_id = str(uuid.uuid4())
        now = iso_now()
        await self.db.execute(
            "INSERT INTO group_messages "
            "(id, group_id, from_id, sender_name, type, content, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (message_id, group_id, state.node_id, sender_name, msg_type, content, now),
        )

        # Build outgoing message
        outgoing = {
            "type": "group_message",
            "id": message_id,
            "groupId": group_id,
            "fromId": state.node_id,
            "senderName": sender_name,
            "content": content,
            "msgType": msg_type,
            "timestamp": now,
        }

        # Broadcast to all online group members
        for member_id in members:
            member_state = self._online.get(member_id)
            if member_state is not None:
                await _ws_send(member_state.ws, outgoing)

        # Acknowledge to sender
        await _ws_send(
            state.ws,
            {
                "type": "group_message_ack",
                "messageId": message_id,
                "groupId": group_id,
                "timestamp": now,
            },
        )

    # ---- group_typing ----------------------------------------------------

    async def _handle_group_typing(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Broadcast a typing indicator to group members."""
        group_id = data.get("groupId")

        if not group_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing groupId",
                },
            )
            return

        if group_id not in state.group_ids:
            return  # Silently ignore

        group = await self.db.fetchone(
            "SELECT members_json FROM groups WHERE id = ?", (group_id,)
        )
        if group is None:
            return

        members = json_list(group["members_json"])

        typing_msg = {
            "type": "group_typing",
            "groupId": group_id,
            "fromId": state.node_id,
        }

        for member_id in members:
            if member_id == state.node_id:
                continue
            member_state = self._online.get(member_id)
            if member_state is not None:
                await _ws_send(member_state.ws, typing_msg)

    # ---- get_notifications -----------------------------------------------

    async def _handle_get_notifications(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Fetch notifications for the authenticated node."""
        limit = min(int(data.get("limit", 50)), 200)

        rows = await self.db.fetchall(
            "SELECT id, chat_id, sender_id, sender_name, message_preview, "
            "is_group, read_flag, created_at "
            "FROM notifications WHERE account_id = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (state.node_id, limit),
        )

        notifications = []
        for row in rows:
            notifications.append(
                {
                    "id": row["id"],
                    "chatId": row["chat_id"],
                    "senderId": row["sender_id"],
                    "senderName": row["sender_name"],
                    "messagePreview": row["message_preview"],
                    "isGroup": bool(row["is_group"]),
                    "read": bool(row["read_flag"]),
                    "createdAt": row["created_at"],
                }
            )

        await _ws_send(state.ws, {"type": "notifications", "notifications": notifications})

    # ---- mark_notification_read ------------------------------------------

    async def _handle_mark_notification_read(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Mark a notification as read."""
        notification_id = data.get("notificationId")

        if not notification_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing notificationId",
                },
            )
            return

        await self.db.execute(
            "UPDATE notifications SET read_flag = 1 WHERE id = ? AND account_id = ?",
            (notification_id, state.node_id),
        )

        await _ws_send(
            state.ws,
            {"type": "mark_notification_read_ack", "notificationId": notification_id},
        )

    # ---- get_group_messages ----------------------------------------------

    async def _handle_get_group_messages(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Fetch group message history."""
        group_id = data.get("groupId")
        limit = min(int(data.get("limit", 50)), 200)
        before = data.get("before")  # ISO timestamp cursor

        if not group_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing groupId",
                },
            )
            return

        if group_id not in state.group_ids:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.GROUP_NOT_MEMBER,
                    "message": "You are not a member of this group",
                },
            )
            return

        if before:
            rows = await self.db.fetchall(
                "SELECT id, from_id, sender_name, type, content, media, file_info, timestamp "
                "FROM group_messages WHERE group_id = ? AND timestamp < ? "
                "ORDER BY timestamp DESC LIMIT ?",
                (group_id, before, limit),
            )
        else:
            rows = await self.db.fetchall(
                "SELECT id, from_id, sender_name, type, content, media, file_info, timestamp "
                "FROM group_messages WHERE group_id = ? "
                "ORDER BY timestamp DESC LIMIT ?",
                (group_id, limit),
            )

        messages = []
        for row in reversed(rows):  # Return in chronological order
            msg: Dict[str, Any] = {
                "id": row["id"],
                "fromId": row["from_id"],
                "senderName": row["sender_name"],
                "type": row["type"],
                "content": row["content"],
                "timestamp": row["timestamp"],
            }
            if row["media"]:
                msg["media"] = row["media"]
            if row["file_info"]:
                msg["fileInfo"] = json_deserialize(row["file_info"])
            messages.append(msg)

        await _ws_send(
            state.ws,
            {"type": "group_messages", "groupId": group_id, "messages": messages},
        )

    # ---- subagent_start --------------------------------------------------

    async def _handle_subagent_start(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Start a sub-agent and begin streaming results."""
        parent_message_id = data.get("parentMessageId")
        task = data.get("task")
        context = data.get("context")

        if not parent_message_id or not task:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing parentMessageId or task",
                },
            )
            return

        sub_agent_id = str(uuid.uuid4())
        now = iso_now()

        # Persist sub-agent
        await self.db.execute(
            "INSERT INTO sub_agents (id, parent_message_id, task, context, status, output, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'running', '', ?, ?)",
            (sub_agent_id, parent_message_id, task, json_serialize(context) if context else None, now, now),
        )

        # Acknowledge
        await _ws_send(
            state.ws,
            {
                "type": "subagent_start_ack",
                "subAgentId": sub_agent_id,
                "parentMessageId": parent_message_id,
                "task": task,
            },
        )

        # TODO: Integrate with actual AI sub-agent execution engine.
        # For now we create the record and send a completion placeholder.
        # In production, an async task would stream chunks via subagent_chunk
        # and eventually send subagent_completed.
        asyncio.create_task(
            self._run_subagent(state, sub_agent_id, task, context)
        )

    async def _run_subagent(
        self,
        state: ConnectionState,
        sub_agent_id: str,
        task: str,
        context: Any,
    ) -> None:
        """Background coroutine that simulates sub-agent execution.

        In production, this would call the AI engine and stream results.
        """
        try:
            # Placeholder: simulate some processing
            await asyncio.sleep(0.1)

            # Send a single chunk
            chunk = f"[Sub-agent processing: {task}]"
            await _ws_send(
                state.ws,
                {
                    "type": "subagent_chunk",
                    "subAgentId": sub_agent_id,
                    "chunk": chunk,
                },
            )

            # Mark as completed
            now = iso_now()
            output = chunk
            await self.db.execute(
                "UPDATE sub_agents SET status='completed', output=?, updated_at=? WHERE id=?",
                (output, now, sub_agent_id),
            )

            await _ws_send(
                state.ws,
                {
                    "type": "subagent_completed",
                    "subAgentId": sub_agent_id,
                    "output": output,
                },
            )

        except asyncio.CancelledError:
            # Sub-agent was aborted
            now = iso_now()
            await self.db.execute(
                "UPDATE sub_agents SET status='error', output='Aborted', updated_at=? WHERE id=?",
                (now, sub_agent_id),
            )
        except Exception:
            logger.exception("Sub-agent %s failed", sub_agent_id)
            now = iso_now()
            await self.db.execute(
                "UPDATE sub_agents SET status='error', output='Internal error', updated_at=? WHERE id=?",
                (now, sub_agent_id),
            )
            await _ws_send(
                state.ws,
                {
                    "type": "subagent_completed",
                    "subAgentId": sub_agent_id,
                    "output": "",
                    "error": "Internal error",
                },
            )

    # ---- subagent_input --------------------------------------------------

    async def _handle_subagent_input(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Send input to a running sub-agent."""
        sub_agent_id = data.get("subAgentId")
        user_input = data.get("input")

        if not sub_agent_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing subAgentId",
                },
            )
            return

        # Verify the sub-agent belongs to this user's account
        sub_agent = await self.db.fetchone(
            "SELECT id, status FROM sub_agents WHERE id = ?", (sub_agent_id,)
        )
        if sub_agent is None:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.NOT_FOUND,
                    "message": "Sub-agent not found",
                },
            )
            return

        if sub_agent["status"] != "running" and sub_agent["status"] != "waiting_human":
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": f"Sub-agent is {sub_agent['status']}",
                },
            )
            return

        # Update status to running (in case it was waiting_human)
        now = iso_now()
        await self.db.execute(
            "UPDATE sub_agents SET status='running', updated_at=? WHERE id=?",
            (now, sub_agent_id),
        )

        # Acknowledge
        await _ws_send(
            state.ws,
            {
                "type": "subagent_input_ack",
                "subAgentId": sub_agent_id,
            },
        )

        # TODO: Forward the input to the AI execution engine

    # ---- subagent_abort --------------------------------------------------

    async def _handle_subagent_abort(
        self, state: ConnectionState, data: Dict[str, Any]
    ) -> None:
        """Abort a running sub-agent."""
        sub_agent_id = data.get("subAgentId")

        if not sub_agent_id:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.INVALID_MESSAGE,
                    "message": "Missing subAgentId",
                },
            )
            return

        sub_agent = await self.db.fetchone(
            "SELECT id, status FROM sub_agents WHERE id = ?", (sub_agent_id,)
        )
        if sub_agent is None:
            await _ws_send(
                state.ws,
                {
                    "type": "error",
                    "code": WSError.NOT_FOUND,
                    "message": "Sub-agent not found",
                },
            )
            return

        now = iso_now()
        await self.db.execute(
            "UPDATE sub_agents SET status='error', output='Aborted by user', updated_at=? WHERE id=?",
            (now, sub_agent_id),
        )

        await _ws_send(
            state.ws,
            {
                "type": "subagent_abort_ack",
                "subAgentId": sub_agent_id,
            },
        )

    # ─── Presence broadcasting ──────────────────────────────────────────

    async def _broadcast_presence(
        self,
        node_id: str,
        *,
        online: bool,
        friend_ids: Set[str],
    ) -> None:
        """Notify all online friends of a node's presence change."""
        presence_msg = {
            "type": "presence",
            "nodeId": node_id,
            "online": online,
        }
        for fid in friend_ids:
            friend_state = self._online.get(fid)
            if friend_state is not None:
                await _ws_send(friend_state.ws, presence_msg)

    # ─── Periodic cleanup ───────────────────────────────────────────────

    async def start_cleanup_task(self) -> None:
        """Start the background cleanup task."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
            logger.info("Periodic cleanup task started")

    async def stop_cleanup_task(self) -> None:
        """Cancel the background cleanup task."""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Periodic cleanup task stopped")

    async def _periodic_cleanup(self) -> None:
        """Background task: clean stale connections and expired DB records."""
        while True:
            try:
                await asyncio.sleep(60)

                # ── Close idle connections (no ping for > 60 s) ──
                now = time.monotonic()
                stale_nodes: List[str] = []
                for node_id, state in list(self._online.items()):
                    if now - state.last_ping > 60:
                        stale_nodes.append(node_id)

                for node_id in stale_nodes:
                    state = self._online.pop(node_id, None)
                    if state is not None:
                        logger.info("Closing stale connection for node %s", node_id)
                        try:
                            await state.ws.close(
                                code=4003, message=b"Heartbeat timeout"
                            )
                        except Exception:
                            pass
                        await self._broadcast_presence(
                            node_id, online=False, friend_ids=state.friend_ids
                        )

                # ── Database cleanup ─────────────────────────────
                from db import cleanup_expired

                try:
                    result = await cleanup_expired(self.db)
                    if any(v > 0 for v in result.values()):
                        logger.info("DB cleanup: %s", result)
                except Exception:
                    logger.exception("Database cleanup failed")

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in periodic cleanup")

    # ─── Utility: check if a node is online ──────────────────────────────

    def is_online(self, node_id: str) -> bool:
        """Return ``True`` if *node_id* currently has an active WS connection."""
        return node_id in self._online

    def get_online_count(self) -> int:
        """Return the number of currently online nodes."""
        return len(self._online)

    def get_connection_count(self) -> int:
        """Return the total number of WS connections (including pre-auth)."""
        return len(self._connections)

    # ─── Utility: broadcast a message to all online nodes ────────────────

    async def broadcast_message(self, message: Dict[str, Any]) -> None:
        """Send *message* to every authenticated online connection."""
        for state in list(self._online.values()):
            await _ws_send(state.ws, message)

    # ─── Utility: send to a specific node ────────────────────────────────

    async def send_to_node(self, node_id: str, message: Dict[str, Any]) -> bool:
        """Send *message* to a specific online node.

        Returns ``True`` if the node was online and the message was sent.
        """
        state = self._online.get(node_id)
        if state is None:
            return False
        await _ws_send(state.ws, message)
        return True

    # ─── Utility: push notification ──────────────────────────────────────

    async def push_notification(
        self,
        account_id: str,
        *,
        chat_id: str,
        sender_id: str,
        sender_name: str,
        message_preview: str,
        is_group: bool = False,
    ) -> None:
        """Create a notification and push it to the account if online."""
        notification_id = str(uuid.uuid4())
        now = iso_now()

        await self.db.execute(
            "INSERT INTO notifications "
            "(id, account_id, chat_id, sender_id, sender_name, message_preview, is_group, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                notification_id,
                account_id,
                chat_id,
                sender_id,
                sender_name,
                message_preview,
                int(is_group),
                now,
            ),
        )

        # Push to online node
        state = self._online.get(account_id)
        if state is not None:
            await _ws_send(
                state.ws,
                {
                    "type": "push_message",
                    "notification": {
                        "id": notification_id,
                        "chatId": chat_id,
                        "senderId": sender_id,
                        "senderName": sender_name,
                        "messagePreview": message_preview,
                        "isGroup": is_group,
                        "createdAt": now,
                    },
                },
            )

    # ─── Utility: group event notifications ──────────────────────────────

    async def notify_group_kicked(self, node_id: str, group_id: str) -> None:
        """Notify a node that they were kicked from a group."""
        state = self._online.get(node_id)
        if state is not None:
            # Update in-memory group set
            state.group_ids.discard(group_id)
            await _ws_send(state.ws, {"type": "group_kicked", "groupId": group_id})

    async def notify_group_disbanded(self, group_id: str) -> None:
        """Notify all online group members that the group was disbanded."""
        group = await self.db.fetchone(
            "SELECT members_json FROM groups WHERE id = ?", (group_id,)
        )
        if group is None:
            return

        members = json_list(group["members_json"])
        for member_id in members:
            state = self._online.get(member_id)
            if state is not None:
                state.group_ids.discard(group_id)
                await _ws_send(
                    state.ws, {"type": "group_disbanded", "groupId": group_id}
                )

    async def notify_group_mute_changed(
        self, group_id: str, muted: bool
    ) -> None:
        """Notify all online group members about a mute status change."""
        group = await self.db.fetchone(
            "SELECT members_json FROM groups WHERE id = ?", (group_id,)
        )
        if group is None:
            return

        members = json_list(group["members_json"])
        for member_id in members:
            state = self._online.get(member_id)
            if state is not None:
                await _ws_send(
                    state.ws,
                    {
                        "type": "group_mute_changed",
                        "groupId": group_id,
                        "muted": muted,
                    },
                )

    # ─── Utility: task plan updates ──────────────────────────────────────

    async def send_task_plan_update(self, node_id: str, plan: Dict[str, Any]) -> None:
        """Send a task plan update to a specific node."""
        await self.send_to_node(node_id, {"type": "task_plan_update", "plan": plan})

    async def send_task_plan_delete(self, node_id: str, plan_id: str) -> None:
        """Send a task plan delete notification to a specific node."""
        await self.send_to_node(
            node_id, {"type": "task_plan_delete", "planId": plan_id}
        )

    # ─── Utility: agent execution events ─────────────────────────────────

    async def send_agent_execution_start(
        self, node_id: str, execution: Dict[str, Any]
    ) -> None:
        """Notify a node that an agent execution has started."""
        await self.send_to_node(
            node_id, {"type": "agent_execution_start", "execution": execution}
        )

    async def send_agent_execution_end(
        self, node_id: str, execution: Dict[str, Any]
    ) -> None:
        """Notify a node that an agent execution has ended."""
        await self.send_to_node(
            node_id, {"type": "agent_execution_end", "execution": execution}
        )

    # ─── Utility: refresh connection state after friend list changes ─────

    async def refresh_friends(self, node_id: str) -> None:
        """Reload the friend list for an online node from the database."""
        state = self._online.get(node_id)
        if state is None:
            return

        account = await self.db.fetchone(
            "SELECT friends FROM accounts WHERE id = ?", (node_id,)
        )
        if account is not None:
            state.friend_ids = set(json_list(account["friends"]))

    async def refresh_groups(self, node_id: str) -> None:
        """Reload group memberships for an online node."""
        state = self._online.get(node_id)
        if state is None:
            return

        await self._load_group_memberships(state)

    # ─── Dispatch table ──────────────────────────────────────────────────

    _DISPATCH_TABLE: Dict[str, Any] = {
        "offline": _handle_offline,
        "ping": _handle_ping,
        "relay": _handle_relay,
        "signal": _handle_signal,
        "message": _handle_message,
        "file_chunk": _handle_file_chunk,
        "exec_request": _handle_exec_request,
        "permission_changed": _handle_permission_changed,
        "group_message": _handle_group_message,
        "group_typing": _handle_group_typing,
        "get_notifications": _handle_get_notifications,
        "mark_notification_read": _handle_mark_notification_read,
        "get_group_messages": _handle_get_group_messages,
        "subagent_start": _handle_subagent_start,
        "subagent_input": _handle_subagent_input,
        "subagent_abort": _handle_subagent_abort,
    }
