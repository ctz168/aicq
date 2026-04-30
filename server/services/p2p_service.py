"""
AICQ P2P Service
==================
Manages the in-memory online node registry for WebSocket connection
tracking. This is NOT database-backed — it tracks which nodes are
currently connected via WebSocket for real-time message relay.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

from aiohttp.web import WebSocketResponse

logger = logging.getLogger("aicq.p2p_service")


class P2PRegistry:
    """In-memory registry of online nodes and their WebSocket connections.

    Thread-safe for single-process aiohttp servers (asyncio event loop).
    """

    def __init__(self) -> None:
        # Map node_id → WebSocket
        self._online_nodes: Dict[str, WebSocketResponse] = {}
        # Reverse map WebSocket → node_id
        self._ws_to_node: Dict[WebSocketResponse, str] = {}

    # ── Registration ────────────────────────────────────────────────────

    def register_node(self, node_id: str, ws: WebSocketResponse) -> None:
        """Register a node as online with its WebSocket connection.

        If the node already has a connection, the old one is replaced.
        """
        # If node already has a different WS, clean up the old mapping
        old_ws = self._online_nodes.get(node_id)
        if old_ws is not None and old_ws is not ws:
            self._ws_to_node.pop(old_ws, None)
            logger.debug("Replaced existing WebSocket for node %s", node_id)

        self._online_nodes[node_id] = ws
        self._ws_to_node[ws] = node_id
        logger.info("Node registered as online: %s (total: %d)", node_id, len(self._online_nodes))

    def unregister_node(self, node_id: str) -> None:
        """Remove a node from the online registry."""
        ws = self._online_nodes.pop(node_id, None)
        if ws is not None:
            self._ws_to_node.pop(ws, None)
            logger.info("Node unregistered: %s (total: %d)", node_id, len(self._online_nodes))

    def unregister_by_ws(self, ws: WebSocketResponse) -> Optional[str]:
        """Remove a node from the registry by its WebSocket connection.

        Returns the node_id that was removed, or None.
        """
        node_id = self._ws_to_node.pop(ws, None)
        if node_id is not None:
            self._online_nodes.pop(node_id, None)
            logger.info("Node unregistered via WS: %s (total: %d)", node_id, len(self._online_nodes))
        return node_id

    # ── Queries ─────────────────────────────────────────────────────────

    def is_online(self, node_id: str) -> bool:
        """Check if a node is currently online."""
        return node_id in self._online_nodes

    def get_ws(self, node_id: str) -> Optional[WebSocketResponse]:
        """Get the WebSocket connection for a node. Returns None if offline."""
        return self._online_nodes.get(node_id)

    def get_node_id(self, ws: WebSocketResponse) -> Optional[str]:
        """Get the node_id for a WebSocket connection. Returns None if not registered."""
        return self._ws_to_node.get(ws)

    def get_online_friends(
        self,
        node_id: str,
        friend_ids: List[str],
    ) -> Dict[str, WebSocketResponse]:
        """Get online WebSocket connections for a list of friend IDs.

        Returns a dict mapping friend_id → WebSocket for friends that are online.
        """
        result: Dict[str, WebSocketResponse] = {}
        for friend_id in friend_ids:
            ws = self._online_nodes.get(friend_id)
            if ws is not None:
                result[friend_id] = ws
        return result

    def get_online_count(self) -> int:
        """Return the count of currently online nodes."""
        return len(self._online_nodes)

    def get_online_node_ids(self) -> Set[str]:
        """Return the set of all online node IDs."""
        return set(self._online_nodes.keys())

    # ── Message Relay ───────────────────────────────────────────────────

    async def relay_message(
        self,
        from_id: str,
        to_id: str,
        payload: Dict[str, Any],
    ) -> bool:
        """Send a relay message from one node to another via WebSocket.

        The payload is wrapped with 'type': 'relay' and from_id metadata.
        Returns True if the message was sent, False if the target is offline.
        """
        ws = self._online_nodes.get(to_id)
        if ws is None:
            logger.debug("Cannot relay message: target %s is offline", to_id)
            return False

        message = {
            "type": "relay",
            "from": from_id,
            "to": to_id,
            "payload": payload,
        }

        try:
            await ws.send_json(message)
            logger.debug("Relay message: %s -> %s", from_id, to_id)
            return True
        except Exception as exc:
            logger.warning("Failed to relay message to %s: %s", to_id, exc)
            # Clean up stale connection
            self.unregister_node(to_id)
            return False

    async def signal_relay(
        self,
        from_id: str,
        to_id: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send a WebRTC signal relay via WebSocket.

        The data is wrapped with 'type': 'signal' and from_id metadata.
        Returns True if the signal was sent, False if the target is offline.
        """
        ws = self._online_nodes.get(to_id)
        if ws is None:
            logger.debug("Cannot relay signal: target %s is offline", to_id)
            return False

        message = {
            "type": "signal",
            "from": from_id,
            "to": to_id,
            "data": data,
        }

        try:
            await ws.send_json(message)
            logger.debug("Signal relay: %s -> %s", from_id, to_id)
            return True
        except Exception as exc:
            logger.warning("Failed to relay signal to %s: %s", to_id, exc)
            # Clean up stale connection
            self.unregister_node(to_id)
            return False


# ─── Module-level Singleton ────────────────────────────────────────────

# Global registry instance, created once and shared across the application.
registry = P2PRegistry()
