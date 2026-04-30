"""
AICQ Admin Routes
===================
Admin panel route handlers: initialisation, authentication, dashboard
statistics, node/account management, runtime configuration, blacklist,
service control, and database inspection.

All routes are prefixed with ``/api/v1/admin``.
"""

from __future__ import annotations

import logging
import os
import signal
import sqlite3
from typing import Any, Dict, List, Optional

from aiohttp import web

from db import DatabaseManager, json_list, json_serialize, iso_now, cleanup_expired
from routes.middleware import (
    error_response,
    get_db,
    json_response,
)

logger = logging.getLogger("aicq.admin_routes")


# ─── Setup & Authentication (no auth required) ──────────────────────────


async def setup_status(request: web.Request) -> web.Response:
    """GET /api/v1/admin/setup-status  (no auth)

    Returns whether the admin account has been initialised.
    """
    db = get_db(request)

    try:
        from services.admin_service import is_initialized

        initialized = await is_initialized(db)
        return json_response({"initialized": initialized}, status=200)
    except Exception as exc:
        logger.exception("Error checking setup status")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def admin_init(request: web.Request) -> web.Response:
    """POST /api/v1/admin/init  (no auth)

    First-time admin setup. Sets the admin password and returns a JWT.

    Request body::

        {
            "password": "admin-secret"
        }
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    password = body.get("password")

    if not password:
        return error_response(
            "Missing required field: password",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.admin_service import init_admin

        result = await init_admin(db, password)
        return json_response(result, status=201)
    except RuntimeError as exc:
        return error_response(str(exc), status=409, code="ALREADY_INITIALIZED")
    except Exception as exc:
        logger.exception("Error initialising admin")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def admin_login(request: web.Request) -> web.Response:
    """POST /api/v1/admin/login  (no auth)

    Authenticates the admin with a password and returns a JWT.

    Request body::

        {
            "password": "admin-secret"
        }
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    password = body.get("password")

    if not password:
        return error_response(
            "Missing required field: password",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.admin_service import login_admin

        result = await login_admin(db, password)
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=401, code="INVALID_CREDENTIALS")
    except Exception as exc:
        logger.exception("Error during admin login")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Dashboard Stats (admin auth required) ──────────────────────────────


async def get_stats(request: web.Request) -> web.Response:
    """GET /api/v1/admin/stats  (admin auth required)

    Returns dashboard statistics.
    """
    db = get_db(request)

    try:
        from services.admin_service import get_stats

        result = await get_stats(db)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting admin stats")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Node Management ────────────────────────────────────────────────────


async def list_nodes(request: web.Request) -> web.Response:
    """GET /api/v1/admin/nodes  (admin auth required)

    Query parameters::

        ?page=1           // optional, default 1
        &per_page=20      // optional, default 20
        &search=keyword   // optional

    Returns a paginated list of nodes.
    """
    db = get_db(request)

    # Parse query parameters
    try:
        page = int(request.query.get("page", "1"))
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = int(request.query.get("per_page", "20"))
    except (ValueError, TypeError):
        per_page = 20

    search = request.query.get("search")

    try:
        from services.admin_service import list_nodes as _list_nodes

        result = await _list_nodes(db, page, per_page, search)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error listing nodes")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_node(request: web.Request) -> web.Response:
    """GET /api/v1/admin/nodes/{id}  (admin auth required)

    Returns node detail by ID.
    """
    db = get_db(request)
    node_id = request.match_info["id"]

    try:
        from services.admin_service import get_node as _get_node

        result = await _get_node(db, node_id)
        if result is None:
            return error_response("Node not found", status=404, code="NOT_FOUND")
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting node")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Account Management ─────────────────────────────────────────────────


async def list_accounts(request: web.Request) -> web.Response:
    """GET /api/v1/admin/accounts  (admin auth required)

    Query parameters::

        ?page=1           // optional, default 1
        &per_page=20      // optional, default 20
        &search=keyword   // optional

    Returns a paginated list of accounts.
    """
    db = get_db(request)

    try:
        page = int(request.query.get("page", "1"))
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = int(request.query.get("per_page", "20"))
    except (ValueError, TypeError):
        per_page = 20

    search = request.query.get("search")

    try:
        from services.admin_service import list_accounts

        result = await list_accounts(db, page, per_page, search)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error listing accounts")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def create_account(request: web.Request) -> web.Response:
    """POST /api/v1/admin/accounts  (admin auth required)

    Request body (human)::

        {
            "type": "human",
            "email": "user@example.com",
            "password": "secret",
            "displayName": "Alice",
            "publicKey": "abcd1234...",
            "phone": "+1234567890"       // optional
        }

    Request body (ai)::

        {
            "type": "ai",
            "agentName": "GPT-4 Bot",
            "publicKey": "abcd1234..."
        }
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    try:
        from services.admin_service import create_account as _create_account

        result = await _create_account(db, body)
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error creating account")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def get_account(request: web.Request) -> web.Response:
    """GET /api/v1/admin/accounts/{id}  (admin auth required)

    Returns account detail by ID.
    """
    db = get_db(request)
    account_id = request.match_info["id"]

    try:
        from services.account_service import get_account as _get_account

        result = await _get_account(db, account_id)
        if result is None:
            return error_response("Account not found", status=404, code="NOT_FOUND")
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting account")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def update_account(request: web.Request) -> web.Response:
    """PUT /api/v1/admin/accounts/{id}  (admin auth required)

    Request body (partial update)::

        {
            "displayName": "New Name",
            "status": "active",
            "maxFriends": 300
        }
    """
    db = get_db(request)
    account_id = request.match_info["id"]

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    try:
        from services.admin_service import update_account as _update_account

        result = await _update_account(db, account_id, body)
        if result is None:
            return error_response("Account not found", status=404, code="NOT_FOUND")
        return json_response(result, status=200)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error updating account")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def delete_account(request: web.Request) -> web.Response:
    """DELETE /api/v1/admin/accounts/{id}  (admin auth required)

    Deletes an account and all related data.
    """
    db = get_db(request)
    account_id = request.match_info["id"]

    try:
        from services.admin_service import delete_account as _delete_account

        deleted = await _delete_account(db, account_id)
        if not deleted:
            return error_response("Account not found", status=404, code="NOT_FOUND")
        return json_response({"deleted": True, "accountId": account_id}, status=200)
    except Exception as exc:
        logger.exception("Error deleting account")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Runtime Configuration ──────────────────────────────────────────────


async def get_config(request: web.Request) -> web.Response:
    """GET /api/v1/admin/config  (admin auth required)

    Returns all runtime configuration (database-stored + live).
    """
    db = get_db(request)

    try:
        from services.admin_service import get_config as _get_config

        result = await _get_config(db)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting config")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def update_config(request: web.Request) -> web.Response:
    """PUT /api/v1/admin/config  (admin auth required)

    Request body (partial update)::

        {
            "MAX_FRIENDS": 300,
            "ALLOW_LOCALHOST": true
        }

    Only whitelisted keys are accepted.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    try:
        from services.admin_service import update_config as _update_config

        result = await _update_config(db, body)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error updating config")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Blacklist Management ───────────────────────────────────────────────


async def get_blacklist(request: web.Request) -> web.Response:
    """GET /api/v1/admin/blacklist  (admin auth required)

    Returns all blacklist entries with account info.
    """
    db = get_db(request)

    try:
        from services.admin_service import get_blacklist

        result = await get_blacklist(db)
        return json_response({"entries": result}, status=200)
    except Exception as exc:
        logger.exception("Error getting blacklist")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def add_to_blacklist(request: web.Request) -> web.Response:
    """POST /api/v1/admin/blacklist  (admin auth required)

    Request body::

        {
            "accountId": "abc123",
            "reason": "Spamming"       // optional
        }
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    account_id = body.get("accountId")
    reason = body.get("reason")

    if not account_id:
        return error_response(
            "Missing required field: accountId",
            status=400,
            code="MISSING_FIELDS",
        )

    try:
        from services.admin_service import add_to_blacklist

        result = await add_to_blacklist(db, account_id, reason)
        return json_response(result, status=201)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="VALIDATION_ERROR")
    except Exception as exc:
        logger.exception("Error adding to blacklist")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def remove_from_blacklist(request: web.Request) -> web.Response:
    """DELETE /api/v1/admin/blacklist/{id}  (admin auth required)

    Removes a blacklist entry and reactivates the account.
    """
    db = get_db(request)

    try:
        entry_id = int(request.match_info["id"])
    except (ValueError, TypeError):
        return error_response(
            "Invalid blacklist entry ID",
            status=400,
            code="INVALID_ID",
        )

    try:
        from services.admin_service import remove_from_blacklist

        removed = await remove_from_blacklist(db, entry_id)
        if not removed:
            return error_response(
                "Blacklist entry not found", status=404, code="NOT_FOUND"
            )
        return json_response({"removed": True, "entryId": entry_id}, status=200)
    except Exception as exc:
        logger.exception("Error removing from blacklist")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Service Control ────────────────────────────────────────────────────


async def service_status(request: web.Request) -> web.Response:
    """GET /api/v1/admin/service/status  (admin auth required)

    Returns the current service status.
    """
    try:
        from config import Config

        status_info: Dict[str, Any] = {
            "running": True,
            "port": Config.PORT,
            "host": Config.HOST,
            "debug": Config.DEBUG,
            "uptime": "N/A",  # Could be computed from process start time
        }

        # Get online nodes count from ws_handler if available
        ws_handler = request.app.get("ws_handler")
        if ws_handler is not None:
            online_count = ws_handler.get_online_count() if hasattr(ws_handler, "get_online_count") else 0
            status_info["online_nodes"] = online_count

        return json_response(status_info, status=200)
    except Exception as exc:
        logger.exception("Error getting service status")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def service_stop(request: web.Request) -> web.Response:
    """POST /api/v1/admin/service/stop  (admin auth required)

    Gracefully stops the server.
    """
    logger.warning("Server stop requested via admin API")

    # Schedule the shutdown so the response can be sent first
    import asyncio

    async def _shutdown():
        await asyncio.sleep(0.5)
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.create_task(_shutdown())

    return json_response({"stopping": True}, status=200)


async def service_restart(request: web.Request) -> web.Response:
    """POST /api/v1/admin/service/restart  (admin auth required)

    Restarts the server process.
    """
    logger.warning("Server restart requested via admin API")

    import asyncio

    async def _restart():
        await asyncio.sleep(0.5)
        os.kill(os.getpid(), signal.SIGHUP)

    try:
        asyncio.create_task(_restart())
    except Exception:
        # SIGHUP may not work on all platforms; fallback to stop
        async def _shutdown():
            await asyncio.sleep(0.5)
            os.kill(os.getpid(), signal.SIGTERM)

        asyncio.create_task(_shutdown())

    return json_response({"restarting": True}, status=200)


# ─── Database Inspection ────────────────────────────────────────────────


async def database_status(request: web.Request) -> web.Response:
    """GET /api/v1/admin/database/status  (admin auth required)

    Returns SQLite connection status and basic info.
    """
    db = get_db(request)

    try:
        # Test the connection
        row = await db.fetchone("SELECT sqlite_version() as version")
        version = row["version"] if row else "unknown"

        from config import Config

        result = {
            "connected": True,
            "sqlite_version": version,
            "database_path": Config.DB_PATH,
        }

        # Get database file size if possible
        try:
            db_size = os.path.getsize(Config.DB_PATH)
            result["file_size_bytes"] = db_size
            result["file_size_mb"] = round(db_size / (1024 * 1024), 2)
        except OSError:
            pass

        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting database status")
        return json_response({"connected": False, "error": str(exc)}, status=200)


async def database_tables(request: web.Request) -> web.Response:
    """GET /api/v1/admin/database/tables  (admin auth required)

    Returns a list of all SQLite tables.
    """
    db = get_db(request)

    try:
        rows = await db.fetchall(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row["name"] for row in rows]
        return json_response({"tables": tables}, status=200)
    except Exception as exc:
        logger.exception("Error listing database tables")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def database_table_detail(request: web.Request) -> web.Response:
    """GET /api/v1/admin/database/tables/{name}  (admin auth required)

    Returns column info and sample data for a specific table.
    """
    db = get_db(request)
    table_name = request.match_info["name"]

    # Validate table name to prevent SQL injection
    existing = await db.fetchone(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    if existing is None:
        return error_response("Table not found", status=404, code="NOT_FOUND")

    try:
        # Get column info using PRAGMA
        columns = await db.fetchall(f"PRAGMA table_info({table_name})")

        # Get row count
        count_row = await db.fetchone(f"SELECT COUNT(*) as cnt FROM {table_name}")
        row_count = count_row["cnt"] if count_row else 0

        # Get sample data (up to 10 rows)
        sample_rows = await db.fetchall(
            f"SELECT * FROM {table_name} LIMIT 10"
        )

        # Convert any non-serialisable types
        serialisable_sample = []
        for row in sample_rows:
            serialisable_row = {}
            for key, value in row.items():
                if isinstance(value, bytes):
                    serialisable_row[key] = value.hex()
                else:
                    serialisable_row[key] = value
            serialisable_sample.append(serialisable_row)

        result = {
            "table": table_name,
            "columns": columns,
            "row_count": row_count,
            "sample_data": serialisable_sample,
        }

        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error getting table detail for %s", table_name)
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


async def database_query(request: web.Request) -> web.Response:
    """POST /api/v1/admin/database/query  (admin auth required, read-only)

    Request body::

        {
            "query": "SELECT * FROM accounts LIMIT 10"
        }

    Executes a SELECT query (read-only). Any non-SELECT statement
    will be rejected.
    """
    db = get_db(request)

    try:
        body = await request.json()
    except Exception:
        return error_response("Invalid JSON body", status=400, code="INVALID_BODY")

    query = body.get("query", "").strip()

    if not query:
        return error_response(
            "Missing required field: query",
            status=400,
            code="MISSING_FIELDS",
        )

    # Security: only allow SELECT statements
    if not query.upper().startswith("SELECT"):
        return error_response(
            "Only SELECT queries are allowed",
            status=403,
            code="READ_ONLY",
        )

    # Block dangerous patterns
    upper_query = query.upper()
    dangerous_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH", "DETACH"]
    for keyword in dangerous_keywords:
        if keyword in upper_query.split():
            return error_response(
                f"Keyword '{keyword}' is not allowed in queries",
                status=403,
                code="READ_ONLY",
            )

    try:
        rows = await db.fetchall(query)

        # Convert any non-serialisable types
        serialisable_rows = []
        for row in rows:
            serialisable_row = {}
            for key, value in row.items():
                if isinstance(value, bytes):
                    serialisable_row[key] = value.hex()
                else:
                    serialisable_row[key] = value
            serialisable_rows.append(serialisable_row)

        return json_response({
            "rows": serialisable_rows,
            "count": len(serialisable_rows),
        }, status=200)
    except Exception as exc:
        return error_response(
            f"Query error: {str(exc)}",
            status=400,
            code="QUERY_ERROR",
        )


async def database_cleanup(request: web.Request) -> web.Response:
    """POST /api/v1/admin/database/cleanup  (admin auth required)

    Cleans up expired data from time-sensitive tables.
    """
    db = get_db(request)

    try:
        result = await cleanup_expired(db)
        return json_response(result, status=200)
    except Exception as exc:
        logger.exception("Error during database cleanup")
        return error_response("Internal server error", status=500, code="INTERNAL_ERROR")


# ─── Route Registration ─────────────────────────────────────────────────


def setup_routes(app: web.Application, prefix: str = "/api/v1/admin") -> None:
    """Register all admin routes on the given aiohttp application.

    Parameters
    ----------
    app:
        The aiohttp application instance.
    prefix:
        URL prefix for all admin routes. Defaults to ``/api/v1/admin``.
    """
    # Setup & auth (no auth required)
    app.router.add_get(prefix + "/setup-status", setup_status)
    app.router.add_post(prefix + "/init", admin_init)
    app.router.add_post(prefix + "/login", admin_login)

    # Dashboard
    app.router.add_get(prefix + "/stats", get_stats)

    # Node management
    app.router.add_get(prefix + "/nodes", list_nodes)
    app.router.add_get(prefix + "/nodes/{id}", get_node)

    # Account management
    app.router.add_get(prefix + "/accounts", list_accounts)
    app.router.add_post(prefix + "/accounts", create_account)
    app.router.add_get(prefix + "/accounts/{id}", get_account)
    app.router.add_put(prefix + "/accounts/{id}", update_account)
    app.router.add_delete(prefix + "/accounts/{id}", delete_account)

    # Configuration
    app.router.add_get(prefix + "/config", get_config)
    app.router.add_put(prefix + "/config", update_config)

    # Blacklist
    app.router.add_get(prefix + "/blacklist", get_blacklist)
    app.router.add_post(prefix + "/blacklist", add_to_blacklist)
    app.router.add_delete(prefix + "/blacklist/{id}", remove_from_blacklist)

    # Service control
    app.router.add_get(prefix + "/service/status", service_status)
    app.router.add_post(prefix + "/service/stop", service_stop)
    app.router.add_post(prefix + "/service/restart", service_restart)

    # Database inspection
    app.router.add_get(prefix + "/database/status", database_status)
    app.router.add_get(prefix + "/database/tables", database_tables)
    app.router.add_get(prefix + "/database/tables/{name}", database_table_detail)
    app.router.add_post(prefix + "/database/query", database_query)
    app.router.add_post(prefix + "/database/cleanup", database_cleanup)

    logger.info("Admin routes registered under %s", prefix)
