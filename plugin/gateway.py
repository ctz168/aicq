"""AICQ Plugin — Gateway methods for OpenClaw integration."""

from __future__ import annotations

from typing import Optional


class AICQGateway:
    """Provides gateway methods for the AICQ plugin in OpenClaw.

    Methods are invoked by the OpenClaw runtime and follow the
    ``aicq.*`` namespace convention.
    """

    def __init__(self, db, identity_service, handshake_manager, server_client):
        self._db = db
        self._identity = identity_service
        self._handshake = handshake_manager
        self._server_client = server_client

    # ──────────────── Status ────────────────

    async def aicq_status(self, **kwargs) -> dict:
        """Return the current plugin status."""
        identity = await self._db.load_identity()
        return {
            "state": "connected" if self._server_client.is_connected else "disconnected",
            "agent_id": identity.get("agent_id", "") if identity else "",
            "version": "2.0.0",
        }

    # ──────────────── Friends ────────────────

    async def aicq_friends_list(self, **kwargs) -> dict:
        friends = await self._db.get_all_friends()
        return {
            "friends": [
                {"id": f.id, "fingerprint": f.fingerprint,
                 "is_online": f.is_online, "permissions": f.permissions,
                 "friend_type": f.friend_type}
                for f in friends
            ]
        }

    async def aicq_friends_add(self, temp_number: str = "", **kwargs) -> dict:
        if not temp_number:
            return {"error": "temp_number is required"}
        try:
            await self._handshake.initiate_handshake(temp_number)
            return {"success": True}
        except Exception as exc:
            return {"error": str(exc)}

    async def aicq_friends_remove(self, friend_id: str = "", **kwargs) -> dict:
        if not friend_id:
            return {"error": "friend_id is required"}
        await self._db.remove_friend(friend_id)
        await self._db.remove_session(friend_id)
        return {"success": True}

    async def aicq_friends_permissions(self, friend_id: str = "", **kwargs) -> dict:
        if not friend_id:
            return {"error": "friend_id is required"}
        friend = await self._db.get_friend(friend_id)
        return {"permissions": friend.permissions if friend else []}

    async def aicq_friends_set_permissions(self, friend_id: str = "",
                                           permissions: list = None, **kwargs) -> dict:
        if not friend_id:
            return {"error": "friend_id is required"}
        friend = await self._db.get_friend(friend_id)
        if friend:
            friend.permissions = permissions or friend.permissions
            await self._db.add_friend(friend)
        return {"success": True}

    async def aicq_friends_requests(self, **kwargs) -> dict:
        requests = await self._db.get_pending_requests()
        return {"requests": requests}

    async def aicq_friends_accept_request(self, request_id: str = "", **kwargs) -> dict:
        try:
            await self._handshake.accept_handshake(request_id)
            return {"success": True}
        except Exception as exc:
            return {"error": str(exc)}

    async def aicq_friends_reject_request(self, request_id: str = "", **kwargs) -> dict:
        self._handshake.reject_handshake(request_id)
        return {"success": True}

    # ──────────────── Sessions ────────────────

    async def aicq_sessions_list(self, **kwargs) -> dict:
        sessions = await self._db.get_all_sessions()
        return {"sessions": sessions}

    # ──────────────── Identity ────────────────

    async def aicq_identity_info(self, **kwargs) -> dict:
        identity = await self._db.load_identity()
        return identity or {}

    # ──────────────── Agent ────────────────

    async def aicq_agent_create(self, agent_id: str = "", **kwargs) -> dict:
        if not agent_id:
            agent_id = ""
        await self._identity.initialize(agent_id)
        return {"success": True, "agent_id": agent_id}

    async def aicq_agent_delete(self, agent_id: str = "", **kwargs) -> dict:
        return {"success": True, "message": "Agent deleted (local cleanup)"}

    # ──────────────── Method dispatcher ────────────────

    async def dispatch(self, method: str, **kwargs) -> dict:
        """Dispatch a gateway method call by name."""
        method_map = {
            "aicq.status": self.aicq_status,
            "aicq.friends.list": self.aicq_friends_list,
            "aicq.friends.add": self.aicq_friends_add,
            "aicq.friends.remove": self.aicq_friends_remove,
            "aicq.friends.permissions": self.aicq_friends_permissions,
            "aicq.friends.setPermissions": self.aicq_friends_set_permissions,
            "aicq.friends.requests": self.aicq_friends_requests,
            "aicq.friends.acceptRequest": self.aicq_friends_accept_request,
            "aicq.friends.rejectRequest": self.aicq_friends_reject_request,
            "aicq.sessions.list": self.aicq_sessions_list,
            "aicq.identity.info": self.aicq_identity_info,
            "aicq.agent.create": self.aicq_agent_create,
            "aicq.agent.delete": self.aicq_agent_delete,
        }
        handler = method_map.get(method)
        if not handler:
            return {"error": f"Unknown method: {method}"}
        return await handler(**kwargs)
