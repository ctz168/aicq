"""
AICQ Python Client
====================
Encrypted chat client for the AICQ system.

Usage as a library::

    from client import AICQClient

    client = AICQClient()
    await client.initialize()
    # ... use client.chat, client.friends, etc.
    await client.destroy()

Usage as a CLI::

    python3 -m client
"""

from .client import AICQClient

__all__ = ["AICQClient"]
