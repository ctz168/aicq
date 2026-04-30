"""
AICQ REST API Client
======================
Async HTTP client for the AICQ server REST API using aiohttp.

Handles authentication (JWT), all REST endpoints, and error handling.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger("aicq.client.api")


class APIError(Exception):
    """Raised when the server returns an error response."""

    def __init__(self, message: str, status: int = 0, code: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class APIClient:
    """Async REST API client for the AICQ server.

    Parameters
    ----------
    base_url : str
        The server base URL (e.g. ``https://aicq.online``).
    access_token : str, optional
        JWT access token for authenticated requests.

    Usage::

        api = APIClient("https://aicq.online", access_token="eyJ...")
        await api.register("my-id", "pubkeyhex")
        result = await api.request_temp_number()
        await api.close()
    """

    def __init__(self, base_url: str, access_token: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_prefix = f"{self.base_url}/api/v1"
        self._access_token = access_token
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def access_token(self) -> str:
        return self._access_token

    @access_token.setter
    def access_token(self, value: str) -> None:
        self._access_token = value

    # ── Session management ───────────────────────────────────────────────

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers=self._auth_headers(),
                timeout=aiohttp.ClientTimeout(total=30),
            )
        return self._session

    def _auth_headers(self) -> Dict[str, str]:
        """Return authorization headers if a token is set."""
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        return headers

    async def _update_session_auth(self) -> None:
        """Recreate the session with updated auth headers."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None

    async def close(self) -> None:
        """Close the underlying aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    # ── HTTP helpers ─────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[Dict[str, Any]] = None,
        auth: bool = True,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API.

        Parameters
        ----------
        method : str
            HTTP method (GET, POST, PUT, DELETE).
        path : str
            Full URL or relative path under ``api_prefix``.
        json_data : dict, optional
            JSON body for the request.
        auth : bool
            Whether to include the authorization header.

        Returns
        -------
        dict
            The parsed JSON response.

        Raises
        ------
        APIError
            If the server returns a non-2xx status.
        """
        if not path.startswith("http"):
            url = f"{self.api_prefix}{path}"
        else:
            url = path

        session = await self._get_session()
        headers = self._auth_headers() if auth else {"Content-Type": "application/json"}

        async with session.request(method, url, json=json_data, headers=headers) as resp:
            body = await resp.text()
            try:
                data = await resp.json() if body else {}
            except Exception:
                data = {"raw": body}

            if resp.status >= 400:
                msg = data.get("message", data.get("error", f"HTTP {resp.status}"))
                code = data.get("code", "")
                raise APIError(msg, status=resp.status, code=code)

            return data

    # ─── Authentication ──────────────────────────────────────────────────

    async def auth_challenge(self, public_key: str) -> Dict[str, Any]:
        """Request an Ed25519 challenge for agent login.

        Returns ``{"session_id": "...", "challenge": "hex"}``.
        """
        return await self._request("POST", "/auth/challenge", {"publicKey": public_key}, auth=False)

    async def auth_login_agent(
        self, public_key: str, signature: str, challenge: str
    ) -> Dict[str, Any]:
        """Authenticate as an AI agent via Ed25519 challenge-response.

        Returns ``{"access_token": "...", "refresh_token": "...", "account": {...}}``.
        """
        result = await self._request(
            "POST",
            "/auth/login-agent",
            {"publicKey": public_key, "signature": signature, "challenge": challenge},
            auth=False,
        )
        # Store the token
        if "access_token" in result:
            self._access_token = result["access_token"]
            await self._update_session_auth()
        return result

    async def auth_refresh(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh the access token.

        Returns new ``{"access_token": "...", "refresh_token": "..."}``.
        """
        result = await self._request(
            "POST", "/auth/refresh", {"refreshToken": refresh_token}, auth=False
        )
        if "access_token" in result:
            self._access_token = result["access_token"]
            await self._update_session_auth()
        return result

    # ─── Node Registration ───────────────────────────────────────────────

    async def register(self, user_id: str, public_key: str) -> Dict[str, Any]:
        """Register or update this node with the server.

        Parameters
        ----------
        user_id : str
            The node's unique ID.
        public_key : str
            The node's Ed25519 public key (hex).

        Returns
        -------
        dict
            The registered node record.
        """
        return await self._request("POST", "/node/register", {"publicKey": public_key})

    # ─── Temp Numbers ────────────────────────────────────────────────────

    async def request_temp_number(self) -> Dict[str, Any]:
        """Request a new temporary 6-digit number.

        Returns the temp number info dict.
        """
        return await self._request("POST", "/temp-number/request")

    async def resolve_temp_number(self, number: str) -> Dict[str, Any]:
        """Resolve a temp number to the associated node info.

        No auth required.
        """
        return await self._request("GET", f"/temp-number/{number}", auth=False)

    async def revoke_temp_number(self, number: str) -> Dict[str, Any]:
        """Revoke (delete) a temp number owned by this node."""
        return await self._request("DELETE", f"/temp-number/{number}")

    # ─── Handshake ───────────────────────────────────────────────────────

    async def initiate_handshake(self, target_temp_number: str) -> Dict[str, Any]:
        """Initiate a handshake with a target identified by temp number.

        Returns the handshake session details.
        """
        return await self._request(
            "POST", "/handshake/initiate", {"targetTempNumber": target_temp_number}
        )

    async def submit_handshake_response(
        self, session_id: str, response_data: str
    ) -> Dict[str, Any]:
        """Submit a handshake response.

        Parameters
        ----------
        session_id : str
            The handshake session ID.
        response_data : str
            The signed response payload (JSON string).
        """
        return await self._request(
            "POST", "/handshake/respond",
            {"sessionId": session_id, "responseData": response_data},
        )

    async def submit_handshake_confirm(
        self, session_id: str, confirm_data: str
    ) -> Dict[str, Any]:
        """Submit a handshake confirmation.

        Parameters
        ----------
        session_id : str
            The handshake session ID.
        confirm_data : str
            The signed confirm payload (JSON string).
        """
        return await self._request(
            "POST", "/handshake/confirm",
            {"sessionId": session_id, "confirmData": confirm_data},
        )

    # ─── Friends ─────────────────────────────────────────────────────────

    async def get_friends(self) -> List[Dict[str, Any]]:
        """Get the authenticated user's friend list."""
        result = await self._request("GET", "/friends/")
        return result.get("friends", [])

    async def remove_friend(self, friend_id: str) -> Dict[str, Any]:
        """Remove a friend bidirectionally."""
        return await self._request("DELETE", f"/friends/{friend_id}")

    # ─── File Transfers ──────────────────────────────────────────────────

    async def initiate_file_transfer(
        self, receiver_id: str, file_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Initiate a file transfer session.

        Parameters
        ----------
        receiver_id : str
            The friend's node ID.
        file_info : dict
            File metadata (fileName, fileSize, fileHash, totalChunks, chunkSize).
        """
        payload = {"receiverId": receiver_id, **file_info}
        return await self._request("POST", "/file/initiate", payload)

    async def get_file_missing_chunks(self, session_id: str) -> List[int]:
        """Get the list of missing chunk indices for a file transfer."""
        result = await self._request("GET", f"/file/{session_id}/missing")
        return result.get("missing_chunks", [])

    async def report_chunk(self, session_id: str, chunk_index: int) -> Dict[str, Any]:
        """Report a received chunk to the server."""
        return await self._request(
            "POST", f"/file/{session_id}/chunk",
            {"chunksReceived": [chunk_index]},
        )

    async def get_file_transfer_session(self, session_id: str) -> Dict[str, Any]:
        """Get details of a file transfer session."""
        return await self._request("GET", f"/file/{session_id}")

    # ─── Friend Requests ─────────────────────────────────────────────────

    async def list_friend_requests(self) -> Dict[str, Any]:
        """List sent and received friend requests."""
        return await self._request("GET", "/friends/requests")

    async def send_friend_request(
        self, user_id: str, message: Optional[str] = None, permissions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Send a friend request to a user."""
        payload: Dict[str, Any] = {}
        if message:
            payload["message"] = message
        if permissions:
            payload["permissions"] = permissions
        return await self._request("POST", f"/friends/requests/{user_id}", payload or None)

    async def accept_friend_request(
        self, request_id: str, permissions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Accept a friend request."""
        payload: Dict[str, Any] = {}
        if permissions:
            payload["permissions"] = permissions
        return await self._request("POST", f"/friends/requests/{request_id}/accept", payload or None)

    async def reject_friend_request(self, request_id: str) -> Dict[str, Any]:
        """Reject a friend request."""
        return await self._request("POST", f"/friends/requests/{request_id}/reject")
