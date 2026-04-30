"""
AICQ Sub-Agent Service
========================
Handles sub-agent lifecycle: starting, input provisioning, aborting,
and querying sub-agent status and results. Sub-agents are AI agents
spawned to handle sub-tasks within a parent message context.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, iso_now
from config import Config

logger = logging.getLogger("aicq.sub_agent_service")


async def start_sub_agent(
    db: DatabaseManager,
    parent_message_id: str,
    task: str,
    context: Optional[str] = None,
    owner_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new sub-agent with status='running'.

    Args:
        parent_message_id: The ID of the parent message that spawned this sub-agent.
        task: The task description for the sub-agent.
        context: Optional context data for the sub-agent.
        owner_id: The account ID that owns this sub-agent.

    Returns the created sub-agent record.
    """
    sub_agent_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO sub_agents (id, parent_message_id, task, context, status, output, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'running', '', ?, ?)
        """,
        (sub_agent_id, parent_message_id, task, context, now, now),
    )

    sub_agent = await get_sub_agent(db, sub_agent_id)
    logger.info("Sub-agent started: %s for message %s", sub_agent_id, parent_message_id)
    return sub_agent


async def send_input(
    db: DatabaseManager,
    sub_agent_id: str,
    input_data: str,
) -> Dict[str, Any]:
    """Provide input to a sub-agent that is waiting for human input.

    Updates status from 'waiting_human' to 'running' and appends the
    input data to the context.

    Raises ValueError if the sub-agent is not found or not in 'waiting_human' status.
    """
    sub_agent = await db.fetchone("SELECT * FROM sub_agents WHERE id = ?", (sub_agent_id,))
    if not sub_agent:
        raise ValueError("Sub-agent not found")

    if sub_agent["status"] != "waiting_human":
        raise ValueError(f"Sub-agent is not waiting for input (status: {sub_agent['status']})")

    now = iso_now()

    # Append input to existing context
    existing_context = sub_agent.get("context") or ""
    updated_context = existing_context + "\n" + input_data if existing_context else input_data

    await db.execute(
        """
        UPDATE sub_agents
        SET status = 'running', context = ?, updated_at = ?
        WHERE id = ?
        """,
        (updated_context, now, sub_agent_id),
    )

    sub_agent = await get_sub_agent(db, sub_agent_id)
    logger.info("Input sent to sub-agent: %s", sub_agent_id)
    return sub_agent


async def abort_sub_agent(
    db: DatabaseManager,
    sub_agent_id: str,
) -> Dict[str, Any]:
    """Abort a sub-agent.

    Sets status to 'error' with an abort message in the output.

    Raises ValueError if the sub-agent is not found or already completed.
    """
    sub_agent = await db.fetchone("SELECT * FROM sub_agents WHERE id = ?", (sub_agent_id,))
    if not sub_agent:
        raise ValueError("Sub-agent not found")

    if sub_agent["status"] in ("completed", "error"):
        raise ValueError(f"Cannot abort sub-agent in '{sub_agent['status']}' status")

    now = iso_now()
    await db.execute(
        """
        UPDATE sub_agents
        SET status = 'error', output = 'Aborted by user', updated_at = ?
        WHERE id = ?
        """,
        (now, sub_agent_id),
    )

    sub_agent = await get_sub_agent(db, sub_agent_id)
    logger.info("Sub-agent aborted: %s", sub_agent_id)
    return sub_agent


async def get_sub_agent(
    db: DatabaseManager,
    sub_agent_id: str,
) -> Optional[Dict[str, Any]]:
    """Get sub-agent info by ID. Returns None if not found."""
    sub_agent = await db.fetchone("SELECT * FROM sub_agents WHERE id = ?", (sub_agent_id,))
    return sub_agent


async def get_sub_agents_by_message(
    db: DatabaseManager,
    parent_message_id: str,
) -> List[Dict[str, Any]]:
    """List all sub-agents for a given parent message."""
    sub_agents = await db.fetchall(
        "SELECT * FROM sub_agents WHERE parent_message_id = ? ORDER BY created_at ASC",
        (parent_message_id,),
    )
    return sub_agents
