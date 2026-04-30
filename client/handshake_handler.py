"""
Authenticated key-exchange handshake handler.

Orchestrates the 3-step Noise-XK-inspired handshake using the shared
crypto library primitives and the server's relay API.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Callable

import sys
_shared = str(Path(__file__).resolve().parent.parent / "shared")
if _shared not in sys.path:
    sys.path.insert(0, _shared)

from crypto import (
    KeyPair,
    HandshakeRequest,
    HandshakeResponse,
    generate_key_exchange_keypair,
    get_public_key_fingerprint,
    create_handshake_request,
    create_handshake_response,
    complete_handshake,
    encode_base64,
    decode_base64,
)

from .api_client import APIClient
from .ws_client import WSClient
from .identity_manager import IdentityManager
from .db import ClientDatabase
from .types import HandshakeProgress, HandshakeStatus, FriendInfo, FriendType


class HandshakeHandler:
    """Handles the 3-step authenticated key-exchange handshake.

    Supports both initiator and responder roles. The initiator starts
    a handshake by resolving a temp number, while the responder receives
    incoming requests and accepts or rejects them.
    """

    def __init__(
        self,
        api: APIClient,
        ws: WSClient,
        identity: IdentityManager,
        db: ClientDatabase,
    ):
        self._api = api
        self._ws = ws
        self._identity = identity
        self._db = db

        # Active outgoing handshake ephemeral keys, keyed by session_id
        self._outgoing: dict[str, dict] = {}

        # Incoming handshake requests awaiting user accept/reject
        self._incoming: dict[str, dict] = {}

        # Progress callback
        self._progress_cb: Optional[Callable[[HandshakeProgress], None]] = None

        # Setup WebSocket listeners
        self._ws.on("signal", self._on_signal)

    def on_progress(self, callback: Callable[[HandshakeProgress], None]) -> None:
        self._progress_cb = callback

    def _emit_progress(self, progress: HandshakeProgress) -> None:
        if self._progress_cb:
            try:
                self._progress_cb(progress)
            except Exception:
                pass

    # ──────────────── WebSocket signal handler ────────────────

    async def _on_signal(self, msg: dict) -> None:
        data = msg.get("data", {})
        signal_type = data.get("type", "")

        if signal_type == "handshake_request":
            await self._handle_incoming_request(data)
        elif signal_type == "handshake_response":
            await self._handle_response(data)
        elif signal_type == "handshake_confirm":
            await self._handle_confirm(data)

    # ──────────────── Initiate (outgoing) ────────────────

    async def initiate_handshake(self, temp_number: str) -> None:
        """Initiate a handshake with a peer identified by temp number.

        Flow:
            1. Resolve temp number -> target node ID
            2. Generate ephemeral X25519 key pair
            3. Create handshake request
            4. Submit to server via API
            5. Send handshake_request signal via WebSocket
            6. Wait for response
            7. Process response, derive session key, send confirm
            8. Store session key, add friend
        """
        # Step 1: Resolve temp number
        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.INITIATING,
            detail="Resolving temp number...",
        ))
        try:
            resolved = await self._api.resolve_temp_number(temp_number)
            target_node_id = resolved["nodeId"]
        except Exception as exc:
            self._emit_progress(HandshakeProgress(
                status=HandshakeStatus.FAILED,
                detail=f"Temp number resolution failed: {exc}",
            ))
            raise

        # Step 2-3: Generate ephemeral keys and create request
        ephemeral_keys = generate_key_exchange_keypair()
        request = HandshakeRequest(
            identity_public_key=self._identity.get_public_key(),
            ephemeral_public_key=ephemeral_keys.public_key,
        )

        # Step 4: Submit to server
        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.INITIATING,
            detail="Starting handshake session...",
        ))
        try:
            result = await self._api.initiate_handshake(temp_number)
            session_id = result["sessionId"]
        except Exception as exc:
            self._emit_progress(HandshakeProgress(
                status=HandshakeStatus.FAILED,
                detail=f"Failed to initiate handshake: {exc}",
            ))
            raise

        # Store ephemeral keys for later
        self._outgoing[session_id] = {
            "keys": ephemeral_keys,
            "request": request,
            "target_node_id": target_node_id,
        }

        # Step 5: Send signal via WebSocket
        self._ws.send("signal", {
            "to": target_node_id,
            "data": {
                "type": "handshake_request",
                "sessionId": session_id,
                "identityPublicKey": encode_base64(request.identity_public_key),
                "ephemeralPublicKey": encode_base64(request.ephemeral_public_key),
            },
        })

        # Step 6: Wait for response
        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.WAITING_RESPONSE,
            detail="Waiting for peer to accept...",
            peer_info=FriendInfo(id=target_node_id),
        ))

        try:
            response_msg = await self._ws.wait_for_response(
                session_id, "signal", timeout=120.0
            )
            resp_data = response_msg.get("data", {})
            if resp_data.get("type") != "handshake_response":
                raise RuntimeError("Unexpected response type")

            await self._complete_outgoing_handshake(session_id, resp_data)
        except Exception as exc:
            self._outgoing.pop(session_id, None)
            self._emit_progress(HandshakeProgress(
                status=HandshakeStatus.FAILED,
                detail=f"Handshake failed: {exc}",
            ))
            raise

    async def _complete_outgoing_handshake(
        self, session_id: str, response_data: dict
    ) -> None:
        """Complete the outgoing handshake after receiving the response."""
        state = self._outgoing.get(session_id)
        if not state:
            raise RuntimeError("No outgoing handshake state found")

        target_identity_pub = decode_base64(response_data["identityPublicKey"])
        target_ephemeral_pub = decode_base64(response_data["ephemeralPublicKey"])
        proof = decode_base64(response_data["proof"])

        response = HandshakeResponse(
            identity_public_key=target_identity_pub,
            ephemeral_public_key=target_ephemeral_pub,
            proof=proof,
        )

        my_identity_keys = KeyPair(
            public_key=self._identity.get_public_key(),
            secret_key=self._identity.get_signing_secret_key(),
        )

        session_key = complete_handshake(
            response, state["request"], my_identity_keys, state["keys"]
        )

        # Store session key
        target_id = state["target_node_id"]
        await self._db.set_session_key(target_id, session_key)

        # Submit confirm to server
        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.CONFIRMING,
            detail="Confirming handshake...",
        ))
        await self._api.submit_handshake_confirm(
            session_id, session_key[:16]
        )

        # Send confirm signal
        self._ws.send("signal", {
            "to": target_id,
            "data": {"type": "handshake_confirm", "sessionId": session_id},
        })

        # Add friend
        friend = FriendInfo(
            id=target_id,
            public_key=encode_base64(target_identity_pub),
            fingerprint=get_public_key_fingerprint(target_identity_pub),
            added_at=datetime.now(tz=timezone.utc).isoformat(),
            last_seen=datetime.now(tz=timezone.utc).isoformat(),
            is_online=False,
            friend_type=FriendType.HUMAN,
        )
        await self._db.add_friend(friend)

        self._outgoing.pop(session_id, None)
        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.COMPLETED,
            detail=f"Handshake complete with {target_id[:8]}...",
            peer_info=friend,
        ))

    # ──────────────── Incoming handshake ────────────────

    async def _handle_incoming_request(self, data: dict) -> None:
        session_id = data.get("sessionId", "")
        requester_id = data.get("requesterId", "")
        identity_pub = decode_base64(data.get("identityPublicKey", ""))
        ephemeral_pub = decode_base64(data.get("ephemeralPublicKey", ""))

        request = HandshakeRequest(
            identity_public_key=identity_pub,
            ephemeral_public_key=ephemeral_pub,
        )

        self._incoming[session_id] = {
            "session_id": session_id,
            "requester_id": requester_id,
            "requester_public_key": encode_base64(identity_pub),
            "request": request,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }

        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.WAITING_RESPONSE,
            detail=f"Incoming handshake from {requester_id[:8]}...",
            peer_info=FriendInfo(
                id=requester_id,
                public_key=encode_base64(identity_pub),
                fingerprint=get_public_key_fingerprint(identity_pub),
            ),
        ))

    # ──────────────── Accept / Reject ────────────────

    async def accept_handshake(self, request_id: str) -> None:
        """Accept an incoming handshake request."""
        pending = self._incoming.get(request_id)
        if not pending:
            raise RuntimeError("No pending handshake request found")

        ephemeral_keys = generate_key_exchange_keypair()

        my_identity_keys = KeyPair(
            public_key=self._identity.get_public_key(),
            secret_key=self._identity.get_signing_secret_key(),
        )

        response, session_key = create_handshake_response(
            pending["request"], my_identity_keys, ephemeral_keys
        )

        await self._db.set_session_key(pending["requester_id"], session_key)

        # Submit response to server API
        import json
        response_buf = json.dumps({
            "identityPublicKey": encode_base64(response.identity_public_key),
            "ephemeralPublicKey": encode_base64(response.ephemeral_public_key),
            "proof": encode_base64(response.proof),
        }).encode("utf-8")
        await self._api.submit_handshake_response(pending["session_id"], response_buf)

        # Send response signal
        self._ws.send("signal", {
            "to": pending["requester_id"],
            "data": {
                "type": "handshake_response",
                "sessionId": pending["session_id"],
                "identityPublicKey": encode_base64(response.identity_public_key),
                "ephemeralPublicKey": encode_base64(response.ephemeral_public_key),
                "proof": encode_base64(response.proof),
            },
        })

        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.CONFIRMING,
            detail="Waiting for confirmation...",
        ))

        try:
            await self._ws.wait_for_response(pending["session_id"], "signal", timeout=60.0)
        except Exception:
            pass  # Confirm timeout is non-fatal

        friend = FriendInfo(
            id=pending["requester_id"],
            public_key=pending["requester_public_key"],
            fingerprint=get_public_key_fingerprint(pending["request"].identity_public_key),
            added_at=datetime.now(tz=timezone.utc).isoformat(),
            last_seen=datetime.now(tz=timezone.utc).isoformat(),
            is_online=True,
        )
        await self._db.add_friend(friend)
        self._incoming.pop(request_id, None)

        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.COMPLETED,
            detail=f"Friend {pending['requester_id'][:8]}... added",
            peer_info=friend,
        ))

    def reject_handshake(self, request_id: str) -> None:
        """Reject an incoming handshake request."""
        pending = self._incoming.get(request_id)
        if not pending:
            return

        self._ws.send("signal", {
            "to": pending["requester_id"],
            "data": {
                "type": "handshake_rejected",
                "sessionId": pending["session_id"],
            },
        })
        self._incoming.pop(request_id, None)

        self._emit_progress(HandshakeProgress(
            status=HandshakeStatus.REJECTED,
            detail="Handshake request rejected",
        ))

    async def get_session_key(self, peer_id: str) -> Optional[bytes]:
        return await self._db.get_session_key(peer_id)

    # ──────────────── Internal handlers ────────────────

    async def _handle_response(self, data: dict) -> None:
        # Handled via waitForResponse mechanism
        pass

    async def _handle_confirm(self, data: dict) -> None:
        # Handled via waitForResponse mechanism
        pass

    # ──────────────── Cleanup ────────────────

    def destroy(self) -> None:
        self._outgoing.clear()
        self._incoming.clear()
        self._progress_cb = None
