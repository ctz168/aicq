"""
AICQ Client Type Definitions
==============================
Dataclasses mirroring the original TypeScript client types for the
AICQ encrypted chat system.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ─── Enums ──────────────────────────────────────────────────────────────


class FriendPermission(str, Enum):
    """Permissions that can be granted to a friend."""

    CHAT = "chat"
    EXEC = "exec"


class MessageStatus(str, Enum):
    """Delivery status of a chat message."""

    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class MessageType(str, Enum):
    """Type of chat message content."""

    TEXT = "text"
    FILE_INFO = "file_info"
    SYSTEM = "system"


class HandshakeStatus(str, Enum):
    """Status of a handshake in progress."""

    INITIATING = "initiating"
    WAITING_RESPONSE = "waiting_response"
    CONFIRMING = "confirming"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class FileTransferStatus(str, Enum):
    """Status of a file transfer."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class FriendType(str, Enum):
    """Type of friend account."""

    HUMAN = "human"
    AI = "ai"


# ─── Data Models ────────────────────────────────────────────────────────


@dataclass
class FriendInfo:
    """Information about a friend in the user's contact list.

    Attributes
    ----------
    id : str
        The friend's unique account/node ID.
    public_key : str
        The friend's Ed25519 public key (hex).
    fingerprint : str
        Human-readable fingerprint of the public key.
    added_at : str
        ISO-8601 timestamp when the friendship was established.
    last_seen : str
        ISO-8601 timestamp of last activity.
    is_online : bool
        Whether the friend is currently connected.
    permissions : list[str]
        Permissions granted by this user to the friend.
    friend_type : FriendType
        Whether this friend is a human or AI account.
    ai_name : str
        Display name for AI friends (empty for humans).
    ai_avatar : str
        Avatar URL for AI friends (empty for humans).
    """

    id: str = ""
    public_key: str = ""
    fingerprint: str = ""
    added_at: str = ""
    last_seen: str = ""
    is_online: bool = False
    permissions: List[str] = field(default_factory=list)
    friend_type: FriendType = FriendType.HUMAN
    ai_name: str = ""
    ai_avatar: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> FriendInfo:
        """Create a FriendInfo from a server response dict."""
        ft = data.get("friend_type", data.get("type", "human"))
        if isinstance(ft, str):
            ft = FriendType(ft) if ft in ("human", "ai") else FriendType.HUMAN
        return cls(
            id=data.get("id", data.get("friend_id", "")),
            public_key=data.get("public_key", data.get("publicKey", "")),
            fingerprint=data.get("fingerprint", ""),
            added_at=data.get("added_at", data.get("createdAt", "")),
            last_seen=data.get("last_seen", data.get("lastSeen", "")),
            is_online=data.get("is_online", data.get("isOnline", False)),
            permissions=data.get("permissions", []),
            friend_type=ft,
            ai_name=data.get("ai_name", data.get("agent_name", data.get("agentName", ""))),
            ai_avatar=data.get("ai_avatar", data.get("avatar", "")),
        )


@dataclass
class ChatMessage:
    """A chat message in a conversation.

    Attributes
    ----------
    id : str
        Unique message identifier.
    from_id : str
        Sender's node ID.
    to_id : str
        Recipient's node ID.
    type : MessageType
        The type of message content.
    content : str
        The message body (encrypted or plaintext depending on context).
    timestamp : str
        ISO-8601 timestamp when the message was created.
    status : MessageStatus
        Delivery status of the message.
    """

    id: str = ""
    from_id: str = ""
    to_id: str = ""
    type: MessageType = MessageType.TEXT
    content: str = ""
    timestamp: str = ""
    status: MessageStatus = MessageStatus.PENDING

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ChatMessage:
        """Create a ChatMessage from a dict."""
        mt = data.get("type", "text")
        if isinstance(mt, str):
            mt = MessageType(mt) if mt in ("text", "file_info", "system") else MessageType.TEXT
        ms = data.get("status", "pending")
        if isinstance(ms, str):
            ms = MessageStatus(ms) if ms in ("pending", "sent", "delivered", "read", "failed") else MessageStatus.PENDING
        return cls(
            id=data.get("id", ""),
            from_id=data.get("from_id", data.get("from", data.get("fromId", ""))),
            to_id=data.get("to_id", data.get("to", data.get("toId", ""))),
            type=mt,
            content=data.get("content", data.get("text", "")),
            timestamp=data.get("timestamp", ""),
            status=ms,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict."""
        return {
            "id": self.id,
            "from_id": self.from_id,
            "to_id": self.to_id,
            "type": self.type.value,
            "content": self.content,
            "timestamp": self.timestamp,
            "status": self.status.value,
        }


@dataclass
class TempNumberInfo:
    """Information about a temporary number for handshake discovery.

    Attributes
    ----------
    number : str
        The 6-digit temporary number.
    expires_at : str
        ISO-8601 timestamp when the number expires.
    created_at : str
        ISO-8601 timestamp when the number was created.
    """

    number: str = ""
    expires_at: str = ""
    created_at: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TempNumberInfo:
        return cls(
            number=data.get("number", ""),
            expires_at=data.get("expires_at", data.get("expiresAt", "")),
            created_at=data.get("created_at", data.get("createdAt", "")),
        )


@dataclass
class FileTransferInfo:
    """Information about an ongoing or completed file transfer.

    Attributes
    ----------
    session_id : str
        The file transfer session identifier.
    file_name : str
        Name of the file being transferred.
    file_size : int
        Total size of the file in bytes.
    progress : float
        Transfer progress as a fraction (0.0 to 1.0).
    status : FileTransferStatus
        Current status of the transfer.
    chunks : int
        Total number of chunks.
    """

    session_id: str = ""
    file_name: str = ""
    file_size: int = 0
    progress: float = 0.0
    status: FileTransferStatus = FileTransferStatus.PENDING
    chunks: int = 0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> FileTransferInfo:
        fs = data.get("status", "pending")
        if isinstance(fs, str):
            try:
                fs = FileTransferStatus(fs)
            except ValueError:
                fs = FileTransferStatus.PENDING
        return cls(
            session_id=data.get("session_id", data.get("sessionId", data.get("id", ""))),
            file_name=data.get("file_name", data.get("fileName", "")),
            file_size=data.get("file_size", data.get("fileSize", 0)),
            progress=data.get("progress", 0.0),
            status=fs,
            chunks=data.get("chunks", data.get("totalChunks", 0)),
        )


@dataclass
class HandshakeProgress:
    """Progress update during a handshake operation.

    Attributes
    ----------
    status : HandshakeStatus
        Current stage of the handshake.
    peer_info : Optional[FriendInfo]
        Information about the peer, once known.
    detail : str
        Human-readable detail about the current stage.
    """

    status: HandshakeStatus = HandshakeStatus.INITIATING
    peer_info: Optional[FriendInfo] = None
    detail: str = ""


@dataclass
class FileMetadata:
    """Metadata for a file being transferred.

    Attributes
    ----------
    file_name : str
        Name of the file.
    file_size : int
        Total size in bytes.
    file_hash : str
        SHA-256 hex digest of the file.
    chunks : int
        Total number of chunks.
    chunk_size : int
        Size of each chunk in bytes (last chunk may be smaller).
    """

    file_name: str = ""
    file_size: int = 0
    file_hash: str = ""
    chunks: int = 0
    chunk_size: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fileName": self.file_name,
            "fileSize": self.file_size,
            "fileHash": self.file_hash,
            "totalChunks": self.chunks,
            "chunkSize": self.chunk_size,
        }


@dataclass
class ParsedQR:
    """Result of parsing a QR code for AICQ temp number import.

    Attributes
    ----------
    number : str
        The temp number extracted from the QR code.
    server_url : str
        The server URL from the QR code (if present).
    node_id : str
        The node ID from the QR code (if present).
    """

    number: str = ""
    server_url: str = ""
    node_id: str = ""
