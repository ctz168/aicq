"""
AICQ Client Configuration
============================
Loads client settings from environment variables with sensible defaults.

Environment Variables
---------------------
AICQ_SERVER_URL : str
    Base URL of the AICQ server (default: ``https://aicq.online``).
AICQ_DATA_DIR : str
    Directory for persistent data storage (default: ``~/.aicq-client``).
AICQ_MAX_FRIENDS : int
    Maximum number of friends (default: ``200``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _env_str(key: str, default: str) -> str:
    """Read a string from the environment, falling back to *default*."""
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    """Read an integer from the environment, falling back to *default*."""
    raw = os.environ.get(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _derive_ws_url(server_url: str) -> str:
    """Derive the WebSocket URL from the server URL.

    ``https://`` → ``wss://``, ``http://`` → ``ws://``.
    """
    if server_url.startswith("https://"):
        return "wss://" + server_url[len("https://"):]
    elif server_url.startswith("http://"):
        return "ws://" + server_url[len("http://"):]
    else:
        # Assume secure if no scheme
        return "wss://" + server_url


@dataclass
class ClientConfig:
    """Client configuration, loaded from environment variables or overrides.

    Attributes
    ----------
    server_url : str
        Base URL of the AICQ server REST API.
    ws_url : str
        WebSocket URL for real-time communication (derived from *server_url*).
    max_friends : int
        Maximum number of friends this client will track.
    data_dir : Path
        Directory for storing the local SQLite database and other data.
    """

    server_url: str = field(
        default_factory=lambda: _env_str("AICQ_SERVER_URL", "https://aicq.online")
    )
    ws_url: str = field(default="")
    max_friends: int = field(
        default_factory=lambda: _env_int("AICQ_MAX_FRIENDS", 200)
    )
    data_dir: Path = field(
        default_factory=lambda: Path(
            _env_str("AICQ_DATA_DIR", str(Path.home() / ".aicq-client"))
        )
    )

    def __post_init__(self) -> None:
        """Derive ws_url from server_url if not explicitly set."""
        if not self.ws_url:
            self.ws_url = _derive_ws_url(self.server_url)
        if isinstance(self.data_dir, str):
            self.data_dir = Path(self.data_dir)

    @property
    def db_path(self) -> Path:
        """Full path to the client SQLite database file."""
        return self.data_dir / "client.db"

    @property
    def api_prefix(self) -> str:
        """The REST API prefix (``/api/v1``)."""
        return f"{self.server_url}/api/v1"

    @property
    def ws_endpoint(self) -> str:
        """The full WebSocket endpoint URL."""
        return f"{self.ws_url}/ws"


def load_config(**overrides) -> ClientConfig:
    """Create a :class:`ClientConfig` with optional field overrides.

    Parameters
    ----------
    **overrides
        Any valid :class:`ClientConfig` field name to override the
        default / env-var value.

    Returns
    -------
    ClientConfig
        The resolved configuration.
    """
    return ClientConfig(**overrides)
