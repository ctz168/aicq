"""
Friend management — add, remove, search, and query friend list.

Orchestrates temp number resolution and handshake to complete
the full friend-adding flow.
"""

from __future__ import annotations

from typing import Optional

from .api_client import APIClient
from .ws_client import WSClient
from .handshake_handler import HandshakeHandler
from .db import ClientDatabase
from .p2p_client import P2PClient
from .types import FriendInfo


class FriendManager:
    """Manages the user's friend list.

    Adding a friend involves:
    1. Resolve temp number -> target node ID
    2. Initiate authenticated handshake
    3. Complete handshake (session key derived)
    4. Friend is added to database by HandshakeHandler
    5. Attempt P2P connection
    """

    def __init__(
        self,
        api: APIClient,
        ws: WSClient,
        handshake: HandshakeHandler,
        db: ClientDatabase,
        p2p: P2PClient,
    ):
        self._api = api
        self._ws = ws
        self._handshake = handshake
        self._db = db
        self._p2p = p2p

        self._ws.on("presence", self._on_presence)

    # ──────────────── Presence listener ────────────────

    async def _on_presence(self, event: dict) -> None:
        node_id = event.get("nodeId", "")
        online = event.get("online", False)

        friend = await self._db.get_friend(node_id)
        if friend:
            friend.is_online = online
            from datetime import datetime, timezone
            friend.last_seen = datetime.now(tz=timezone.utc).isoformat()
            await self._db.add_friend(friend)

    # ──────────────── Add friend ────────────────

    async def add_friend(self, temp_number: str) -> FriendInfo:
        """Add a friend by their temporary number.

        Resolves the temp number, initiates the handshake, and
        attempts a P2P connection once the handshake completes.
        """
        # Resolve temp number
        try:
            resolved = await self._api.resolve_temp_number(temp_number)
            target_node_id = resolved["nodeId"]
        except Exception as exc:
            raise RuntimeError(f"Failed to resolve temp number: {exc}") from exc

        # Check if already friends
        existing = await self._db.get_friend(target_node_id)
        if existing:
            raise RuntimeError("Already friends with this user")

        # Handshake (adds friend to DB on completion)
        await self._handshake.initiate_handshake(temp_number)

        # Retrieve the added friend
        friend = await self._db.get_friend(target_node_id)
        if not friend:
            raise RuntimeError("Handshake completed but friend was not added to DB")

        # Attempt P2P connection
        await self._p2p.connect(target_node_id)

        return friend

    # ──────────────── Remove friend ────────────────

    async def remove_friend(self, friend_id: str) -> None:
        """Remove a friend and clean up all associated state."""
        self._p2p.disconnect(friend_id)
        await self._db.remove_session(friend_id)

        try:
            await self._api.remove_friend(friend_id)
        except Exception:
            pass  # Non-fatal: local removal still proceeds

        await self._db.remove_friend(friend_id)

    # ──────────────── Query ────────────────

    async def get_friends(self) -> list[FriendInfo]:
        return await self._db.get_all_friends()

    async def get_friend_count(self) -> int:
        return await self._db.get_friend_count()

    async def search_friends(self, query: str) -> list[FriendInfo]:
        lower = query.lower()
        all_friends = await self.get_friends()
        return [
            f for f in all_friends
            if lower in f.id.lower() or lower in f.fingerprint.lower()
        ]

    async def is_friend(self, id: str) -> bool:
        friend = await self._db.get_friend(id)
        return friend is not None

    async def get_online_friends(self) -> list[FriendInfo]:
        all_friends = await self.get_friends()
        return [f for f in all_friends if f.is_online]

    # ──────────────── Cleanup ────────────────

    def destroy(self) -> None:
        pass
