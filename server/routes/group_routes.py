"""
AICQ Group Routes
===================
Group route handlers: creation, listing, detail, membership management
(invite, kick, leave, disband), ownership transfer, role management,
muting, and message history.

All routes are prefixed with ``/api/v1/group``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from aiohttp import web

from routes.middleware import (
    error_response,
    get_db,
    json_response,
)

logger = logging.getLogger("aicq.group_routes")


# ─── Group CRUD ─────────────────────────────────────────────────────────


async def create_group(request: web.Request) -> web.Response:
    """POST /api/v1/group/create  (JWT auth required)

    Request body::

        {
            "name": "My Group",
            "description": "A test group",   // optional
            "maxMembers": 100                 // optional
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    name = body.get("name")
    description = body.get("description")
    max_members = body.get("maxMembers", 100)

    if not name:
        return error_response(
            "Missing required field: name",
            status=400,
            code="MISSING_FIELDS",
        )

    owner_id = account.get("sub")

    try:
        from services.group_service import create_group as _create_group

        result = await _create_group(db, owner_id, name, description, max_members)
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error creating group")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def list_groups(request: web.Request) -> web.Response:
    """GET /api/v1/group/list  (JWT auth required)

    Returns all groups the authenticated user is a member of.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    account_id = account.get("sub")

    try:
        from services.group_service import list_groups as _list_groups

        groups = await _list_groups(db, account_id)
        return json_response({"groups": groups}, status=200)
    except Exception as exc:
        logger.exception("Error listing groups")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_group(request: web.Request) -> web.Response:
    """GET /api/v1/group/{group_id}  (JWT auth required)

    Returns group detail including members list.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]

    try:
        from services.group_service import get_group as _get_group

        group = await _get_group(db, group_id)
        if group is None:
            return error_response("Group not found", status=404, code="NOT_FOUND")
        return json_response(group, status=200)
    except Exception as exc:
        logger.exception("Error getting group")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def update_group(request: web.Request) -> web.Response:
    """PUT /api/v1/group/{group_id}  (JWT auth required)

    Request body::

        {
            "name": "Updated Name",          // optional
            "description": "New desc",       // optional
            "maxMembers": 200,               // optional
            "avatar": "url_to_avatar"        // optional
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    owner_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    try:
        from services.group_service import update_group as _update_group

        result = await _update_group(db, group_id, owner_id, body)
        if result is None:
            return error_response("Group not found", status=404, code="NOT_FOUND")
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error updating group")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def disband_group(request: web.Request) -> web.Response:
    """DELETE /api/v1/group/{group_id}  (JWT auth required)

    Disbands a group. Only the owner can disband.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    owner_id = account.get("sub")

    try:
        from services.group_service import disband_group as _disband_group

        deleted = await _disband_group(db, group_id, owner_id)
        if not deleted:
            return error_response("Group not found", status=404, code="NOT_FOUND")
        return json_response({"disbanded": True, "groupId": group_id}, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error disbanding group")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Membership Management ──────────────────────────────────────────────


async def invite_member(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/invite  (JWT auth required)

    Request body::

        {
            "accountId": "abc123"
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    inviter_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    account_id = body.get("accountId")

    if not account_id:
        return error_response(
            "Missing required field: accountId",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.group_service import invite_member as _invite_member

        result = await _invite_member(db, group_id, account_id, inviter_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error inviting member")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def kick_member(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/kick  (JWT auth required)

    Request body::

        {
            "accountId": "abc123"
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    kicker_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    account_id = body.get("accountId")

    if not account_id:
        return error_response(
            "Missing required field: accountId",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.group_service import kick_member as _kick_member

        kicked = await _kick_member(db, group_id, account_id, kicker_id)
        return json_response({"kicked": True, "accountId": account_id}, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error kicking member")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def leave_group(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/leave  (JWT auth required)

    The authenticated user leaves the group. Owners cannot leave;
    they must transfer ownership or disband.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    account_id = account.get("sub")

    try:
        from services.group_service import leave_group as _leave_group

        left = await _leave_group(db, group_id, account_id)
        return json_response({"left": True, "groupId": group_id}, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error leaving group")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def transfer_ownership(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/transfer  (JWT auth required)

    Request body::

        {
            "newOwnerId": "xyz789"
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    old_owner_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    new_owner_id = body.get("newOwnerId")

    if not new_owner_id:
        return error_response(
            "Missing required field: newOwnerId",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.group_service import transfer_ownership as _transfer_ownership

        result = await _transfer_ownership(db, group_id, old_owner_id, new_owner_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error transferring ownership")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def set_member_role(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/role  (JWT auth required)

    Request body::

        {
            "accountId": "abc123",
            "role": "admin"       // "admin" | "member"
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    setter_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    account_id = body.get("accountId")
    role = body.get("role")

    if not account_id or not role:
        return error_response(
            "Missing required fields: accountId, role",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.group_service import set_member_role as _set_member_role

        result = await _set_member_role(db, group_id, account_id, role, setter_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error setting member role")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def mute_member(request: web.Request) -> web.Response:
    """POST /api/v1/group/{group_id}/mute  (JWT auth required)

    Request body::

        {
            "accountId": "abc123",
            "muted": true
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]
    setter_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    account_id = body.get("accountId")
    muted = body.get("muted", True)

    if not account_id:
        return error_response(
            "Missing required field: accountId",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.group_service import mute_member as _mute_member

        result = await _mute_member(db, group_id, account_id, bool(muted), setter_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error muting member")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_group_messages(request: web.Request) -> web.Response:
    """GET /api/v1/group/{group_id}/messages  (JWT auth required)

    Query parameters::

        ?limit=50        // optional, default 50
        &before=msg_id   // optional, for cursor-based pagination

    Returns paginated message history for a group.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    group_id = request.match_info["group_id"]

    # Parse query parameters
    try:
        limit = int(request.query.get("limit", "50"))
    except (ValueError, TypeError):
        limit = 50

    before = request.query.get("before")

    try:
        from services.group_service import get_group_messages as _get_group_messages

        messages = await _get_group_messages(db, group_id, limit, before)
        return json_response({"messages": messages}, status=200)
    except Exception as exc:
        logger.exception("Error getting group messages")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1/group") -> None:
    """Register all group routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all group routes. Defaults to ``/api/v1/group``.
    """
    app.router.add_post(prefix + "/create", create_group)
    app.router.add_get(prefix + "/list", list_groups)
    app.router.add_get(prefix + "/{group_id}", get_group)
    app.router.add_put(prefix + "/{group_id}", update_group)
    app.router.add_delete(prefix + "/{group_id}", disband_group)
    app.router.add_post(prefix + "/{group_id}/invite", invite_member)
    app.router.add_post(prefix + "/{group_id}/kick", kick_member)
    app.router.add_post(prefix + "/{group_id}/leave", leave_group)
    app.router.add_post(prefix + "/{group_id}/transfer", transfer_ownership)
    app.router.add_post(prefix + "/{group_id}/role", set_member_role)
    app.router.add_post(prefix + "/{group_id}/mute", mute_member)
    app.router.add_get(prefix + "/{group_id}/messages", get_group_messages)

    logger.info("Group routes registered under %s", prefix)
