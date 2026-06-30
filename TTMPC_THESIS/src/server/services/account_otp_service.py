"""OTP service for account-security flows (email change, password change).

Backed by the `account_change_otp` Supabase table. Codes are 6 digits,
stored as sha256 hashes, expire after 10 minutes, allow up to 5 wrong
guesses, and a single user can only request a new OTP for a given purpose
once per 60 seconds.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

OTP_TTL_SECONDS = 10 * 60
OTP_MAX_ATTEMPTS = 5
OTP_REQUEST_COOLDOWN_SECONDS = 60

VALID_PURPOSES = {"email_change", "email_change_initial", "password_change"}


@dataclass
class OtpIssueResult:
    code: str          # plaintext — only returned so the caller can email it
    otp_id: str
    expires_at: datetime


@dataclass
class OtpVerifyResult:
    ok: bool
    otp_id: str | None = None
    payload: dict[str, Any] | None = None
    error: str | None = None


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        # Supabase returns ISO 8601 strings like "2025-01-01T12:34:56.789+00:00"
        s = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None


def issue_otp(
    supabase: Client,
    *,
    auth_user_id: str,
    purpose: str,
    payload: dict[str, Any] | None = None,
) -> OtpIssueResult:
    """Generate, persist, and return a fresh OTP. Enforces per-user cooldown."""
    if purpose not in VALID_PURPOSES:
        raise ValueError(f"Invalid OTP purpose: {purpose}")

    cutoff = (_now() - timedelta(seconds=OTP_REQUEST_COOLDOWN_SECONDS)).isoformat()
    recent = (
        supabase.table("account_change_otp")
        .select("id, created_at")
        .eq("auth_user_id", auth_user_id)
        .eq("purpose", purpose)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if recent.data:
        raise PermissionError(
            f"Please wait {OTP_REQUEST_COOLDOWN_SECONDS} seconds before requesting another code."
        )

    # Invalidate any unconsumed prior codes for this purpose so only the
    # latest issuance is usable.
    supabase.table("account_change_otp").update({"consumed": True}).match(
        {"auth_user_id": auth_user_id, "purpose": purpose, "consumed": False}
    ).execute()

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = _now() + timedelta(seconds=OTP_TTL_SECONDS)

    insert = (
        supabase.table("account_change_otp")
        .insert(
            {
                "auth_user_id": auth_user_id,
                "purpose": purpose,
                "code_hash": _hash_code(code),
                "payload": payload or {},
                "expires_at": expires_at.isoformat(),
            }
        )
        .execute()
    )
    if not insert.data:
        raise RuntimeError("Failed to persist OTP")

    return OtpIssueResult(code=code, otp_id=insert.data[0]["id"], expires_at=expires_at)


def verify_otp(
    supabase: Client,
    *,
    auth_user_id: str,
    purpose: str,
    code: str,
) -> OtpVerifyResult:
    """Verify a user-supplied OTP. On success returns the stored payload and
    marks the OTP consumed. On wrong-but-valid attempts increments `attempts`
    until the lockout threshold."""
    if purpose not in VALID_PURPOSES:
        return OtpVerifyResult(ok=False, error="Invalid request.")

    clean_code = (code or "").strip()
    if not (clean_code.isdigit() and len(clean_code) == 6):
        return OtpVerifyResult(ok=False, error="Enter the 6-digit code.")

    latest = (
        supabase.table("account_change_otp")
        .select("id, code_hash, payload, expires_at, attempts, consumed")
        .eq("auth_user_id", auth_user_id)
        .eq("purpose", purpose)
        .eq("consumed", False)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not latest.data:
        return OtpVerifyResult(ok=False, error="No active code. Request a new one.")

    row = latest.data[0]
    expires_at = _parse_ts(row.get("expires_at"))
    if not expires_at or expires_at < _now():
        supabase.table("account_change_otp").update({"consumed": True}).eq("id", row["id"]).execute()
        return OtpVerifyResult(ok=False, error="Code expired. Request a new one.")

    attempts = int(row.get("attempts") or 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        supabase.table("account_change_otp").update({"consumed": True}).eq("id", row["id"]).execute()
        return OtpVerifyResult(ok=False, error="Too many wrong attempts. Request a new code.")

    if row["code_hash"] != _hash_code(clean_code):
        new_attempts = attempts + 1
        update_patch: dict[str, Any] = {"attempts": new_attempts}
        if new_attempts >= OTP_MAX_ATTEMPTS:
            update_patch["consumed"] = True
        supabase.table("account_change_otp").update(update_patch).eq("id", row["id"]).execute()
        remaining = OTP_MAX_ATTEMPTS - new_attempts
        if remaining <= 0:
            return OtpVerifyResult(ok=False, error="Too many wrong attempts. Request a new code.")
        return OtpVerifyResult(ok=False, error=f"Incorrect code. {remaining} attempt(s) left.")

    supabase.table("account_change_otp").update({"consumed": True}).eq("id", row["id"]).execute()
    return OtpVerifyResult(ok=True, otp_id=row["id"], payload=row.get("payload") or {})
