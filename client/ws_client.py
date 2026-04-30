"""
AICQ WebSocket Client
=======================
Async WebSocket client for real-time communication with the AICQ server.

Features:
- Auto-reconnect with exponential backoff (1 s → 30 s)
- Heartbeat ping every 30 seconds
- Typed message routing (signal, message, file_chunk, typing, presence, etc.)
- Pending request resolution (waitForResponse pattern)
- Event callbacks for all message types
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Callable, Coroutine, Dict, List, Optional

import aiohttp

logger = logging.getLogger("aicq.client.ws")


# ─── Type Aliases ───────────────────────────────────────────────────────

EventHandler = Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]


class WSClient:
    """Async WebSocket client for the AICQ server.

    Parameters
    ----------
    ws_url : str
        WebSocket endpoint URL (e.g. ``wss://aicq.online/ws``).
    node_id : str
        This node's unique ID for authentication.
    access_token : str
        JWT access token for WebSocket authentication.

    Usage::

        ws = WSClient("wss://aicq.online/ws", "my-node-id", "eyJ...")
        ws.on("message", handle_message)
        await ws.connect()
        await ws.send("relay", {"targetId": "...", "payload": {...}})
        await ws.disconnect()
    """

    def __init__(self, ws_url: str, node_id: str, access_token: str) -> None:
        self.ws_url = ws_url
        self.node_id = node_id
        self._access_token = access_token

        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._connected = False
        self._authenticated = False

        # Reconnection
        self._reconnect_task: Optional[asyncio.Task] = None
        self._backoff = 1.0  # seconds
        self._max_backoff = 30.0
        self._should_reconnect = False

        # Heartbeat
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._heartbeat_interval = 30.0  # seconds

        # Event handlers: event_type → list of callbacks
        self._handlers: Dict[str, List[EventHandler]] = {}

        # Pending requests: request_id → asyncio.Future
        self._pending_requests: Dict[str, asyncio.Future] = {}

        # Receive loop task
        self._recv_task: Optional[asyncio.Task] = None

    # ── Properties ───────────────────────────────────────────────────────

    @property
    def connected(self) -> bool:
        """Whether the WebSocket is connected and authenticated."""
        return self._connected and self._authenticated

    # ── Event Registration ───────────────────────────────────────────────

    def on(self, event_type: str, handler: EventHandler) -> None:
        """Register a callback for a specific event type.

        Parameters
        ----------
        event_type : str
            The message ``type`` field (e.g. ``"message"``, ``"signal"``).
        handler : coroutine function
            ``async def handler(data: dict) -> None``
        """
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def off(self, event_type: str, handler: EventHandler) -> None:
        """Remove a previously registered callback."""
        if event_type in self._handlers:
            self._handlers[event_type] = [
                h for h in self._handlers[event_type] if h is not handler
            ]

    async def _emit(self, event_type: str, data: Dict[str, Any]) -> None:
        """Invoke all handlers for *event_type*."""
        handlers = self._handlers.get(event_type, [])
        for handler in handlers:
            try:
                await handler(data)
            except Exception:
                logger.exception("Error in handler for event '%s'", event_type)

    # ── Connection ───────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Connect to the WebSocket server and authenticate.

        Sends an ``online`` message with the node ID and token.
        On success, starts the heartbeat and receive loops.
        """
        if self._connected:
            return

        self._should_reconnect = True
        try:
            await self._do_connect()
        except Exception:
            logger.exception("Initial WebSocket connection failed")
            self._schedule_reconnect()

    async def _do_connect(self) -> None:
        """Perform the actual connection and auth handshake."""
        self._session = aiohttp.ClientSession()
        try:
            self._ws = await self._session.ws_connect(
                self.ws_url,
                max_msg_size=262_144,
                heartbeat=None,  # we manage our own
            )
            logger.info("WebSocket connected to %s", self.ws_url)

            # Send online (auth) message
            auth_msg = {
                "type": "online",
                "nodeId": self.node_id,
                "token": self._access_token,
            }
            await self._ws.send_json(auth_msg)

            # Wait for online_ack
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    if data.get("type") == "online_ack":
                        self._connected = True
                        self._authenticated = True
                        self._backoff = 1.0
                        logger.info("WebSocket authenticated as %s", self.node_id)
                        break
                    elif data.get("type") == "error":
                        error_msg = data.get("message", "Authentication failed")
                        logger.error("WebSocket auth error: %s", error_msg)
                        raise ConnectionError(error_msg)
                elif msg.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSING,
                    aiohttp.WSMsgType.CLOSED,
                ):
                    raise ConnectionError("WebSocket closed during auth")
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    raise ConnectionError(f"WebSocket error during auth: {self._ws.exception()}")

            # Start heartbeat and receive loops
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            self._recv_task = asyncio.create_task(self._recv_loop())

            # Notify
            await self._emit("connected", {"nodeId": self.node_id})

        except Exception:
            if self._session and not self._session.closed:
                await self._session.close()
                self._session = None
            raise

    async def disconnect(self) -> None:
        """Disconnect from the WebSocket server.

        Sends an ``offline`` message and stops all background tasks.
        """
        self._should_reconnect = False
        await self._cleanup()

    async def _cleanup(self) -> None:
        """Stop all background tasks and close the connection."""
        # Cancel heartbeat
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # Cancel receive loop
        if self._recv_task and not self._recv_task.done():
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass

        # Cancel reconnect
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass

        # Close WebSocket
        if self._ws and not self._ws.closed:
            try:
                await self._ws.send_json({"type": "offline"})
            except Exception:
                pass
            try:
                await self._ws.close()
            except Exception:
                pass

        # Close session
        if self._session and not self._session.closed:
            await self._session.close()

        self._ws = None
        self._session = None
        self._connected = False
        self._authenticated = False

        # Fail pending requests
        for fut in self._pending_requests.values():
            if not fut.done():
                fut.set_exception(ConnectionError("WebSocket disconnected"))
        self._pending_requests.clear()

        await self._emit("disconnected", {})

    # ── Reconnection ─────────────────────────────────────────────────────

    def _schedule_reconnect(self) -> None:
        """Schedule a reconnection attempt after the current backoff."""
        if not self._should_reconnect:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return

        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        """Attempt reconnection with exponential backoff."""
        while self._should_reconnect:
            logger.info("Reconnecting in %.1f seconds...", self._backoff)
            await asyncio.sleep(self._backoff)

            try:
                await self._do_connect()
                return  # Success
            except Exception:
                logger.exception("Reconnection attempt failed")
                self._backoff = min(self._backoff * 2, self._max_backoff)

    # ── Heartbeat ────────────────────────────────────────────────────────

    async def _heartbeat_loop(self) -> None:
        """Send periodic ping messages to keep the connection alive."""
        try:
            while self._connected:
                await asyncio.sleep(self._heartbeat_interval)
                if self._ws and not self._ws.closed:
                    await self._ws.send_json({"type": "ping"})
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Heartbeat error")
            self._schedule_reconnect()

    # ── Receive Loop ─────────────────────────────────────────────────────

    async def _recv_loop(self) -> None:
        """Main message receive loop."""
        try:
            if self._ws is None:
                return
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        await self._route_message(data)
                    except json.JSONDecodeError:
                        logger.warning("Received non-JSON message")
                elif msg.type == aiohttp.WSMsgType.PONG:
                    pass  # pong received
                elif msg.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSING,
                    aiohttp.WSMsgType.CLOSED,
                ):
                    logger.info("WebSocket closed by server")
                    break
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error("WebSocket error: %s", self._ws.exception() if self._ws else "")
                    break
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Error in receive loop")
        finally:
            self._connected = False
            self._authenticated = False
            self._schedule_reconnect()

    # ── Message Routing ──────────────────────────────────────────────────

    async def _route_message(self, data: Dict[str, Any]) -> None:
        """Route a received message to the appropriate handler."""
        msg_type = data.get("type", "")

        # Resolve pending requests for request/response patterns
        request_id = data.get("requestId") or data.get("request_id")
        if request_id and request_id in self._pending_requests:
            fut = self._pending_requests.pop(request_id)
            if not fut.done():
                fut.set_result(data)
            return

        # Type-specific handling
        type_map = {
            "pong": None,  # heartbeat response, ignore
            "online_ack": None,
            "error": "error",
            "relay": "relay",
            "message": "message",
            "signal": "signal",
            "file_chunk": "file_chunk",
            "exec_request": "exec_request",
            "exec_request_ack": "exec_request_ack",
            "permission_update": "permission_update",
            "permission_changed_ack": "permission_changed_ack",
            "typing": "typing",
            "presence": "presence",
            "handshake_request": "handshake_request",
            "handshake_response": "handshake_response",
            "handshake_confirm": "handshake_confirm",
            "broadcast": "broadcast",
            "group_message": "group_message",
            "group_message_ack": "group_message_ack",
            "group_typing": "group_typing",
            "notifications": "notifications",
        }

        event_name = type_map.get(msg_type)
        if event_name is None:
            return  # Ignore internal messages

        await self._emit(event_name, data)
        # Also emit a wildcard "any" event
        await self._emit("any", data)

    # ── Send ─────────────────────────────────────────────────────────────

    async def send(self, msg_type: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """Send a typed message over the WebSocket.

        Parameters
        ----------
        msg_type : str
            The message ``type`` field.
        data : dict, optional
            Additional message fields.

        Returns
        -------
        bool
            ``True`` if the message was sent, ``False`` if not connected.
        """
        if not self._ws or self._ws.closed or not self._connected:
            logger.warning("Cannot send: WebSocket not connected")
            return False

        payload = {"type": msg_type}
        if data:
            payload.update(data)

        try:
            await self._ws.send_json(payload)
            return True
        except Exception:
            logger.exception("Error sending WebSocket message")
            return False

    async def send_and_wait(
        self,
        msg_type: str,
        data: Optional[Dict[str, Any]] = None,
        timeout: float = 10.0,
    ) -> Optional[Dict[str, Any]]:
        """Send a message and wait for a response with a matching request ID.

        Parameters
        ----------
        msg_type : str
            The message ``type`` field.
        data : dict, optional
            Additional message fields.
        timeout : float
            Maximum seconds to wait for a response.

        Returns
        -------
        dict or None
            The response data, or ``None`` on timeout.
        """
        request_id = str(uuid.uuid4())
        payload = {"type": msg_type, "requestId": request_id}
        if data:
            payload.update(data)

        loop = asyncio.get_event_loop()
        fut = loop.create_future()
        self._pending_requests[request_id] = fut

        try:
            if not self._ws or self._ws.closed:
                return None
            await self._ws.send_json(payload)
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(request_id, None)
            logger.warning("Request %s timed out", request_id)
            return None
        except Exception:
            self._pending_requests.pop(request_id, None)
            logger.exception("Error in send_and_wait")
            return None

    # ── Convenience Methods ──────────────────────────────────────────────

    async def send_relay(self, target_id: str, payload: Dict[str, Any]) -> bool:
        """Send an E2EE relay message to a friend."""
        return await self.send("relay", {"targetId": target_id, "payload": payload})

    async def send_signal(self, to: str, signal_data: Dict[str, Any]) -> bool:
        """Send a WebRTC signaling message."""
        return await self.send("signal", {"to": to, "data": signal_data})

    async def send_message(self, to: str, msg_data: Dict[str, Any]) -> bool:
        """Send a direct message to a friend."""
        return await self.send("message", {"to": to, "data": msg_data})

    async def send_file_chunk(self, to: str, chunk_data: Dict[str, Any]) -> bool:
        """Send a file chunk to a friend."""
        return await self.send("file_chunk", {"to": to, "data": chunk_data})

    async def send_typing(self, to: str) -> bool:
        """Send a typing indicator to a friend."""
        return await self.send("typing", {"to": to})

    # ── Destroy ──────────────────────────────────────────────────────────

    async def destroy(self) -> None:
        """Fully tear down the WebSocket client."""
        await self.disconnect()
        self._handlers.clear()
        self._pending_requests.clear()
