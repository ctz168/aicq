"""
AICQ Group Service
====================
Handles group creation, membership management, roles, muting,
and group messaging. Members are stored as a JSON array in groups.members_json.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from db import DatabaseManager, json_serialize, json_deserialize, json_list, iso_now
from config import Config

logger = logging.getLogger("aicq.group_service")


# ─── Member JSON Helpers ───────────────────────────────────────────────


def _make_member(
    account_id: str,
    role: str = "member",
    muted: bool = False,
    joined_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a member dict for members_json."""
    return {
        "id": account_id,
        "role": role,
        "muted": muted,
        "joined_at": joined_at or iso_now(),
    }


def _find_member(members: List[Dict[str, Any]], account_id: str) -> Optional[Dict[str, Any]]:
    """Find a member by account_id in the members list."""
    for m in members:
        if m["id"] == account_id:
            return m
    return None


def _remove_member(members: List[Dict[str, Any]], account_id: str) -> List[Dict[str, Any]]:
    """Remove a member by account_id from the members list."""
    return [m for m in members if m["id"] != account_id]


# ─── Group CRUD ────────────────────────────────────────────────────────


async def create_group(
    db: DatabaseManager,
    owner_id: str,
    name: str,
    description: Optional[str] = None,
    max_members: int = 100,
) -> Dict[str, Any]:
    """Create a new group with the owner as the first member.

    Returns the created group record.
    """
    # Verify owner exists
    owner = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (owner_id,))
    if not owner:
        raise ValueError("Owner account not found")

    # Check group limit per account
    existing_groups = await db.fetchall(
        "SELECT id FROM groups WHERE owner_id = ?",
        (owner_id,),
    )
    if len(existing_groups) >= Config.MAX_GROUPS_PER_ACCOUNT:
        raise ValueError("Account has reached the maximum number of groups")

    group_id = uuid.uuid4().hex
    now = iso_now()

    # Owner as first member
    owner_member = _make_member(owner_id, role="owner", joined_at=now)
    members_json = json_serialize([owner_member])

    await db.execute(
        """
        INSERT INTO groups (id, name, owner_id, members_json, created_at, updated_at, max_members, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (group_id, name, owner_id, members_json, now, now, max_members, description),
    )

    group = await get_group(db, group_id)
    logger.info("Group created: %s by %s", group_id, owner_id)
    return group


async def list_groups(
    db: DatabaseManager,
    account_id: str,
) -> List[Dict[str, Any]]:
    """List all groups that an account is a member of."""
    # We need to check the members_json for the account_id
    all_groups = await db.fetchall("SELECT * FROM groups ORDER BY updated_at DESC")

    result: List[Dict[str, Any]] = []
    for group in all_groups:
        members = json_deserialize(group.get("members_json"), default=[])
        if isinstance(members, list) and _find_member(members, account_id):
            group["members"] = members
            group.pop("members_json", None)
            result.append(group)

    return result


async def get_group(db: DatabaseManager, group_id: str) -> Optional[Dict[str, Any]]:
    """Get group detail by ID. Returns None if not found."""
    group = await db.fetchone("SELECT * FROM groups WHERE id = ?", (group_id,))
    if group is None:
        return None

    group["members"] = json_deserialize(group.get("members_json"), default=[])
    group.pop("members_json", None)
    return group


async def update_group(
    db: DatabaseManager,
    group_id: str,
    owner_id: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update group info. Only the owner can update.

    Allowed fields: name, description, max_members, avatar.
    """
    group = await get_group(db, group_id)
    if not group:
        raise ValueError("Group not found")

    if group["owner_id"] != owner_id:
        raise ValueError("Only the group owner can update the group")

    allowed_fields = {"name", "description", "max_members", "avatar"}
    updates: list[str] = []
    params: list[Any] = []

    for field, value in data.items():
        if field not in allowed_fields:
            continue
        updates.append(f"{field} = ?")
        params.append(value)

    if not updates:
        return group

    updates.append("updated_at = ?")
    params.append(iso_now())
    params.append(group_id)

    await db.execute(
        f"UPDATE groups SET {', '.join(updates)} WHERE id = ?",
        params,
    )

    return await get_group(db, group_id)


async def disband_group(
    db: DatabaseManager,
    group_id: str,
    owner_id: str,
) -> bool:
    """Delete a group. Only the owner can disband.

    Returns True if the group was deleted.
    """
    group = await get_group(db, group_id)
    if not group:
        raise ValueError("Group not found")

    if group["owner_id"] != owner_id:
        raise ValueError("Only the group owner can disband the group")

    # Delete group messages first
    await db.execute("DELETE FROM group_messages WHERE group_id = ?", (group_id,))
    # Delete the group
    await db.execute("DELETE FROM groups WHERE id = ?", (group_id,))

    logger.info("Group disbanded: %s by %s", group_id, owner_id)
    return True


# ─── Membership Management ─────────────────────────────────────────────


async def invite_member(
    db: DatabaseManager,
    group_id: str,
    account_id: str,
    inviter_id: str,
) -> Dict[str, Any]:
    """Add a member to a group.

    The inviter must be the owner or an admin.
    """
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    inviter_member = _find_member(members, inviter_id)
    if not inviter_member:
        raise ValueError("Inviter is not a member of the group")
    if inviter_member["role"] not in ("owner", "admin"):
        raise ValueError("Only the owner or admin can invite members")

    if _find_member(members, account_id):
        raise ValueError("Account is already a member of the group")

    if len(members) >= group["max_members"]:
        raise ValueError("Group has reached the maximum number of members")

    # Verify the account exists
    account = await db.fetchone("SELECT id FROM accounts WHERE id = ?", (account_id,))
    if not account:
        raise ValueError("Account not found")

    new_member = _make_member(account_id, role="member")
    members.append(new_member)

    now = iso_now()
    await db.execute(
        "UPDATE groups SET members_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(members), now, group_id),
    )

    logger.info("Member invited: %s to group %s by %s", account_id, group_id, inviter_id)
    return new_member


async def kick_member(
    db: DatabaseManager,
    group_id: str,
    account_id: str,
    kicker_id: str,
) -> bool:
    """Remove a member from a group. Only the owner or admin can kick.

    Cannot kick the owner.
    """
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    kicker_member = _find_member(members, kicker_id)
    if not kicker_member:
        raise ValueError("Kicker is not a member of the group")
    if kicker_member["role"] not in ("owner", "admin"):
        raise ValueError("Only the owner or admin can kick members")

    target_member = _find_member(members, account_id)
    if not target_member:
        raise ValueError("Target account is not a member of the group")
    if target_member["role"] == "owner":
        raise ValueError("Cannot kick the group owner")

    # Admin cannot kick another admin (only owner can)
    if kicker_member["role"] == "admin" and target_member["role"] == "admin":
        raise ValueError("Admin cannot kick another admin")

    members = _remove_member(members, account_id)
    now = iso_now()
    await db.execute(
        "UPDATE groups SET members_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(members), now, group_id),
    )

    logger.info("Member kicked: %s from group %s by %s", account_id, group_id, kicker_id)
    return True


async def leave_group(
    db: DatabaseManager,
    group_id: str,
    account_id: str,
) -> bool:
    """Leave a group. The owner cannot leave; they must disband or transfer ownership."""
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    target_member = _find_member(members, account_id)
    if not target_member:
        raise ValueError("Account is not a member of the group")

    if target_member["role"] == "owner":
        raise ValueError("Owner cannot leave the group; transfer ownership or disband")

    members = _remove_member(members, account_id)
    now = iso_now()
    await db.execute(
        "UPDATE groups SET members_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(members), now, group_id),
    )

    logger.info("Member left: %s from group %s", account_id, group_id)
    return True


async def transfer_ownership(
    db: DatabaseManager,
    group_id: str,
    old_owner_id: str,
    new_owner_id: str,
) -> Dict[str, Any]:
    """Transfer group ownership to another member.

    The current owner becomes an admin. Only the owner can transfer.
    """
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    if group["owner_id"] != old_owner_id:
        raise ValueError("Only the current owner can transfer ownership")

    members = json_deserialize(group.get("members_json"), default=[])
    old_owner_member = _find_member(members, old_owner_id)
    new_owner_member = _find_member(members, new_owner_id)

    if not new_owner_member:
        raise ValueError("New owner must be a current member of the group")

    # Update roles
    if old_owner_member:
        old_owner_member["role"] = "admin"
    new_owner_member["role"] = "owner"

    now = iso_now()
    await db.execute(
        "UPDATE groups SET owner_id = ?, members_json = ?, updated_at = ? WHERE id = ?",
        (new_owner_id, json_serialize(members), now, group_id),
    )

    logger.info("Ownership transferred: group %s from %s to %s", group_id, old_owner_id, new_owner_id)
    return await get_group(db, group_id)


async def set_member_role(
    db: DatabaseManager,
    group_id: str,
    account_id: str,
    role: str,
    setter_id: str,
) -> Dict[str, Any]:
    """Set a member's role. Only the owner can set roles.

    Valid roles: owner, admin, member. Setting role to 'owner' should use transfer_ownership instead.
    """
    if role not in ("admin", "member"):
        raise ValueError("Invalid role. Use 'admin' or 'member'. Use transfer_ownership for owner role.")

    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    setter_member = _find_member(members, setter_id)
    if not setter_member:
        raise ValueError("Setter is not a member of the group")
    if setter_member["role"] != "owner":
        raise ValueError("Only the owner can set member roles")

    target_member = _find_member(members, account_id)
    if not target_member:
        raise ValueError("Target account is not a member of the group")

    if target_member["role"] == "owner":
        raise ValueError("Cannot change the owner's role; use transfer_ownership instead")

    target_member["role"] = role
    now = iso_now()
    await db.execute(
        "UPDATE groups SET members_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(members), now, group_id),
    )

    logger.info("Role set: %s -> %s in group %s by %s", account_id, role, group_id, setter_id)
    return target_member


async def mute_member(
    db: DatabaseManager,
    group_id: str,
    account_id: str,
    muted: bool,
    setter_id: str,
) -> Dict[str, Any]:
    """Mute or unmute a group member. Only the owner or admin can mute."""
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    setter_member = _find_member(members, setter_id)
    if not setter_member:
        raise ValueError("Setter is not a member of the group")
    if setter_member["role"] not in ("owner", "admin"):
        raise ValueError("Only the owner or admin can mute members")

    target_member = _find_member(members, account_id)
    if not target_member:
        raise ValueError("Target account is not a member of the group")

    if target_member["role"] == "owner":
        raise ValueError("Cannot mute the group owner")

    target_member["muted"] = muted
    now = iso_now()
    await db.execute(
        "UPDATE groups SET members_json = ?, updated_at = ? WHERE id = ?",
        (json_serialize(members), now, group_id),
    )

    action = "muted" if muted else "unmuted"
    logger.info("Member %s: %s in group %s by %s", action, account_id, group_id, setter_id)
    return target_member


# ─── Group Messaging ───────────────────────────────────────────────────


async def send_group_message(
    db: DatabaseManager,
    group_id: str,
    from_id: str,
    msg_type: str = "text",
    content: str = "",
    media: Optional[str] = None,
    file_info: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a message to a group.

    Checks that the sender is a member and not muted.
    Enforces the max_group_messages limit.
    """
    group = await _get_group_raw(db, group_id)
    if not group:
        raise ValueError("Group not found")

    members = json_deserialize(group.get("members_json"), default=[])
    sender_member = _find_member(members, from_id)
    if not sender_member:
        raise ValueError("Sender is not a member of the group")

    if sender_member.get("muted", False):
        raise ValueError("Sender is muted in this group")

    # Get sender name
    sender_account = await db.fetchone(
        "SELECT display_name, agent_name FROM accounts WHERE id = ?",
        (from_id,),
    )
    sender_name = ""
    if sender_account:
        sender_name = sender_account.get("display_name") or sender_account.get("agent_name") or ""

    # Enforce max messages limit — delete oldest if exceeded
    msg_count_row = await db.fetchone(
        "SELECT COUNT(*) as cnt FROM group_messages WHERE group_id = ?",
        (group_id,),
    )
    msg_count = msg_count_row["cnt"] if msg_count_row else 0

    if msg_count >= Config.MAX_GROUP_MESSAGES:
        # Delete oldest messages to make room
        excess = msg_count - Config.MAX_GROUP_MESSAGES + 1
        await db.execute(
            """
            DELETE FROM group_messages WHERE id IN (
                SELECT id FROM group_messages
                WHERE group_id = ?
                ORDER BY timestamp ASC
                LIMIT ?
            )
            """,
            (group_id, excess),
        )

    message_id = uuid.uuid4().hex
    now = iso_now()

    await db.execute(
        """
        INSERT INTO group_messages
            (id, group_id, from_id, sender_name, type, content, media, file_info, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (message_id, group_id, from_id, sender_name, msg_type, content, media, file_info, now),
    )

    # Update group's updated_at
    await db.execute("UPDATE groups SET updated_at = ? WHERE id = ?", (now, group_id))

    message = await db.fetchone("SELECT * FROM group_messages WHERE id = ?", (message_id,))
    logger.info("Group message sent: %s in group %s by %s", message_id, group_id, from_id)
    return message


async def get_group_messages(
    db: DatabaseManager,
    group_id: str,
    limit: int = 50,
    before: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get paginated message history for a group.

    Returns messages ordered by timestamp descending, limited to `limit` messages.
    If `before` is provided (a message ID or ISO timestamp), only returns messages
    older than that reference point.
    """
    params: list[Any] = [group_id]
    where_clause = "WHERE group_id = ?"

    if before:
        # Interpret 'before' as a timestamp — find the timestamp of the given message
        ref_msg = await db.fetchone(
            "SELECT timestamp FROM group_messages WHERE id = ?",
            (before,),
        )
        if ref_msg:
            where_clause += " AND timestamp < ?"
            params.append(ref_msg["timestamp"])

    params.append(limit)

    messages = await db.fetchall(
        f"""
        SELECT * FROM group_messages
        {where_clause}
        ORDER BY timestamp DESC
        LIMIT ?
        """,
        params,
    )

    # Return in chronological order (oldest first)
    messages.reverse()
    return messages


# ─── Internal Helpers ──────────────────────────────────────────────────


async def _get_group_raw(db: DatabaseManager, group_id: str) -> Optional[Dict[str, Any]]:
    """Get raw group record without deserializing members_json."""
    return await db.fetchone("SELECT * FROM groups WHERE id = ?", (group_id,))
