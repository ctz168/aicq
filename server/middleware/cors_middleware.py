"""
AICQ CORS Middleware
====================
Cross-Origin Resource Sharing middleware for the aiohttp server.

Adds permissive CORS headers to every response and handles OPTIONS
preflight requests, enabling browser-based clients and admin panels
to interact with the API from any origin.

Usage::

    from middleware.cors_middleware import cors_middleware

    app = web.Application(middlewares=[cors_middleware])
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from aiohttp import web

logger = logging.getLogger("aicq.cors")

# ─── Allowed values ─────────────────────────────────────────────────────

_ALLOW_ORIGIN = "*"
_ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS"
_ALLOW_HEADERS = "Content-Type, Authorization"
_MAX_AGE = "86400"  # 24 hours — how long browsers may cache preflight

# ─── Handler type alias ────────────────────────────────────────────────

Handler = Callable[[web.Request], Awaitable[web.StreamResponse]]

# ─── CORS Headers ──────────────────────────────────────────────────────

_CORS_HEADERS: dict[str, str] = {
    "Access-Control-Allow-Origin": _ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": _ALLOW_METHODS,
    "Access-Control-Allow-Headers": _ALLOW_HEADERS,
    "Access-Control-Max-Age": _MAX_AGE,
}


def _add_cors_headers(response: web.StreamResponse) -> None:
    """Attach CORS headers to *response* if they are not already present."""
    for key, value in _CORS_HEADERS.items():
        if key not in response.headers:
            response.headers[key] = value


# ─── Middleware factory ────────────────────────────────────────────────


@web.middleware
async def cors_middleware(
    request: web.Request,
    handler: Handler,
) -> web.StreamResponse:
    """aiohttp middleware that adds CORS headers to every response.

    For OPTIONS preflight requests, returns a 204 No Content immediately
    with the full set of CORS headers — no handler is invoked.

    For all other methods, delegates to the real handler and injects
    CORS headers into the response before returning it.
    """
    # ── Handle preflight ────────────────────────────────────────────
    if request.method == "OPTIONS":
        response = web.Response(status=204)
        _add_cors_headers(response)
        logger.debug(
            "CORS preflight: %s %s", request.method, request.path
        )
        return response

    # ── Normal request ──────────────────────────────────────────────
    try:
        response = await handler(request)
    except web.HTTPException as exc:
        # Even error responses need CORS headers so the client can
        # read the body (e.g. 401 / 403 JSON payloads).
        _add_cors_headers(exc)
        raise

    _add_cors_headers(response)
    return response
