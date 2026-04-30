"""
Peer-to-peer connection manager.

Uses WebSocket relay with session-key-encrypted data channels through
the server, providing a similar security model to WebRTC DataChannels.
Encryption is handled at the ChatManager message level; this layer
provides transport pass-through.
"""

from __future__ import annotations

from typing import Optional, Callable
from dataclasses import dataclass, field

from .ws_client import WSClient
from .db import ClientDatabase


@dataclass
class P2PPeerConnection:
    """State for a single P2P peer connection."""
    peer_id: str
    connected: bool = False
    connection_callbacks: list[Callable[[bool], None]] = field(default_factory=list)
    data_callbacks: list[Callable[[bytes], None]] = field(default_factory=list)


class P2PClient:
    """P2P connection manager via WebSocket relay.

    Provides connect/disconnect/send operations and per-peer and global
    data callbacks for routing decrypted data to the ChatManager.
    """

    def __init__(self, ws: WSClient, db: ClientDatabase):
        self._ws = ws
        self._db = db
        self._connections: dict[str, P2PPeerConnection] = {}
        self._any_data_cb: Optional[Callable[[str, bytes], None]] = None

        self._ws.on("signal", self._on_signal)

    # ──────────────── Global data callback ────────────────

    def on_any_data(self, callback: Callable[[str, bytes], None]) -> None:
        self._any_data_cb = callback

    # ──────────────── WebSocket signal handler ────────────────

    async def _on_signal(self, msg: dict) -> None:
        data = msg.get("data", {})
        signal_type = data.get("type", "")
        from_id = msg.get("from", "")

        if signal_type == "p2p_data":
            await self._handle_incoming_data(from_id, data)
        elif signal_type == "p2p_open":
            await self._handle_connection_open(from_id)
        elif signal_type == "p2p_close":
            self._handle_connection_close(from_id)

    # ──────────────── Connect ────────────────

    async def connect(self, peer_id: str) -> None:
        """Initiate a P2P connection to a peer via WebSocket relay."""
        conn = self._connections.get(peer_id)
        if conn and conn.connected:
            return

        session_key = await self._db.get_session_key(peer_id)
        if not session_key:
            print(f"[P2P] Cannot connect to {peer_id}: no session key")
            return

        conn = P2PPeerConnection(peer_id=peer_id)
        self._connections[peer_id] = conn

        user_id = ""
        identity = await self._db.load_identity()
        if identity:
            user_id = identity["user_id"]

        self._ws.send("signal", {
            "to": peer_id,
            "data": {
                "type": "p2p_open",
                "fromId": user_id,
                "nonce": int(asyncio.get_event_loop().time() * 1000),
            },
        })
        print(f"[P2P] Connection initiated to {peer_id}")

    # ──────────────── Disconnect ────────────────

    def disconnect(self, peer_id: str) -> None:
        conn = self._connections.get(peer_id)
        if not conn:
            return

        conn.connected = False

        identity_data = None
        import asyncio
        try:
            identity_data = asyncio.get_event_loop().run_until_complete(self._db.load_identity())
        except Exception:
            pass

        user_id = identity_data["user_id"] if identity_data else ""
        self._ws.send("signal", {
            "to": peer_id,
            "data": {"type": "p2p_close", "fromId": user_id},
        })

        for cb in conn.connection_callbacks:
            try:
                cb(False)
            except Exception:
                pass

        self._connections.pop(peer_id, None)
        print(f"[P2P] Disconnected from {peer_id}")

    # ──────────────── Send ────────────────

    def send(self, peer_id: str, data: bytes) -> bool:
        """Send data to a peer.

        Returns True if sent successfully, False if not connected.
        """
        conn = self._connections.get(peer_id)
        if not conn or not conn.connected:
            return False

        import base64
        self._ws.send("signal", {
            "to": peer_id,
            "data": {
                "type": "p2p_data",
                "payload": base64.b64encode(data).decode("ascii"),
            },
        })
        return True

    # ──────────────── Status ────────────────

    def is_connected(self, peer_id: str) -> bool:
        conn = self._connections.get(peer_id)
        return conn is not None and conn.connected

    # ──────────────── Callbacks ────────────────

    def on_connection_change(self, peer_id: str, callback: Callable[[bool], None]) -> None:
        conn = self._connections.get(peer_id)
        if not conn:
            conn = P2PPeerConnection(peer_id=peer_id)
            self._connections[peer_id] = conn
        conn.connection_callbacks.append(callback)

    def on_data(self, peer_id: str, callback: Callable[[bytes], None]) -> None:
        conn = self._connections.get(peer_id)
        if not conn:
            conn = P2PPeerConnection(peer_id=peer_id)
            self._connections[peer_id] = conn
        conn.data_callbacks.append(callback)

    # ──────────────── Internal handlers ────────────────

    async def _handle_connection_open(self, from_id: str) -> None:
        session_key = await self._db.get_session_key(from_id)
        if not session_key:
            print(f"[P2P] Incoming connection from {from_id} but no session key")
            return

        conn = self._connections.get(from_id)
        if not conn:
            conn = P2PPeerConnection(peer_id=from_id)
            self._connections[from_id] = conn

        conn.connected = True
        for cb in conn.connection_callbacks:
            try:
                cb(True)
            except Exception:
                pass
        print(f"[P2P] Connected to {from_id}")

    def _handle_connection_close(self, from_id: str) -> None:
        conn = self._connections.get(from_id)
        if not conn:
            return

        conn.connected = False
        for cb in conn.connection_callbacks:
            try:
                cb(False)
            except Exception:
                pass
        self._connections.pop(from_id, None)
        print(f"[P2P] Peer {from_id} disconnected")

    async def _handle_incoming_data(self, from_id: str, data: dict) -> None:
        conn = self._connections.get(from_id)
        if not conn:
            print(f"[P2P] Data from {from_id} but no active connection")
            return

        import base64
        payload = data.get("payload", "")
        try:
            raw = base64.b64decode(payload)
        except Exception:
            return

        for cb in conn.data_callbacks:
            try:
                cb(raw)
            except Exception as exc:
                print(f"[P2P] Data callback error for {from_id}: {exc}")

        if self._any_data_cb:
            try:
                self._any_data_cb(from_id, raw)
            except Exception as exc:
                print(f"[P2P] Global callback error: {exc}")

    # ──────────────── Cleanup ────────────────

    def destroy(self) -> None:
        for peer_id in list(self._connections.keys()):
            self.disconnect(peer_id)
        self._connections.clear()
        self._any_data_cb = None


# Required import for connect() nonce
import asyncio
