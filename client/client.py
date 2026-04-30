"""
AICQ Client — Main entry point.

``AICQClient`` is the top-level facade that wires together all sub-modules:
identity, store, API, WebSocket, handshake, chat, P2P, file transfer,
temp number management, and friend management.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Optional, Callable, Any

from .config import ClientConfig, load_config
from .db import ClientDatabase
from .api_client import APIClient
from .ws_client import WSClient
from .identity_manager import IdentityManager
from .handshake_handler import HandshakeHandler
from .p2p_client import P2PClient
from .chat_manager import ChatManager
from .file_manager import FileManager
from .temp_number_manager import TempNumberManager
from .friend_manager import FriendManager

from .types import (
    ChatMessage,
    FriendInfo,
    HandshakeProgress,
    FileTransferInfo,
)


class AICQClient:
    """AICQ encrypted chat client.

    Wires together all sub-modules and provides a high-level API for
    sending messages, managing friends, and handling file transfers.

    Usage::

        client = AICQClient()
        await client.initialize()
        # ... use client.chat, client.friends, etc.
        await client.destroy()
    """

    def __init__(self, config_overrides: Optional[dict] = None):
        self._config = load_config(config_overrides)
        self._db = ClientDatabase(self._config.data_dir)
        self._api = APIClient(self._config.server_url)
        self._ws = WSClient(self._config.ws_url)
        self._identity = IdentityManager(self._db)
        self._handshake = HandshakeHandler(self._api, self._ws, self._identity, self._db)
        self._p2p = P2PClient(self._ws, self._db)
        self._chat = ChatManager(self._db, self._p2p, self._ws, self._identity)
        self._files = FileManager(self._api, self._ws, self._db, self._p2p)
        self._temp_numbers = TempNumberManager(self._api, self._db)
        self._friends = FriendManager(self._api, self._ws, self._handshake, self._db, self._p2p)

        self._initialized = False
        self._destroyed = False

        self._wire_events()

    # ──────────────── Initialise ────────────────

    async def initialize(self) -> None:
        """Initialise the client.

        1. Ensure data directory exists
        2. Open SQLite database
        3. Load or generate identity keys
        4. Register with the server
        5. Connect WebSocket
        """
        if self._initialized:
            return

        # 1. Ensure data directory
        os.makedirs(self._config.data_dir, exist_ok=True)

        # 2. Open database
        await self._db.open()

        # 3. Load or generate identity
        user_id = str(uuid.uuid4())
        stored = await self._db.load_identity()
        if stored and stored.get("user_id"):
            user_id = stored["user_id"]

        await self._identity.initialize(user_id)

        # 4. Register with server
        try:
            await self._api.register(user_id, self._identity.get_public_key())
        except Exception as exc:
            print(f"[AICQClient] Server registration failed: {exc}")

        # 5. Set node ID and connect WebSocket
        self._api.set_node_id(user_id)
        await self._ws.connect(user_id)

        self._initialized = True
        print(f"[AICQClient] Initialised as {user_id[:8]}... "
              f"(fingerprint: {self._identity.get_public_key_fingerprint()})")

    # ──────────────── Wire events ────────────────

    def _wire_events(self) -> None:
        # Chat messages -> client event
        self._chat.on_message(lambda msg: self._emit("message", msg))

        # Presence changes
        self._ws.on("presence", self._on_presence)

        # Handshake progress
        self._handshake.on_progress(lambda p: self._emit("handshake_progress", p))

        # File transfer progress
        self._files.on_progress(lambda i: self._emit("file_progress", i))

        # WebSocket connection events
        self._ws.on("connected", lambda: self._emit("connected", None))
        self._ws.on("disconnected", lambda: self._emit("disconnected", None))

    async def _on_presence(self, event: dict) -> None:
        online = event.get("online", False)
        if online:
            self._emit("friend_online", event)
        else:
            self._emit("friend_offline", event)

    # ──────────────── Simple event emitter ────────────────

    _event_handlers: dict[str, list[Callable]] = {}

    def on(self, event: str, handler: Callable) -> None:
        if not hasattr(self, "_event_handlers"):
            self._event_handlers = {}
        self._event_handlers.setdefault(event, []).append(handler)

    def _emit(self, event: str, data: Any = None) -> None:
        for handler in self._event_handlers.get(event, []):
            try:
                handler(data)
            except Exception:
                pass

    # ──────────────── Public accessors ────────────────

    @property
    def chat(self) -> ChatManager:
        self._ensure_initialized()
        return self._chat

    @property
    def friends(self) -> FriendManager:
        self._ensure_initialized()
        return self._friends

    @property
    def temp_numbers(self) -> TempNumberManager:
        self._ensure_initialized()
        return self._temp_numbers

    @property
    def identity_mgr(self) -> IdentityManager:
        self._ensure_initialized()
        return self._identity

    @property
    def files(self) -> FileManager:
        self._ensure_initialized()
        return self._files

    @property
    def p2p_conn(self) -> P2PClient:
        self._ensure_initialized()
        return self._p2p

    @property
    def handshake_handler(self) -> HandshakeHandler:
        self._ensure_initialized()
        return self._handshake

    # ──────────────── Convenience ────────────────

    async def get_user_id(self) -> str:
        return await self._identity.get_user_id()

    def get_fingerprint(self) -> str:
        return self._identity.get_public_key_fingerprint()

    # ──────────────── Lifecycle ────────────────

    async def destroy(self) -> None:
        """Tear down all connections and save state."""
        if self._destroyed:
            return
        self._destroyed = True

        print("[AICQClient] Shutting down...")

        self._chat.destroy()
        self._files.destroy()
        self._p2p.destroy()
        self._handshake.destroy()
        self._friends.destroy()
        await self._ws.disconnect()

        await self._db.close()

        self._initialized = False
        print("[AICQClient] Shutdown complete")

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            raise RuntimeError("AICQClient has not been initialized. Call initialize() first.")


# ──────────────── CLI Entry Point ────────────────

async def _cli_main() -> None:
    """Simple interactive CLI for testing the AICQ client."""
    client = AICQClient()

    client.on("message", lambda msg: print(f"\n[MSG] {msg.from_id[:8]}: {msg.content}"))
    client.on("friend_online", lambda e: print(f"\n[ONLINE] {e.get('nodeId', '')[:8]}..."))
    client.on("friend_offline", lambda e: print(f"\n[OFFLINE] {e.get('nodeId', '')[:8]}..."))

    await client.initialize()

    print(f"\nAICQ Client CLI — User: {await client.get_user_id()}")
    print(f"Fingerprint: {client.get_fingerprint()}")
    print("\nCommands: friends, add <temp>, chat <id> <msg>, temp, quit")

    try:
        while True:
            try:
                line = await asyncio.get_event_loop().run_in_executor(None, input, "aicq> ")
            except EOFError:
                break

            parts = line.strip().split(maxsplit=2)
            if not parts:
                continue

            cmd = parts[0].lower()

            if cmd == "quit":
                break
            elif cmd == "friends":
                friends = await client.friends.get_friends()
                if not friends:
                    print("No friends yet.")
                for f in friends:
                    status = "online" if f.is_online else "offline"
                    print(f"  {f.id[:8]}... [{status}] {f.fingerprint}")
            elif cmd == "add" and len(parts) >= 2:
                try:
                    friend = await client.friends.add_friend(parts[1])
                    print(f"Friend added: {friend.id[:8]}...")
                except Exception as exc:
                    print(f"Error: {exc}")
            elif cmd == "chat" and len(parts) >= 3:
                try:
                    msg = await client.chat.send_message(parts[1], parts[2])
                    print(f"Sent: {msg.status.value}")
                except Exception as exc:
                    print(f"Error: {exc}")
            elif cmd == "temp":
                try:
                    number = await client.temp_numbers.request_new()
                    print(f"Temp number: {number}")
                except Exception as exc:
                    print(f"Error: {exc}")
            else:
                print("Unknown command. Use: friends, add <temp>, chat <id> <msg>, temp, quit")

    finally:
        await client.destroy()


if __name__ == "__main__":
    asyncio.run(_cli_main())
