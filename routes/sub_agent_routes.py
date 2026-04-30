"""
AICQ Sub-Agent Routes
=======================
Sub-agent route handlers: starting sub-agents, providing input,
aborting, querying status, and listing by parent message.

All routes are prefixed with ``/api/v1/subagent``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from aiohttp import web

from routes.middleware import (
    error_response,
    get_db,
    json_response,
)

logger = logging.getLogger("aicq.sub_agent_routes")


# ─── Route Handlers ─────────────────────────────────────────────────────


async def start_sub_agent(request: web.Request) -> web.Response:
    """POST /api/v1/subagent/start  (JWT auth required)

    Request body::

        {
            "parentMessageId": "msg123",
            "task": "Search the web for...",
            "context": "Additional context..."    // optional
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

    parent_message_id = body.get("parentMessageId")
    task = body.get("task")
    context = body.get("context")

    if not parent_message_id or not task:
        return error_response(
            "Missing required fields: parentMessageId, task",
            status=400,
            code="MISSING_FIELDS",
        )

    owner_id = account.get("sub")

    try:
        from services.sub_agent_service import start_sub_agent as _start_sub_agent

        result = await _start_sub_agent(db, parent_message_id, task, context, owner_id)
        return json_response(result, status=201)
    except Exception as exc:
        logger.exception("Error starting sub-agent")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def send_input(request: web.Request) -> web.Response:
    """POST /api/v1/subagent/{id}/input  (JWT auth required)

    Request body::

        {
            "input": "User's response data"
        }

    Provides input to a sub-agent that is waiting for human input.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    sub_agent_id = request.match_info["id"]

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    input_data = body.get("input")

    if input_data is None:
        return error_response(
            "Missing required field: input",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.sub_agent_service import send_input as _send_input

        result = await _send_input(db, sub_agent_id, input_data)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error sending input to sub-agent")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def abort_sub_agent(request: web.Request) -> web.Response:
    """POST /api/v1/subagent/{id}/abort  (JWT auth required)

    Aborts a running or waiting sub-agent.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    sub_agent_id = request.match_info["id"]

    try:
        from services.sub_agent_service import abort_sub_agent as _abort_sub_agent

        result = await _abort_sub_agent(db, sub_agent_id)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error aborting sub-agent")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_sub_agent_status(request: web.Request) -> web.Response:
    """GET /api/v1/subagent/{id}/status  (JWT auth required)

    Returns the current status of a sub-agent.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    sub_agent_id = request.match_info["id"]

    try:
        from services.sub_agent_service import get_sub_agent as _get_sub_agent

        result = await _get_sub_agent(db, sub_agent_id)
        if result is None:
            return error_response(
                "Sub-agent not found", status=404, code="NOT_FOUND"
            )
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting sub-agent status")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_sub_agents_by_message(request: web.Request) -> web.Response:
    """GET /api/v1/subagent/by-message/{parent_message_id}  (JWT auth required)

    Returns all sub-agents associated with a parent message.
    """
    account = request.get("account")
    if not account:
        return error_response("Authentication required", status=401, code="AUTH_REQUIRED")

    db = get_db(request)
    parent_message_id = request.match_info["parent_message_id"]

    try:
        from services.sub_agent_service import get_sub_agents_by_message

        result = await get_sub_agents_by_message(db, parent_message_id)
        return json_response({"sub_agents": result}, status=200)
    except Exception as exc:
        logger.exception("Error getting sub-agents by message")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1/subagent") -> None:
    """Register all sub-agent routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all sub-agent routes. Defaults to ``/api/v1/subagent``.
    """
    app.router.add_post(prefix + "/start", start_sub_agent)
    app.router.add_post(prefix + "/{id}/input", send_input)
    app.router.add_post(prefix + "/{id}/abort", abort_sub_agent)
    app.router.add_get(prefix + "/{id}/status", get_sub_agent_status)
    app.router.add_get(prefix + "/by-message/{parent_message_id}", get_sub_agents_by_message)

    logger.info("Sub-agent routes registered under %s", prefix)
