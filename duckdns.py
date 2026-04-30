"""
AICQ DuckDNS Module
====================
Dynamic DNS management via DuckDNS, adapted from the ctz168/fund project.

Provides:
- Configuration persistence (duckdns_config.json)
- Public & local IP address detection (cross-platform)
- Periodic DuckDNS record updates as a background task
- Admin API handlers for configuration and on-demand updates
"""

from __future__ import annotations

import asyncio
import json
import logging
import platform
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import web

from config import Config

logger = logging.getLogger("aicq.duckdns")

# ─── Configuration file handling ────────────────────────────────────────

_DEFAULT_CONFIG: Dict[str, str] = {
    "domain": "myaicq",
    "token": "",
}

_CONFIG_PATH: Path = Path(Config.DUCKDNS_CONFIG_FILE)


def load_config() -> Dict[str, str]:
    """Load DuckDNS configuration from the JSON config file.

    Merges file contents with defaults so that new keys are always
    present even if the file is from an older version.

    Returns
    -------
    dict
        Keys: ``domain``, ``token``.
    """
    config = dict(_DEFAULT_CONFIG)
    try:
        if _CONFIG_PATH.is_file():
            with open(_CONFIG_PATH, "r", encoding="utf-8") as fh:
                file_data = json.load(fh)
            if isinstance(file_data, dict):
                config.update(file_data)
    except (json.JSONDecodeError, OSError, TypeError) as exc:
        logger.warning("Failed to load DuckDNS config from %s: %s", _CONFIG_PATH, exc)
    return config


def save_config(domain: str, token: str) -> Dict[str, str]:
    """Persist DuckDNS configuration to the JSON config file.

    Parameters
    ----------
    domain : str
        DuckDNS subdomain (e.g. ``"myaicq"`` — without ``.duckdns.org``).
    token : str
        DuckDNS account token.

    Returns
    -------
    dict
        The saved configuration.
    """
    config = {"domain": domain, "token": token}
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as fh:
            json.dump(config, fh, indent=2, ensure_ascii=False)
        logger.info("DuckDNS config saved to %s", _CONFIG_PATH)
    except OSError as exc:
        logger.error("Failed to save DuckDNS config to %s: %s", _CONFIG_PATH, exc)
    return config


# ─── IP Detection ───────────────────────────────────────────────────────


async def get_public_ipv4() -> Optional[str]:
    """Fetch the current public IPv4 address from ipify.

    Returns ``None`` on failure.
    """
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get("https://api.ipify.org") as resp:
                if resp.status == 200:
                    ip = (await resp.text()).strip()
                    # Basic validation
                    if ip and _is_ipv4(ip):
                        return ip
                logger.warning("ipify IPv4 returned status %d", resp.status)
    except Exception as exc:
        logger.warning("Failed to fetch public IPv4: %s", exc)
    return None


async def get_public_ipv6() -> Optional[str]:
    """Fetch the current public IPv6 address from ipify.

    Returns ``None`` on failure.
    """
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get("https://api6.ipify.org") as resp:
                if resp.status == 200:
                    ip = (await resp.text()).strip()
                    if ip and _is_ipv6(ip):
                        return ip
                logger.warning("ipify IPv6 returned status %d", resp.status)
    except Exception as exc:
        logger.warning("Failed to fetch public IPv6: %s", exc)
    return None


def get_lan_ipv4_addresses() -> List[str]:
    """Enumerate local LAN IPv4 addresses across all network interfaces.

    Uses ``socket.getaddrinfo`` as the primary method. Falls back to a
    subprocess call on platforms where the socket method is insufficient.

    Returns
    -------
    list[str]
        Unique LAN IPv4 addresses (excluding loopback ``127.x.x.x``).
    """
    addresses: List[str] = []

    # Primary: socket.getaddrinfo
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in addresses:
                addresses.append(ip)
    except Exception as exc:
        logger.debug("socket.getaddrinfo failed for LAN IPv4: %s", exc)

    # Fallback: connect trick (gets the default route's source IP)
    if not addresses:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                # Connect to a public DNS — doesn't actually send packets
                s.settimeout(2)
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                if ip and not ip.startswith("127."):
                    addresses.append(ip)
        except Exception as exc:
            logger.debug("Connect-trick failed for LAN IPv4: %s", exc)

    # Platform-specific fallback via subprocess
    if not addresses:
        addresses = _subprocess_lan_ipv4()

    return addresses


def get_global_ipv6_addresses() -> List[str]:
    """Enumerate local global-scope IPv6 addresses across all interfaces.

    Uses ``socket.getaddrinfo`` as the primary method, with a subprocess
    fallback.

    Returns
    -------
    list[str]
        Unique global IPv6 addresses (excluding link-local ``fe80::`` and
        loopback ``::1``).
    """
    addresses: List[str] = []

    # Primary: socket.getaddrinfo
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET6):
            ip = info[4][0]
            # Remove scope ID (e.g. "fe80::1%eth0" → "fe80::1")
            if "%" in ip:
                ip = ip.split("%")[0]
            if (
                ip
                and not ip.startswith("fe80:")
                and ip != "::1"
                and ip not in addresses
            ):
                addresses.append(ip)
    except Exception as exc:
        logger.debug("socket.getaddrinfo failed for global IPv6: %s", exc)

    # Platform-specific fallback via subprocess
    if not addresses:
        addresses = _subprocess_global_ipv6()

    return addresses


# ─── Subprocess IP fallback helpers ────────────────────────────────────


def _subprocess_lan_ipv4() -> List[str]:
    """Attempt to find LAN IPv4 addresses via subprocess calls."""
    addresses: List[str] = []
    system = platform.system().lower()

    try:
        if system == "linux":
            result = subprocess.run(
                ["ip", "-4", "addr", "show"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("inet "):
                    ip = stripped.split()[1].split("/")[0]
                    if not ip.startswith("127.") and ip not in addresses:
                        addresses.append(ip)

        elif system == "darwin":
            result = subprocess.run(
                ["ifconfig"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("inet "):
                    ip = stripped.split()[1]
                    if not ip.startswith("127.") and ip not in addresses:
                        addresses.append(ip)

        elif system == "windows":
            result = subprocess.run(
                ["ipconfig"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("IPv4 Address"):
                    # "IPv4 Address. . . . . . . . . . . : 192.168.1.5"
                    ip = stripped.split(":")[-1].strip()
                    if not ip.startswith("127.") and ip not in addresses:
                        addresses.append(ip)
    except (subprocess.SubprocessError, OSError) as exc:
        logger.debug("Subprocess LAN IPv4 detection failed: %s", exc)

    return addresses


def _subprocess_global_ipv6() -> List[str]:
    """Attempt to find global IPv6 addresses via subprocess calls."""
    addresses: List[str] = []
    system = platform.system().lower()

    try:
        if system == "linux":
            result = subprocess.run(
                ["ip", "-6", "addr", "show"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("inet6 "):
                    ip = stripped.split()[1].split("/")[0]
                    if (
                        not ip.startswith("fe80:")
                        and ip != "::1"
                        and ip not in addresses
                    ):
                        addresses.append(ip)

        elif system == "darwin":
            result = subprocess.run(
                ["ifconfig"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("inet6 ") and " prefixlen " in stripped:
                    ip = stripped.split()[1]
                    if "%" in ip:
                        ip = ip.split("%")[0]
                    if (
                        not ip.startswith("fe80:")
                        and ip != "::1"
                        and ip not in addresses
                    ):
                        addresses.append(ip)

        elif system == "windows":
            result = subprocess.run(
                ["ipconfig"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                stripped = line.strip()
                if stripped.startswith("IPv6 Address"):
                    ip = stripped.split(":")[-1].strip()
                    if (
                        not ip.startswith("fe80:")
                        and ip != "::1"
                        and ip not in addresses
                    ):
                        addresses.append(ip)
    except (subprocess.SubprocessError, OSError) as exc:
        logger.debug("Subprocess global IPv6 detection failed: %s", exc)

    return addresses


# ─── Validation helpers ────────────────────────────────────────────────


def _is_ipv4(ip: str) -> bool:
    """Return ``True`` if *ip* looks like a valid IPv4 address."""
    try:
        socket.inet_pton(socket.AF_INET, ip)
        return True
    except (OSError, socket.error):
        return False


def _is_ipv6(ip: str) -> bool:
    """Return ``True`` if *ip* looks like a valid IPv6 address."""
    try:
        socket.inet_pton(socket.AF_INET6, ip)
        return True
    except (OSError, socket.error):
        return False


# ─── DuckDNS Update ────────────────────────────────────────────────────


async def duckdns_do_update(domain: str, token: str) -> bool:
    """Update DuckDNS record with the current public IPv4 and IPv6.

    Parameters
    ----------
    domain : str
        DuckDNS subdomain (without ``.duckdns.org``).
    token : str
        DuckDNS account token.

    Returns
    -------
    bool
        ``True`` if DuckDNS responded with ``OK`` or ``NOCHANGE``,
        ``False`` on any failure.
    """
    if not domain or not token:
        logger.debug("DuckDNS update skipped: domain or token not configured")
        return False

    ipv4 = await get_public_ipv4()
    ipv6 = await get_public_ipv6()

    # Build the update URL
    params = {
        "domains": domain,
        "token": token,
        "verbose": "true",
    }
    if ipv4:
        params["ip"] = ipv4
    if ipv6:
        params["ipv6"] = ipv6

    url = "https://www.duckdns.org/update"

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.get(url, params=params) as resp:
                body = (await resp.text()).strip()
                logger.info(
                    "DuckDNS update response: status=%d body=%r (ipv4=%s ipv6=%s)",
                    resp.status,
                    body,
                    ipv4,
                    ipv6,
                )
                if resp.status == 200 and body.startswith(("OK", "NOCHANGE")):
                    return True
                logger.warning("DuckDNS update failed: %s", body)
    except Exception as exc:
        logger.error("DuckDNS update request failed: %s", exc)

    return False


# ─── Background Task ───────────────────────────────────────────────────


async def duckdns_update_task(app: web.Application) -> None:
    """Background task that updates DuckDNS every 3 minutes.

    Checks ``app['shutdown_event']`` every 30 seconds for graceful
    termination.  Skips updates if domain or token are not configured.

    This coroutine is designed to be spawned via ``asyncio.create_task``
    during the application startup hook.
    """
    UPDATE_INTERVAL = 180  # 3 minutes
    CHECK_INTERVAL = 30   # how often we check for shutdown

    logger.info("DuckDNS background task started")

    while True:
        # ── Wait for the update interval, checking shutdown every 30s ──
        elapsed = 0
        should_update = True

        while elapsed < UPDATE_INTERVAL:
            shutdown_event: Optional[asyncio.Event] = app.get("shutdown_event")
            if shutdown_event is not None and shutdown_event.is_set():
                logger.info("DuckDNS background task stopping (shutdown requested)")
                return

            await asyncio.sleep(CHECK_INTERVAL)
            elapsed += CHECK_INTERVAL

        # ── Perform the update ──────────────────────────────────────
        if not should_update:
            continue

        config = load_config()
        domain = config.get("domain", "")
        token = config.get("token", "")

        if not domain or not token:
            logger.debug("DuckDNS update skipped: domain/token not configured")
            continue

        success = await duckdns_do_update(domain, token)
        if success:
            logger.info("DuckDNS periodic update succeeded")
        else:
            logger.warning("DuckDNS periodic update failed")


# ─── Admin API Handlers ────────────────────────────────────────────────


async def api_get_duckdns_config(request: web.Request) -> web.Response:
    """GET /api/v1/admin/duckdns — Return current DuckDNS config + IPs.

    Returns JSON::

        {
            "domain": "myaicq",
            "token": "abc...xyz",
            "public_ipv4": "1.2.3.4" | null,
            "public_ipv6": "2001:db8::1" | null,
            "lan_ipv4": ["192.168.1.5"],
            "global_ipv6": []
        }
    """
    config = load_config()

    # Fetch current IPs (run concurrently)
    ipv4, ipv6 = await asyncio.gather(
        get_public_ipv4(),
        get_public_ipv6(),
    )
    lan_ipv4 = get_lan_ipv4_addresses()
    global_ipv6 = get_global_ipv6_addresses()

    result = {
        "domain": config.get("domain", ""),
        "token": config.get("token", ""),
        "public_ipv4": ipv4,
        "public_ipv6": ipv6,
        "lan_ipv4": lan_ipv4,
        "global_ipv6": global_ipv6,
    }

    return web.json_response(result)


async def api_save_duckdns_config(request: web.Request) -> web.Response:
    """POST /api/v1/admin/duckdns — Save DuckDNS domain and token.

    Expects JSON body::

        {"domain": "myaicq", "token": "secret-token"}

    Returns the saved config plus current IPs.
    """
    try:
        data = await request.json()
    except (json.JSONDecodeError, TypeError):
        return web.json_response(
            {"error": "Invalid JSON body"}, status=400,
        )

    domain = str(data.get("domain", "")).strip()
    token = str(data.get("token", "")).strip()

    if not domain:
        return web.json_response(
            {"error": "domain is required"}, status=400,
        )

    saved = save_config(domain, token)

    # Return the saved config with current IPs
    ipv4, ipv6 = await asyncio.gather(
        get_public_ipv4(),
        get_public_ipv6(),
    )

    return web.json_response({
        "domain": saved["domain"],
        "token": saved["token"],
        "public_ipv4": ipv4,
        "public_ipv6": ipv6,
        "message": "DuckDNS configuration saved",
    })


async def api_update_duckdns_now(request: web.Request) -> web.Response:
    """POST /api/v1/admin/duckdns/update — Trigger an immediate DuckDNS update.

    Reads the current config and performs the update.  Returns success
    or failure status.
    """
    config = load_config()
    domain = config.get("domain", "")
    token = config.get("token", "")

    if not domain or not token:
        return web.json_response(
            {"error": "DuckDNS domain and token must be configured first"},
            status=400,
        )

    success = await duckdns_do_update(domain, token)

    if success:
        ipv4, ipv6 = await asyncio.gather(
            get_public_ipv4(),
            get_public_ipv6(),
        )
        return web.json_response({
            "success": True,
            "message": "DuckDNS update succeeded",
            "ipv4": ipv4,
            "ipv6": ipv6,
        })
    else:
        return web.json_response({
            "success": False,
            "message": "DuckDNS update failed — check logs for details",
        }, status=502)


# ─── Route Setup ───────────────────────────────────────────────────────


def setup_duckdns_routes(app: web.Application) -> None:
    """Register DuckDNS admin API routes on the application.

    All routes are prefixed with ``/api/v1/admin/duckdns``.
    """
    prefix = "/api/v1/admin/duckdns"

    app.router.add_get(prefix, api_get_duckdns_config)
    app.router.add_post(prefix, api_save_duckdns_config)
    app.router.add_post(f"{prefix}/update", api_update_duckdns_now)

    logger.debug("DuckDNS routes registered under %s", prefix)
