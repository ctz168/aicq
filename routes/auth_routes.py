"""
AICQ Auth Routes
==================
Authentication route handlers: verification code generation, registration,
login (human + agent), challenge, and token refresh.

All routes are prefixed with ``/api/v1/auth``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from aiohttp import web

from routes.middleware import (
    error_response,
    get_db,
    json_response,
    auth_middleware,
)

logger = logging.getLogger("aicq.auth_routes")


# ─── Route Handlers ─────────────────────────────────────────────────────


async def send_code(request: web.Request) -> web.Response:
    """POST /api/v1/auth/send-code

    Request body::

        {
            "target": "user@example.com",
            "type": "email",          // "email" | "phone"
            "purpose": "register"     // "register" | "login" | "reset_password"
        }

    Generates a 6-digit verification code and sends it to the target.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    target = body.get("target")
    vtype = body.get("type")
    purpose = body.get("purpose")

    if not target or not vtype or not purpose:
        return error_response(
            "Missing required fields: target, type, purpose",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.verification_service import generate_code

        result = await generate_code(db, target, vtype, purpose)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error generating verification code")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


async def register(request: web.Request) -> web.Response:
    """POST /api/v1/auth/register

    Request body::

        {
            "email": "user@example.com",
            "phone": "+1234567890",       // optional
            "password": "secret123",
            "displayName": "Alice",
            "publicKey": "abcd1234...",
            "code": "123456"
        }

    Verifies the email code first, then registers the human account
    and returns account info + tokens.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    email = body.get("email")
    phone = body.get("phone")
    password = body.get("password")
    display_name = body.get("displayName", "")
    public_key = body.get("publicKey")
    code = body.get("code")

    if not email or not password or not public_key or not code:
        return error_response(
            "Missing required fields: email, password, publicKey, code",
            status=400,
            code="MISSING_FIELDS",
        )

    # Verify the code first
    try:
        from services.verification_service import verify_code

        verified = await verify_code(db, email, code, "register")
        if not verified:
            return error_response(
                "Invalid or expired verification code",
                status=400,
                code="INVALID_CODE",
            )
    except Exception as exc:
        logger.exception("Error verifying code during registration")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )

    # Register the account
    try:
        from services.account_service import register_human, create_session

        account = await register_human(
            db, email, phone, password, display_name, public_key
        )

        # Create session tokens
        tokens = await create_session(db, account["id"])

        return json_response(
            {
                "account": account,
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
            },
            status=201,
        )
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error during registration")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


async def login(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login

    Request body::

        {
            "email": "user@example.com",
            "password": "secret123",
            "deviceInfo": "web-chrome"    // optional
        }

    Authenticates a human account and returns tokens.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    email = body.get("email")
    password = body.get("password")
    device_info = body.get("deviceInfo")

    if not email or not password:
        return error_response(
            "Missing required fields: email, password",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.account_service import login_human

        result = await login_human(db, email, password, device_info)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=401, code="INVALID_CREDENTIALS")
    except Exception as exc:
        logger.exception("Error during login")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


async def challenge(request: web.Request) -> web.Response:
    """POST /api/v1/auth/challenge

    Request body::

        {
            "publicKey": "abcd1234..."
        }

    Generates an Ed25519 challenge for agent authentication.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    public_key = body.get("publicKey")

    if not public_key:
        return error_response(
            "Missing required field: publicKey",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.account_service import challenge_agent

        result = await challenge_agent(db, public_key)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error generating challenge")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


async def login_agent(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login-agent

    Request body::

        {
            "publicKey": "abcd1234...",
            "signature": "signed_hex...",
            "challenge": "challenge_hex...",
            "deviceInfo": "agent-v1"      // optional
        }

    Authenticates an AI agent via Ed25519 challenge-response.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    public_key = body.get("publicKey")
    signature = body.get("signature")
    challenge = body.get("challenge")
    device_info = body.get("deviceInfo")

    if not public_key or not signature or not challenge:
        return error_response(
            "Missing required fields: publicKey, signature, challenge",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.account_service import login_agent as _login_agent

        result = await _login_agent(db, public_key, signature, challenge, device_info)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=401, code="INVALID_CREDENTIALS")
    except Exception as exc:
        logger.exception("Error during agent login")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


async def refresh(request: web.Request) -> web.Response:
    """POST /api/v1/auth/refresh

    Request body::

        {
            "refreshToken": "eyJ..."
        }

    Issues a new access/refresh token pair.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    refresh_token = body.get("refreshToken")

    if not refresh_token:
        return error_response(
            "Missing required field: refreshToken",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.account_service import refresh_token as _refresh_token

        result = await _refresh_token(db, refresh_token)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=401, code="INVALID_REFRESH_TOKEN")
    except Exception as exc:
        logger.exception("Error refreshing token")
        return error_response(
            "Internal server error", status=500, code="INTERNAL_ERROR"
        )


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1/auth") -> None:
    """Register all auth routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all auth routes. Defaults to ``/api/v1/auth``.
    """
    app.router.add_post(prefix + "/send-code", send_code)
    app.router.add_post(prefix + "/register", register)
    app.router.add_post(prefix + "/login", login)
    app.router.add_post(prefix + "/challenge", challenge)
    app.router.add_post(prefix + "/login-agent", login_agent)
    app.router.add_post(prefix + "/refresh", refresh)

    logger.info("Auth routes registered under %s", prefix)
