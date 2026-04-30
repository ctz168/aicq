"""
AICQ Friends Routes
=====================
Friend and friend-request route handlers: listing friends, removing friends,
managing permissions, and handling friend requests (send, accept, reject).

All routes are prefixed with ``/api/v1/friends``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from aiohttp import web

from routes.middleware import (
    error_response,
    get_db,
    json_response,
)

logger = logging.getLogger("aicq.friends_routes")


# ─── Friend Management ──────────────────────────────────────────────────


async def get_friends_list(request: web.Request) -> web.Response:
    """GET /api/v1/friends/  (JWT auth required)

    Returns the authenticated user's friend list with permissions.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    node_id = account.get("sub")

    try:
        from services.friendship_service import get_friends

        friends = await get_friends(db, node_id)
        return json_response({"friends": friends}, status=200)
    except Exception as exc:
        logger.exception("Error getting friends list")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def remove_friend(request: web.Request) -> web.Response:
    """DELETE /api/v1/friends/{friend_id}  (JWT auth required)

    Removes the bidirectional friendship between the caller and
    the specified friend.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    friend_id = request.match_info["friend_id"]
    node_id = account.get("sub")

    try:
        from services.friendship_service import remove_friend_bidirectional

        await remove_friend_bidirectional(db, node_id, friend_id)
        return json_response({"removed": True, "friendId": friend_id}, status=200)
    except Exception as exc:
        logger.exception("Error removing friend")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_friend_permissions(request: web.Request) -> web.Response:
    """GET /api/v1/friends/{friend_id}/permissions  (JWT auth required)

    Returns the permissions the caller has granted to the specified friend.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    friend_id = request.match_info["friend_id"]
    node_id = account.get("sub")

    try:
        from services.friendship_service import get_friend_permissions

        permissions = await get_friend_permissions(db, node_id, friend_id)
        return json_response(
            {"friendId": friend_id, "permissions": permissions},
            status=200,
        )
    except Exception as exc:
        logger.exception("Error getting friend permissions")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def update_friend_permissions(request: web.Request) -> web.Response:
    """PUT /api/v1/friends/{friend_id}/permissions  (JWT auth required)

    Request body::

        {
            "permissions": ["chat", "file"]
        }

    Updates the permissions the caller grants to the specified friend.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    friend_id = request.match_info["friend_id"]
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    permissions = body.get("permissions")

    if permissions is None or not isinstance(permissions, list):
        return error_response(
            "Missing or invalid field: permissions (must be an array)",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.friendship_service import update_friend_permissions

        await update_friend_permissions(db, node_id, friend_id, permissions)
        return json_response(
            {"friendId": friend_id, "permissions": permissions},
            status=200,
        )
    except Exception as exc:
        logger.exception("Error updating friend permissions")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Friend Requests ────────────────────────────────────────────────────


async def list_friend_requests(request: web.Request) -> web.Response:
    """GET /api/v1/friends/requests  (JWT auth required)

    Lists sent and received friend requests for the authenticated user.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    node_id = account.get("sub")

    try:
        from services.friend_request_service import list_requests

        result = await list_requests(db, node_id)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error listing friend requests")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def send_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/requests/{user_id}  (JWT auth required)

    Request body (optional)::

        {
            "message": "Let's be friends!",
            "permissions": ["chat"]
        }

    Sends a friend request to the specified user.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    to_id = request.match_info["user_id"]
    from_id = account.get("sub")

    # Parse optional body
    message = None
    permissions = None

    try:
        body = await request.json()
        message = body.get("message")
        permissions = body.get("permissions")
    except Exception:
        # Body is optional for this endpoint
        pass

    try:
        from services.friend_request_service import send_request

        result = await send_request(db, from_id, to_id, message, permissions)
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error sending friend request")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def accept_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/requests/{request_id}/accept  (JWT auth required)

    Request body (optional)::

        {
            "permissions": ["chat", "file"]
        }

    Accepts a friend request and creates a bidirectional friendship.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    request_id = request.match_info["request_id"]

    # Parse optional permissions
    permissions = None
    try:
        body = await request.json()
        permissions = body.get("permissions")
    except Exception:
        pass

    try:
        from services.friend_request_service import accept_request

        result = await accept_request(db, request_id, permissions)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error accepting friend request")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def reject_friend_request(request: web.Request) -> web.Response:
    """POST /api/v1/friends/requests/{request_id}/reject  (JWT auth required)

    Rejects a friend request.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    request_id = request.match_info["request_id"]

    try:
        from services.friend_request_service import reject_request

        result = await reject_request(db, request_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error rejecting friend request")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1/friends") -> None:
    """Register all friend routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all friend routes. Defaults to ``/api/v1/friends``.
    """
    app.router.add_get(prefix + "/", get_friends_list)
    app.router.add_delete(prefix + "/{friend_id}", remove_friend)
    app.router.add_get(prefix + "/{friend_id}/permissions", get_friend_permissions)
    app.router.add_put(prefix + "/{friend_id}/permissions", update_friend_permissions)
    app.router.add_get(prefix + "/requests", list_friend_requests)
    app.router.add_post(prefix + "/requests/{user_id}", send_friend_request)
    app.router.add_post(prefix + "/requests/{request_id}/accept", accept_friend_request)
    app.router.add_post(prefix + "/requests/{request_id}/reject", reject_friend_request)

    logger.info("Friends routes registered under %s", prefix)
