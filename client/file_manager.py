"""
File transfer manager with breakpoint resume support.

Features:
- Split files into 64 KB chunks
- SHA-256 hash verification
- Progress tracking with speed calculation
- Pause / resume / cancel
- Query missing chunks for breakpoint resume
- Send via P2P (preferred) or WebSocket relay fallback
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable

from .api_client import APIClient
from .ws_client import WSClient
from .db import ClientDatabase
from .p2p_client import P2PClient
from .types import FileTransferInfo, FileTransferStatus, FileMetadata


CHUNK_SIZE = 64 * 1024  # 64 KB


@dataclass
class ActiveTransfer:
    session_id: str
    friend_id: str
    direction: str  # 'send' or 'receive'
    file_path: str
    file_hash: str
    file_size: int
    total_chunks: int
    chunks_sent: list[bool] = field(default_factory=list)
    chunks_received: list[bool] = field(default_factory=list)
    status: str = "pending"
    start_time: float = 0.0
    bytes_transferred: int = 0


def _format_speed(bps: float) -> str:
    if bps < 1024:
        return f"{bps:.1f} B/s"
    if bps < 1024 * 1024:
        return f"{bps / 1024:.1f} KB/s"
    if bps < 1024 * 1024 * 1024:
        return f"{bps / (1024 * 1024):.1f} MB/s"
    return f"{bps / (1024 * 1024 * 1024):.1f} GB/s"


class FileManager:
    """Manages chunked file transfers with pause/resume/cancel support."""

    def __init__(
        self,
        api: APIClient,
        ws: WSClient,
        db: ClientDatabase,
        p2p: P2PClient,
    ):
        self._api = api
        self._ws = ws
        self._db = db
        self._p2p = p2p

        self._active: dict[str, ActiveTransfer] = {}
        self._progress_cbs: list[Callable] = []

        self._ws.on("file_chunk", self._on_file_chunk)

    def on_progress(self, callback: Callable) -> None:
        self._progress_cbs.append(callback)

    def _notify_progress(self, info: FileTransferInfo) -> None:
        for cb in self._progress_cbs:
            try:
                cb(info)
            except Exception:
                pass

    # ──────────────── Send file ────────────────

    async def send_file(
        self,
        friend_id: str,
        file_path: str,
        on_progress: Optional[Callable] = None,
    ) -> None:
        """Send a file to a friend with progress tracking."""
        friend = await self._db.get_friend(friend_id)
        if not friend:
            raise RuntimeError(f"Friend {friend_id} not found")

        with open(file_path, "rb") as f:
            file_buffer = f.read()

        file_hash = hashlib.sha256(file_buffer).hexdigest()
        file_size = len(file_buffer)
        total_chunks = max(1, (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE)

        file_name = os.path.basename(file_path)
        file_info = FileMetadata(
            file_name=file_name,
            file_size=file_size,
            file_hash=file_hash,
            chunks=total_chunks,
            chunk_size=CHUNK_SIZE,
        )

        result = await self._api.initiate_file_transfer(friend_id, file_info.to_dict())
        session_id = result.get("sessionId", "")

        transfer = ActiveTransfer(
            session_id=session_id,
            friend_id=friend_id,
            direction="send",
            file_path=file_path,
            file_hash=file_hash,
            file_size=file_size,
            total_chunks=total_chunks,
            chunks_sent=[False] * total_chunks,
            chunks_received=[False] * total_chunks,
            status="transferring",
            start_time=time.time(),
        )
        self._active[session_id] = transfer

        try:
            for i in range(total_chunks):
                if transfer.status in ("paused", "failed"):
                    break

                start = i * CHUNK_SIZE
                end = min(start + CHUNK_SIZE, file_size)
                chunk = file_buffer[start:end]

                self._send_chunk(friend_id, session_id, i, chunk)
                transfer.chunks_sent[i] = True
                transfer.bytes_transferred += len(chunk)

                try:
                    await self._api.report_chunk(session_id, i)
                except Exception:
                    pass

                progress = transfer.bytes_transferred / file_size
                info = FileTransferInfo(
                    session_id=session_id,
                    file_name=file_name,
                    file_size=file_size,
                    progress=progress,
                    status=FileTransferStatus.IN_PROGRESS,
                    chunks=total_chunks,
                )
                self._notify_progress(info)

                if on_progress:
                    elapsed = max(time.time() - transfer.start_time, 0.1)
                    on_progress({
                        "sent": transfer.bytes_transferred,
                        "total": file_size,
                        "speed": _format_speed(transfer.bytes_transferred / elapsed),
                    })

            if transfer.status == "transferring":
                transfer.status = "completed"
                info = FileTransferInfo(
                    session_id=session_id,
                    file_name=file_name,
                    file_size=file_size,
                    progress=1.0,
                    status=FileTransferStatus.COMPLETED,
                    chunks=total_chunks,
                )
                self._notify_progress(info)

        except Exception:
            transfer.status = "failed"
            info = FileTransferInfo(
                session_id=session_id,
                file_name=file_name,
                file_size=file_size,
                progress=transfer.bytes_transferred / file_size,
                status=FileTransferStatus.FAILED,
                chunks=total_chunks,
            )
            self._notify_progress(info)
            raise

    # ──────────────── Receive file ────────────────

    async def receive_file(
        self,
        sender_id: str,
        session_id: str,
        save_path: str,
        on_progress: Optional[Callable] = None,
    ) -> None:
        """Receive a file from a sender. Chunks arrive via WebSocket."""
        session = await self._api.get_file_transfer_session(session_id)

        transfer = ActiveTransfer(
            session_id=session_id,
            friend_id=sender_id,
            direction="receive",
            file_path=save_path,
            file_hash=session.get("fileHash", ""),
            file_size=session.get("fileSize", 0),
            total_chunks=session.get("totalChunks", 1),
            status="transferring",
            start_time=time.time(),
        )

        received = session.get("chunksReceived", [])
        for i, r in enumerate(received):
            if r and i < transfer.total_chunks:
                transfer.chunks_received.append(True)
                transfer.bytes_transferred += min(CHUNK_SIZE, transfer.file_size - i * CHUNK_SIZE)

        self._active[session_id] = transfer

        # Wait for completion
        while transfer.status == "transferring":
            await asyncio.sleep(1)

        if transfer.status == "completed":
            temp_path = save_path + ".tmp"
            if os.path.exists(temp_path):
                with open(temp_path, "rb") as f:
                    data = f.read()
                actual_hash = hashlib.sha256(data).hexdigest()
                if actual_hash != transfer.file_hash:
                    os.unlink(temp_path)
                    raise RuntimeError("File hash verification failed")
                os.rename(temp_path, save_path)

    # ──────────────── Incoming chunk handler ────────────────

    async def _on_file_chunk(self, msg: dict) -> None:
        data = msg.get("data", {})
        if data.get("type") != "file_chunk_data":
            return

        session_id = data.get("sessionId", "")
        chunk_index = data.get("chunkIndex", -1)
        chunk_data = data.get("chunkData", "")

        transfer = None
        for t in self._active.values():
            if t.session_id == session_id and t.direction == "receive":
                transfer = t
                break

        if not transfer or transfer.status != "transferring":
            return

        if chunk_index < 0 or chunk_index >= transfer.total_chunks:
            return

        try:
            temp_path = transfer.file_path + ".tmp"
            chunk = base64.b64decode(chunk_data)
            offset = chunk_index * CHUNK_SIZE

            os.makedirs(os.path.dirname(temp_path) or ".", exist_ok=True)

            mode = "r+b" if os.path.exists(temp_path) else "w+b"
            with open(temp_path, mode) as f:
                f.seek(offset)
                f.write(chunk)

            transfer.chunks_received[chunk_index] = True
            transfer.bytes_transferred = sum(
                min(CHUNK_SIZE, transfer.file_size - i * CHUNK_SIZE)
                for i, r in enumerate(transfer.chunks_received)
                if r and i < transfer.total_chunks
            )

            try:
                await self._api.report_chunk(session_id, chunk_index)
            except Exception:
                pass

            progress = transfer.bytes_transferred / max(transfer.file_size, 1)
            info = FileTransferInfo(
                session_id=session_id,
                file_name=os.path.basename(transfer.file_path),
                file_size=transfer.file_size,
                progress=progress,
                status=FileTransferStatus.IN_PROGRESS,
                chunks=transfer.total_chunks,
            )
            self._notify_progress(info)

            if all(transfer.chunks_received[:transfer.total_chunks]):
                transfer.status = "completed"

        except Exception as exc:
            print(f"[FileManager] Failed to write chunk {chunk_index}: {exc}")

    # ──────────────── Pause / Resume / Cancel ────────────────

    def pause_transfer(self, session_id: str) -> None:
        transfer = self._active.get(session_id)
        if transfer:
            transfer.status = "paused"

    async def resume_transfer(self, session_id: str) -> None:
        transfer = self._active.get(session_id)
        if not transfer:
            raise RuntimeError("No active transfer found")

        if transfer.direction == "send":
            missing = await self._api.get_file_missing_chunks(session_id)
            if not missing:
                transfer.status = "completed"
                return

            transfer.status = "transferring"
            with open(transfer.file_path, "rb") as f:
                file_buffer = f.read()

            for chunk_index in missing:
                start = chunk_index * CHUNK_SIZE
                end = min(start + CHUNK_SIZE, transfer.file_size)
                chunk = file_buffer[start:end]

                self._send_chunk(transfer.friend_id, session_id, chunk_index, chunk)
                transfer.chunks_sent[chunk_index] = True
                transfer.bytes_transferred += len(chunk)
                await self._api.report_chunk(session_id, chunk_index)

            transfer.status = "completed"
        else:
            transfer.status = "transferring"

    def cancel_transfer(self, session_id: str) -> None:
        transfer = self._active.pop(session_id, None)
        if not transfer:
            return
        transfer.status = "failed"
        temp_path = transfer.file_path + ".tmp"
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    # ──────────────── Helpers ────────────────

    def _send_chunk(
        self, friend_id: str, session_id: str, chunk_index: int, chunk: bytes
    ) -> bool:
        payload = json.dumps({
            "type": "file_chunk_data",
            "sessionId": session_id,
            "chunkIndex": chunk_index,
            "chunkData": base64.b64encode(chunk).decode("ascii"),
        }).encode("utf-8")

        if self._p2p.is_connected(friend_id):
            return self._p2p.send(friend_id, payload)

        self._ws.send("file_chunk", {
            "to": friend_id,
            "data": {
                "type": "file_chunk_data",
                "sessionId": session_id,
                "chunkIndex": chunk_index,
                "chunkData": base64.b64encode(chunk).decode("ascii"),
            },
        })
        return True

    def get_transfer_progress(self, session_id: str) -> dict:
        transfer = self._active.get(session_id)
        if not transfer:
            return {"sent": 0, "total": 0, "speed": "0 B/s"}

        elapsed = max(time.time() - transfer.start_time, 0.1)
        return {
            "sent": transfer.bytes_transferred,
            "total": transfer.file_size,
            "speed": _format_speed(transfer.bytes_transferred / elapsed),
        }

    def is_transfer_active(self) -> bool:
        return any(t.status in ("transferring", "pending") for t in self._active.values())

    # ──────────────── Cleanup ────────────────

    def destroy(self) -> None:
        for sid in list(self._active.keys()):
            self.cancel_transfer(sid)
        self._active.clear()
        self._progress_cbs.clear()
