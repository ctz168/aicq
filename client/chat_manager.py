"""
Chat message management — encrypt, send, receive, decrypt, store.

Messages are encrypted using the session key established during the
handshake and signed with the identity signing key. P2P transport is
preferred with WebSocket relay fallback.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Callable

import sys
_shared = str(Path(__file__).resolve().parent.parent / "shared")
if _shared not in sys.path:
    sys.path.insert(0, _shared)

from crypto import (
    encrypt_message,
    decrypt_message,
    encode_base64,
)

from .db import ClientDatabase
from .p2p_client import P2PClient
from .ws_client import WSClient
from .identity_manager import IdentityManager
from .types import ChatMessage, MessageType, MessageStatus, FileMetadata


class ChatManager:
    """Encrypt, send, receive, decrypt, and store chat messages.

    Uses the shared crypto library for encryption/decryption, P2PClient
    for direct peer transport (preferred), and WSClient for relay fallback.
    """

    def __init__(
        self,
        db: ClientDatabase,
        p2p: P2PClient,
        ws: WSClient,
        identity: IdentityManager,
    ):
        self._db = db
        self._p2p = p2p
        self._ws = ws
        self._identity = identity

        self._message_cbs: list[Callable[[ChatMessage], None]] = []
        self._save_timer: Optional[asyncio.Task] = None

        self._setup_listeners()

    # ──────────────── Callbacks ────────────────

    def on_message(self, callback: Callable[[ChatMessage], None]) -> None:
        self._message_cbs.append(callback)

    def _notify_message(self, msg: ChatMessage) -> None:
        for cb in self._message_cbs:
            try:
                cb(msg)
            except Exception:
                pass

    # ──────────────── WebSocket listeners ────────────────

    def _setup_listeners(self) -> None:
        self._ws.on("message", self._on_ws_message)
        self._p2p.on_any_data(self._on_p2p_data)

    async def _on_ws_message(self, msg: dict) -> None:
        data = msg.get("data", {})
        if data.get("type") == "encrypted_message":
            from_id = msg.get("from", data.get("fromId", ""))
            payload = data.get("payload", "")
            import base64
            try:
                raw = base64.b64decode(payload)
            except Exception:
                return
            message = await self.receive_message(raw, from_id)
            if message:
                self._notify_message(message)

    async def _on_p2p_data(self, peer_id: str, data: bytes) -> None:
        message = await self.receive_message(data, peer_id)
        if message:
            self._notify_message(message)

    # ──────────────── Send ────────────────

    async def send_message(self, friend_id: str, content: str) -> ChatMessage:
        """Send a text message to a friend.

        Encrypts with the session key and signs with the identity key.
        Tries P2P first, falls back to WebSocket relay.
        """
        session_key = await self._db.get_session_key(friend_id)
        if not session_key:
            raise RuntimeError(f"No session key for friend {friend_id}")

        now = datetime.now(tz=timezone.utc)
        message = ChatMessage(
            id=str(uuid.uuid4()),
            from_id=await self._identity.get_user_id(),
            to_id=friend_id,
            type=MessageType.TEXT,
            content=content,
            timestamp=now.isoformat(),
            status=MessageStatus.SENT,
        )

        wire_data = encrypt_message(
            content,
            session_key,
            self._identity.get_signing_secret_key(),
            self._identity.get_public_key(),
        )

        delivered = False
        if self._p2p.is_connected(friend_id):
            delivered = self._p2p.send(friend_id, wire_data)

        if not delivered:
            import base64
            self._ws.send("message", {
                "to": friend_id,
                "data": {
                    "type": "encrypted_message",
                    "fromId": await self._identity.get_user_id(),
                    "payload": base64.b64encode(wire_data).decode("ascii"),
                },
            })

        message.status = MessageStatus.DELIVERED if delivered else MessageStatus.SENT
        await self._db.add_message(message)
        return message

    async def send_file_info(self, friend_id: str, file_info: FileMetadata) -> ChatMessage:
        """Send file metadata as a chat message."""
        import json
        content = json.dumps(file_info.to_dict())

        now = datetime.now(tz=timezone.utc)
        message = ChatMessage(
            id=str(uuid.uuid4()),
            from_id=await self._identity.get_user_id(),
            to_id=friend_id,
            type=MessageType.FILE_INFO,
            content=content,
            timestamp=now.isoformat(),
            status=MessageStatus.SENT,
        )

        session_key = await self._db.get_session_key(friend_id)
        if not session_key:
            raise RuntimeError(f"No session key for friend {friend_id}")

        wire_data = encrypt_message(
            content,
            session_key,
            self._identity.get_signing_secret_key(),
            self._identity.get_public_key(),
        )

        delivered = False
        if self._p2p.is_connected(friend_id):
            delivered = self._p2p.send(friend_id, wire_data)

        if not delivered:
            import base64
            self._ws.send("message", {
                "to": friend_id,
                "data": {
                    "type": "encrypted_message",
                    "fromId": await self._identity.get_user_id(),
                    "payload": base64.b64encode(wire_data).decode("ascii"),
                },
            })

        message.status = MessageStatus.DELIVERED if delivered else MessageStatus.SENT
        await self._db.add_message(message)
        return message

    # ──────────────── Receive ────────────────

    async def receive_message(self, data: bytes, from_id: str) -> Optional[ChatMessage]:
        """Decrypt, verify, and store an incoming message."""
        friend = await self._db.get_friend(from_id)
        if not friend:
            print(f"[ChatManager] Received message from unknown peer: {from_id}")
            return None

        session_key = await self._db.get_session_key(from_id)
        if not session_key:
            print(f"[ChatManager] No session key for peer: {from_id}")
            return None

        sender_pub = encode_base64(friend.public_key) if friend.public_key else None
        # For decrypt_message we need the raw public key bytes
        import base64
        try:
            sender_pub_bytes = base64.b64decode(friend.public_key) if friend.public_key else b""
        except Exception:
            sender_pub_bytes = b""

        plaintext = decrypt_message(data, session_key, sender_pub_bytes)
        if plaintext is None:
            print(f"[ChatManager] Failed to decrypt message from {from_id}")
            return None

        # Determine message type
        msg_type = MessageType.TEXT
        try:
            import json
            parsed = json.loads(plaintext)
            if isinstance(parsed, dict) and "fileName" in parsed and "fileHash" in parsed:
                msg_type = MessageType.FILE_INFO
        except Exception:
            pass

        now = datetime.now(tz=timezone.utc)
        message = ChatMessage(
            id=str(uuid.uuid4()),
            from_id=from_id,
            to_id=await self._identity.get_user_id(),
            type=msg_type,
            content=plaintext,
            timestamp=now.isoformat(),
            status=MessageStatus.DELIVERED,
        )

        await self._db.add_message(message)
        return message

    # ──────────────── History ────────────────

    async def get_chat_history(self, friend_id: str, limit: int = 100) -> list[ChatMessage]:
        return await self._db.get_messages(friend_id, limit)

    async def delete_message(self, message_id: str) -> None:
        await self._db.delete_message(message_id)

    async def mark_as_read(self, friend_id: str) -> None:
        await self._db.mark_all_read(friend_id)

    # ──────────────── Typing indicator ────────────────

    def send_typing(self, friend_id: str) -> None:
        self._ws.send("typing", {
            "toId": friend_id,
            "fromId": "",  # Will be filled by WS layer
        })

    # ──────────────── Cleanup ────────────────

    def destroy(self) -> None:
        self._message_cbs.clear()
        if self._save_timer:
            self._save_timer.cancel()
            self._save_timer = None
