"""
AICQ Verification Service
===========================
Handles generation and verification of 6-digit codes for email/phone
verification. Codes have a 5-minute TTL and a maximum of 5 attempts.
In development mode (Config.DEBUG=True), codes are logged instead of sent.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from db import DatabaseManager, iso_now
from config import Config

logger = logging.getLogger("aicq.verification_service")


async def generate_code(
    db: DatabaseManager,
    target: str,
    type: str,
    purpose: str,
) -> Dict[str, Any]:
    """Generate a 6-digit verification code for an email or phone number.

    Args:
        target: The email address or phone number.
        type: 'email' or 'phone'.
        purpose: 'register', 'login', or 'reset_password'.

    Returns a dict with the code and metadata. The code is also logged
    in development mode.

    Raises ValueError for invalid type or purpose values.
    """
    if type not in ("email", "phone"):
        raise ValueError("Invalid verification type. Must be 'email' or 'phone'.")

    if purpose not in ("register", "login", "reset_password"):
        raise ValueError("Invalid verification purpose. Must be 'register', 'login', or 'reset_password'.")

    # Invalidate any existing codes for this target + type + purpose
    await db.execute(
        """
        DELETE FROM verification_codes
        WHERE target = ? AND type = ? AND purpose = ? AND verified_at IS NULL
        """,
        (target, type, purpose),
    )

    # Generate a 6-digit code
    code = f"{secrets.randbelow(900000) + 100000:06d}"

    code_id = uuid.uuid4().hex
    now = iso_now()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    await db.execute(
        """
        INSERT INTO verification_codes
            (id, target, code, type, purpose, attempts, max_attempts, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?)
        """,
        (code_id, target, code, type, purpose, expires_at, now),
    )

    # In development mode, just log the code
    if Config.DEBUG:
        logger.info(
            "DEV MODE — Verification code for %s (%s/%s): %s",
            target, type, purpose, code,
        )
    else:
        # In production, send via email or SMS
        if type == "email":
            await _send_email_code(target, code, purpose)
        elif type == "phone":
            await _send_sms_code(target, code, purpose)

    return {
        "id": code_id,
        "target": target,
        "type": type,
        "purpose": purpose,
        "code": code if Config.DEBUG else "***",
        "expires_at": expires_at,
        "created_at": now,
    }


async def verify_code(
    db: DatabaseManager,
    target: str,
    code: str,
    purpose: str,
) -> bool:
    """Verify a verification code.

    Checks that the code matches, hasn't expired, and hasn't exceeded
    the maximum number of attempts. On failure, increments the attempt
    counter. On success, marks the code as verified.

    Returns True if the code is valid, False otherwise.
    """
    # Find the most recent unverified code for this target and purpose
    row = await db.fetchone(
        """
        SELECT * FROM verification_codes
        WHERE target = ? AND purpose = ? AND verified_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (target, purpose),
    )

    if row is None:
        logger.debug("No verification code found for %s (%s)", target, purpose)
        return False

    # Check if expired
    now = iso_now()
    if row["expires_at"] < now:
        logger.debug("Verification code expired for %s", target)
        return False

    # Check if max attempts exceeded
    if row["attempts"] >= row["max_attempts"]:
        logger.debug("Max attempts exceeded for %s", target)
        return False

    # Increment attempts
    new_attempts = row["attempts"] + 1
    await db.execute(
        "UPDATE verification_codes SET attempts = ? WHERE id = ?",
        (new_attempts, row["id"]),
    )

    # Check if code matches
    if row["code"] != code:
        logger.debug("Invalid verification code for %s (attempt %d/%d)", target, new_attempts, row["max_attempts"])
        return False

    # Mark as verified
    await db.execute(
        "UPDATE verification_codes SET verified_at = ? WHERE id = ?",
        (now, row["id"]),
    )

    logger.info("Verification code verified for %s (%s)", target, purpose)
    return True


# ─── Email / SMS Sending (Stub Implementations) ────────────────────────


async def _send_email_code(email: str, code: str, purpose: str) -> None:
    """Send a verification code via email.

    This is a stub implementation. In production, integrate with an
    SMTP service or email API using Config.SMTP_* settings.
    """
    if not Config.SMTP_HOST:
        logger.warning("SMTP not configured — verification email not sent to %s", email)
        return

    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        subject_map = {
            "register": "AICQ - Email Verification Code",
            "login": "AICQ - Login Verification Code",
            "reset_password": "AICQ - Password Reset Code",
        }
        subject = subject_map.get(purpose, "AICQ - Verification Code")

        msg = MIMEMultipart()
        msg["From"] = Config.SMTP_USER
        msg["To"] = email
        msg["Subject"] = subject

        body = (
            f"Your verification code is: {code}\n\n"
            f"This code expires in 5 minutes.\n"
            f"If you did not request this code, please ignore this email."
        )
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT) as server:
            server.starttls()
            if Config.SMTP_USER and Config.SMTP_PASS:
                server.login(Config.SMTP_USER, Config.SMTP_PASS)
            server.send_message(msg)

        logger.info("Verification email sent to %s", email)
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", email, exc)


async def _send_sms_code(phone: str, code: str, purpose: str) -> None:
    """Send a verification code via SMS.

    This is a stub implementation. In production, integrate with an
    SMS service provider (Twilio, Vonage, etc.).
    """
    logger.warning(
        "SMS sending not implemented — verification code for %s: %s (purpose: %s)",
        phone, code, purpose,
    )
