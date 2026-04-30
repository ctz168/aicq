"""
AICQ Core Routes
==================
Core API route handlers: node registration, temp numbers, handshakes,
broadcast messaging, file transfers, task-plan/sub-agent/agent-execution
WebSocket push endpoints, and agent execution abort proxy.

All routes are prefixed with ``/api/v1``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from aiohttp import web

from db import json_serialize, json_list, iso_now
from routes.middleware import (
    auth_middleware,
    error_response,
    get_db,
    get_ws_handler,
    json_response,
)

logger = logging.getLogger("aicq.core_routes")


# ─── Node Registration ──────────────────────────────────────────────────


async def node_register(request: web.Request) -> web.Response:
    """POST /api/v1/node/register  (JWT auth required)

    Request body::

        {
            "publicKey": "abcd1234..."
        }

    Registers or updates the calling account as a node in the nodes table.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    node_id = account.get("sub")
    public_key = body.get("publicKey", "")

    if not node_id:
        return error_response("Invalid token: missing subject", status=401, code="INVALID_TOKEN")

    now = iso_now()

    await db.execute(
        """
        INSERT INTO nodes (id, public_key, last_seen, socket_id, friend_count, friends)
        VALUES (?, ?, ?, '', 0, '[]')
        ON CONFLICT(id) DO UPDATE SET
            public_key = excluded.public_key,
            last_seen = excluded.last_seen
        """,
        (node_id, public_key, now, public_key, now),
    )

    node = await db.fetchone("SELECT * FROM nodes WHERE id = ?", (node_id,))
    if node:
        node["friends"] = json_list(node.get("friends"))

    return json_response(node, status=200)


# ─── Temp Numbers ───────────────────────────────────────────────────────


async def temp_number_request(request: web.Request) -> web.Response:
    """POST /api/v1/temp-number/request  (JWT auth required)

    Generates a new temporary 6-digit number for the authenticated node.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    node_id = account.get("sub")

    try:
        from services.temp_number_service import generate

        result = await generate(db, node_id)
        return json_response(result, status=201)
    except Exception as exc:
        logger.exception("Error generating temp number")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def temp_number_resolve(request: web.Request) -> web.Response:
    """GET /api/v1/temp-number/{number}  (no auth)

    Resolves a temporary number to the associated node info.
    """
    db = get_db(request)
    number = request.match_info["number"]

    try:
        from services.temp_number_service import resolve

        result = await resolve(db, number)
        if result is None:
            return error_response(
                "Invalid or expired temp number", status=404, code="NOT_FOUND"
            )
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error resolving temp number")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def temp_number_revoke(request: web.Request) -> web.Response:
    """DELETE /api/v1/temp-number/{number}  (JWT auth required)

    Revokes a temporary number owned by the authenticated node.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    number = request.match_info["number"]
    node_id = account.get("sub")

    try:
        from services.temp_number_service import revoke

        deleted = await revoke(db, number, node_id)
        if not deleted:
            return error_response(
                "Temp number not found", status=404, code="NOT_FOUND"
            )
        return json_response({"revoked": True}, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=403, code="FORBIDDEN")
    except Exception as exc:
        logger.exception("Error revoking temp number")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Handshake ──────────────────────────────────────────────────────────


async def handshake_initiate(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/initiate  (JWT auth required)

    Request body::

        {
            "targetTempNumber": "123456"
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

    target_temp_number = body.get("targetTempNumber")
    if not target_temp_number:
        return error_response(
            "Missing required field: targetTempNumber",
            status=400,
            code="MISSING_FIELDS",
        )

    requester_id = account.get("sub")

    try:
        from services.handshake_service import initiate

        result = await initiate(db, requester_id, target_temp_number)
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error initiating handshake")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def handshake_respond(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/respond  (JWT auth required)

    Request body::

        {
            "sessionId": "abc123",
            "responseData": "..."
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

    session_id = body.get("sessionId")
    response_data = body.get("responseData")

    if not session_id or response_data is None:
        return error_response(
            "Missing required fields: sessionId, responseData",
            status=400,
            code="MISSING_FIELDS",
        )

    responder_id = account.get("sub")

    try:
        from services.handshake_service import respond

        result = await respond(db, session_id, responder_id, response_data)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error responding to handshake")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def handshake_confirm(request: web.Request) -> web.Response:
    """POST /api/v1/handshake/confirm  (JWT auth required)

    Request body::

        {
            "sessionId": "abc123",
            "confirmData": "..."
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

    session_id = body.get("sessionId")
    confirm_data = body.get("confirmData")

    if not session_id or confirm_data is None:
        return error_response(
            "Missing required fields: sessionId, confirmData",
            status=400,
            code="MISSING_FIELDS",
        )

    confirmer_id = account.get("sub")

    try:
        from services.handshake_service import confirm

        result = await confirm(db, session_id, confirmer_id, confirm_data)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error confirming handshake")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Broadcast ──────────────────────────────────────────────────────────


async def broadcast(request: web.Request) -> web.Response:
    """POST /api/v1/broadcast  (JWT auth required, max 50 friends)

    Request body::

        {
            "message": "Hello everyone!",
            "payload": { ... }        // optional extra data
        }

    Sends a broadcast message to all online friends (max 50) via WebSocket.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    ws_handler = get_ws_handler(request)
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    message = body.get("message", "")
    payload = body.get("payload", {})

    # Get friends list
    from services.friendship_service import get_friends

    friends = await get_friends(db, node_id)

    # Limit to 50 friends
    friends = friends[:50]

    sent_count = 0
    for friend in friends:
        friend_id = friend["id"]
        relay_payload = {
            "text": message,
            **payload,
        }
        success = await ws_handler._online.get(friend_id) is not None
        if success:
            ws_state = ws_handler._online.get(friend_id)
            if ws_state and not ws_state.ws.closed:
                try:
                    await ws_state.ws.send_json({
                        "type": "broadcast",
                        "from": node_id,
                        "payload": relay_payload,
                    })
                    sent_count += 1
                except Exception:
                    pass

    return json_response({
        "sent": sent_count,
        "total_friends": len(friends),
    }, status=200)


# ─── File Transfer ──────────────────────────────────────────────────────


async def file_initiate(request: web.Request) -> web.Response:
    """POST /api/v1/file/initiate  (JWT auth required)

    Request body::

        {
            "receiverId": "abc123",
            "fileName": "document.pdf",
            "fileSize": 1048576,
            "fileHash": "sha256hex...",
            "totalChunks": 100,
            "chunkSize": 10240
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

    receiver_id = body.get("receiverId")
    file_name = body.get("fileName")
    file_size = body.get("fileSize", 0)
    file_hash = body.get("fileHash")
    total_chunks = body.get("totalChunks", 0)
    chunk_size = body.get("chunkSize", 0)

    if not receiver_id or not file_name or not file_hash:
        return error_response(
            "Missing required fields: receiverId, fileName, fileHash",
            status=400,
            code="MISSING_FIELDS",
        )

    sender_id = account.get("sub")

    try:
        from services.file_transfer_service import initiate_transfer

        result = await initiate_transfer(
            db, sender_id, receiver_id, file_name,
            file_size, file_hash, total_chunks, chunk_size,
        )
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error initiating file transfer")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def file_get(request: web.Request) -> web.Response:
    """GET /api/v1/file/{session_id}  (JWT auth required)

    Gets file transfer session details.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    session_id = request.match_info["session_id"]

    try:
        from services.file_transfer_service import get_transfer

        result = await get_transfer(db, session_id)
        if result is None:
            return error_response(
                "File transfer not found", status=404, code="NOT_FOUND"
            )

        # Verify the caller is either sender or receiver
        caller_id = account.get("sub")
        if result.get("sender_id") != caller_id and result.get("receiver_id") != caller_id:
            return error_response(
                "Access denied", status=403, code="FORBIDDEN"
            )

        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting file transfer")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def file_chunk_update(request: web.Request) -> web.Response:
    """POST /api/v1/file/{session_id}/chunk

    Request body::

        {
            "chunksReceived": [0, 1, 2, 5, 8]
        }
    """
    db = get_db(request)
    session_id = request.match_info["session_id"]

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    chunks_received = body.get("chunksReceived", [])

    try:
        from services.file_transfer_service import update_chunks

        result = await update_chunks(db, session_id, chunks_received)
        if result is None:
            return error_response(
                "File transfer not found", status=404, code="NOT_FOUND"
            )
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error updating file chunks")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def file_missing_chunks(request: web.Request) -> web.Response:
    """GET /api/v1/file/{session_id}/missing  (JWT auth required)

    Returns a list of missing chunk indices.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    session_id = request.match_info["session_id"]

    try:
        from services.file_transfer_service import get_missing_chunks

        result = await get_missing_chunks(db, session_id)
        return json_response({"missing_chunks": result}, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=404, code="NOT_FOUND")
    except Exception as exc:
        logger.exception("Error getting missing chunks")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── WebSocket Push Endpoints ───────────────────────────────────────────


async def task_plan_push(request: web.Request) -> web.Response:
    """POST /api/v1/task-plan/push  (JWT auth required)

    Pushes a task plan update to the caller's WebSocket connection.

    Request body::

        {
            "plan": { ... },
            "targetId": "node123"   // optional, defaults to self
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    ws_handler = get_ws_handler(request)
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    target_id = body.get("targetId", node_id)
    plan = body.get("plan", {})

    # Send via WebSocket if the target is online
    target_state = ws_handler._online.get(target_id)
    if target_state is not None and not target_state.ws.closed:
        try:
            await target_state.ws.send_json({
                "type": "task_plan_update",
                "from": node_id,
                "plan": plan,
            })
            return json_response({"pushed": True, "targetId": target_id}, status=200)
        except Exception:
            pass

    return json_response({"pushed": False, "targetId": target_id}, status=200)


async def subagent_progress_push(request: web.Request) -> web.Response:
    """POST /api/v1/subagent-progress/push  (JWT auth required)

    Pushes a sub-agent progress update via WebSocket.

    Request body::

        {
            "subAgentId": "abc123",
            "progress": { ... },
            "targetId": "node123"   // optional, defaults to self
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    ws_handler = get_ws_handler(request)
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    target_id = body.get("targetId", node_id)
    sub_agent_id = body.get("subAgentId", "")
    progress = body.get("progress", {})

    target_state = ws_handler._online.get(target_id)
    if target_state is not None and not target_state.ws.closed:
        try:
            await target_state.ws.send_json({
                "type": "subagent_progress",
                "from": node_id,
                "subAgentId": sub_agent_id,
                "progress": progress,
            })
            return json_response({"pushed": True, "targetId": target_id}, status=200)
        except Exception:
            pass

    return json_response({"pushed": False, "targetId": target_id}, status=200)


async def agent_execution_push(request: web.Request) -> web.Response:
    """POST /api/v1/agent-execution/push  (JWT auth required)

    Pushes an agent execution state update via WebSocket.

    Request body::

        {
            "executionId": "abc123",
            "state": { ... },
            "targetId": "node123"   // optional, defaults to self
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    ws_handler = get_ws_handler(request)
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    target_id = body.get("targetId", node_id)
    execution_id = body.get("executionId", "")
    state = body.get("state", {})

    target_state = ws_handler._online.get(target_id)
    if target_state is not None and not target_state.ws.closed:
        try:
            await target_state.ws.send_json({
                "type": "agent_execution_state",
                "from": node_id,
                "executionId": execution_id,
                "state": state,
            })
            return json_response({"pushed": True, "targetId": target_id}, status=200)
        except Exception:
            pass

    return json_response({"pushed": False, "targetId": target_id}, status=200)


async def agent_execution_abort(request: web.Request) -> web.Response:
    """POST /api/v1/agent-execution/abort  (JWT auth required)

    Proxies an abort request to the target agent's WebSocket connection.

    Request body::

        {
            "executionId": "abc123",
            "targetId": "agent_node_id"
        }
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    ws_handler = get_ws_handler(request)
    node_id = account.get("sub")

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    target_id = body.get("targetId")
    execution_id = body.get("executionId", "")

    if not target_id:
        return error_response(
            "Missing required field: targetId",
            status=400,
            code="MISSING_FIELDS",
        )

    # Send abort signal to target agent's WebSocket
    target_state = ws_handler._online.get(target_id)
    if target_state is not None and not target_state.ws.closed:
        try:
            await target_state.ws.send_json({
                "type": "agent_execution_abort",
                "from": node_id,
                "executionId": execution_id,
            })
            return json_response({"aborted": True, "targetId": target_id}, status=200)
        except Exception:
            pass

    return error_response(
        "Target agent is not online",
        status=404,
        code="TARGET_OFFLINE",
    )


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1") -> None:
    """Register all core routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all core routes. Defaults to ``/api/v1``.
    """
    # Node registration
    app.router.add_post(prefix + "/node/register", node_register)

    # Temp numbers
    app.router.add_post(prefix + "/temp-number/request", temp_number_request)
    app.router.add_get(prefix + "/temp-number/{number}", temp_number_resolve)
    app.router.add_delete(prefix + "/temp-number/{number}", temp_number_revoke)

    # Handshake
    app.router.add_post(prefix + "/handshake/initiate", handshake_initiate)
    app.router.add_post(prefix + "/handshake/respond", handshake_respond)
    app.router.add_post(prefix + "/handshake/confirm", handshake_confirm)

    # Broadcast
    app.router.add_post(prefix + "/broadcast", broadcast)

    # File transfer
    app.router.add_post(prefix + "/file/initiate", file_initiate)
    app.router.add_get(prefix + "/file/{session_id}", file_get)
    app.router.add_post(prefix + "/file/{session_id}/chunk", file_chunk_update)
    app.router.add_get(prefix + "/file/{session_id}/missing", file_missing_chunks)

    # WebSocket push endpoints
    app.router.add_post(prefix + "/task-plan/push", task_plan_push)
    app.router.add_post(prefix + "/subagent-progress/push", subagent_progress_push)
    app.router.add_post(prefix + "/agent-execution/push", agent_execution_push)
    app.router.add_post(prefix + "/agent-execution/abort", agent_execution_abort)

    logger.info("Core routes registered under %s", prefix)
