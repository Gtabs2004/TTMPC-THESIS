"""Loan-workflow notification orchestration.

This is the single entry point used by FastAPI handlers (and other backend code,
like the disbursement endpoint) to dispatch loan-status emails.

Responsibilities:
    1. Resolve the loan row + member email from Supabase (source of truth).
    2. Enforce duplicate protection via a transition guard + dedup_key.
    3. Render the appropriate template(s) for the stage/action.
    4. Send via `email_service` and write an audit row to `loan_email_log`.

Design notes:
    * All public functions are non-raising. The loan workflow must NEVER be
      blocked by an email failure. Errors are logged and persisted.
    * `dispatch_loan_status_email` is safe to call from a `BackgroundTasks`
      handler — it owns its own Supabase access and does not depend on
      request-scoped state.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any

from . import email_service
from .loan_email_templates import (
    Action,
    LoanEmailContext,
    Stage,
    render_member_email,
    render_next_approver_email,
    status_label_for,
)

logger = logging.getLogger("ttmpc.email.notify")

# Stages that are allowed to be wired from the public dispatch endpoint.
_VALID_STAGES: tuple[Stage, ...] = ("bookkeeper", "manager", "treasurer")
_VALID_ACTIONS: tuple[Action, ...] = (
    "recommend", "reject", "revise", "approve", "proceed", "disburse", "released",
)


@dataclass
class DispatchResult:
    sent: int = 0
    skipped: int = 0
    failed: int = 0
    details: list[dict[str, Any]] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "sent": self.sent,
            "skipped": self.skipped,
            "failed": self.failed,
            "details": self.details or [],
        }


def _dedup_key(loan_id: str, stage: str, action: str, status_label: str, recipient: str) -> str:
    raw = f"{loan_id}|{stage}|{action}|{status_label}|{recipient.lower()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _safe(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _fetch_loan_with_member(supabase, loan_id: str) -> dict[str, Any] | None:
    """Look up loan + member info from Supabase. Tries `loans` then `koica_loans`.
    Returns a normalized dict with: control_number, member_name, member_email,
    loan_amount, loan_type, last_emailed_status, source_table.
    Returns None if not found.
    """
    if not supabase or not loan_id:
        return None

    clean_id = _safe(loan_id)
    if not clean_id:
        return None

    # Primary table: loans (joined to member + loan_type).
    try:
        resp = (
            supabase.table("loans")
            .select(
                "control_number, loan_amount, principal_amount, loan_status, last_emailed_status, "
                "raw_payload, member_id, "
                "member:member_id(first_name,last_name,membership_id), "
                "loan_type:loan_type_id(name)"
            )
            .eq("control_number", clean_id)
            .limit(1)
            .execute()
        )
        row = (resp.data or [None])[0]
        if row:
            return _normalize_loan_row(supabase, row, source_table="loans")
    except Exception as err:
        logger.warning("notification: failed to read loans for %s: %s", clean_id, err)

    # Fallback: koica_loans (no member join).
    try:
        resp = (
            supabase.table("koica_loans")
            .select("control_number, loan_amount, principal_amount, loan_status, last_emailed_status, raw_payload, full_name")
            .eq("control_number", clean_id)
            .limit(1)
            .execute()
        )
        row = (resp.data or [None])[0]
        if row:
            return _normalize_loan_row(supabase, row, source_table="koica_loans")
    except Exception as err:
        logger.warning("notification: failed to read koica_loans for %s: %s", clean_id, err)

    return None


def _normalize_loan_row(supabase, row: dict, *, source_table: str) -> dict[str, Any]:
    member = row.get("member") or {}
    raw_payload = row.get("raw_payload") or {}
    optional_fields = raw_payload.get("optionalFields") if isinstance(raw_payload, dict) else None
    optional_fields = optional_fields if isinstance(optional_fields, dict) else {}

    member_name = (
        f"{_safe(member.get('first_name'))} {_safe(member.get('last_name'))}".strip()
        or _safe(row.get("full_name"))
        or "Member"
    )

    # Resolve member email — not joined directly on `loans`, so probe known fields.
    member_email = (
        _safe(optional_fields.get("user_email"))
        or _safe(optional_fields.get("email"))
        or _safe(raw_payload.get("user_email") if isinstance(raw_payload, dict) else None)
        or _safe(raw_payload.get("email") if isinstance(raw_payload, dict) else None)
    )

    # Last resort: look up personal_data_sheet by membership_id.
    if not member_email and source_table == "loans":
        membership_id = _safe(member.get("membership_id"))
        if membership_id and supabase:
            try:
                pds_resp = (
                    supabase.table("personal_data_sheet")
                    .select("email, created_at")
                    .eq("membership_number_id", membership_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                pds_row = (pds_resp.data or [None])[0]
                if pds_row and _safe(pds_row.get("email")):
                    member_email = _safe(pds_row.get("email"))
            except Exception as err:
                logger.debug("notification: pds email lookup failed for %s: %s", membership_id, err)

    return {
        "control_number": _safe(row.get("control_number")),
        "source_table": source_table,
        "member_name": member_name,
        "member_email": member_email.lower() if member_email else "",
        "loan_amount": row.get("loan_amount") or row.get("principal_amount") or None,
        "loan_type": (row.get("loan_type") or {}).get("name") if isinstance(row.get("loan_type"), dict) else None,
        "last_emailed_status": _safe(row.get("last_emailed_status")),
        "current_status": _safe(row.get("loan_status")),
    }


def _write_log(supabase, *, loan_id: str, stage: str, action: str, status_label: str,
               recipient_email: str, recipient_role: str, dedup_key: str,
               result: email_service.SendResult, actor_user_id: str | None) -> None:
    if not supabase:
        return
    record = {
        "loan_id": loan_id,
        "stage": stage,
        "action": action,
        "status_label": status_label,
        "recipient_email": recipient_email,
        "recipient_role": recipient_role,
        "dedup_key": dedup_key,
        "success": bool(result.success),
        "provider_message_id": result.provider_message_id,
        "error_message": result.error or result.skipped_reason,
        "attempt_count": result.attempts or 1,
        "created_by": actor_user_id,
    }
    try:
        supabase.table("loan_email_log").insert(record).execute()
    except Exception as err:
        logger.warning("notification: failed to write loan_email_log: %s", err)


def _dedup_already_succeeded(supabase, dedup_key: str) -> bool:
    if not supabase:
        return False
    try:
        resp = (
            supabase.table("loan_email_log")
            .select("id")
            .eq("dedup_key", dedup_key)
            .eq("success", True)
            .limit(1)
            .execute()
        )
        return bool(resp.data)
    except Exception:
        return False


def _update_last_emailed_status(supabase, *, source_table: str, loan_id: str, status_label: str) -> None:
    if not supabase:
        return
    try:
        supabase.table(source_table).update({"last_emailed_status": status_label}).eq("control_number", loan_id).execute()
    except Exception as err:
        logger.debug("notification: failed to update last_emailed_status: %s", err)


def dispatch_loan_status_email(
    supabase,
    *,
    loan_id: str,
    stage: str,
    action: str,
    remarks: str | None = None,
    actor_user_id: str | None = None,
    next_approver_email: str | None = None,
    override_member_email: str | None = None,
) -> DispatchResult:
    """Main entry point. Safe to call from `BackgroundTasks`.

    Never raises. Returns a `DispatchResult` summarising what happened.
    """
    result = DispatchResult(details=[])

    stage_norm = (stage or "").strip().lower()
    action_norm = (action or "").strip().lower()
    if stage_norm not in _VALID_STAGES or action_norm not in _VALID_ACTIONS:
        result.failed += 1
        result.details.append({"error": f"invalid stage/action: {stage}/{action}"})
        return result

    loan = _fetch_loan_with_member(supabase, loan_id)
    if not loan:
        result.failed += 1
        result.details.append({"error": "loan not found"})
        return result

    status_label = status_label_for(stage_norm, action_norm)  # type: ignore[arg-type]

    # Transition guard: if the last successfully-emailed status equals the one
    # we're about to send, skip. Protects against refresh/double-click resubmits.
    if loan["last_emailed_status"] and loan["last_emailed_status"].lower() == status_label.lower():
        result.skipped += 1
        result.details.append({"reason": "status_unchanged_since_last_email", "status": status_label})
        return result

    sanitized_remarks = email_service.sanitize_text(remarks) if remarks else None
    ctx = LoanEmailContext(
        member_name=loan["member_name"],
        loan_id=loan["control_number"],
        loan_type=loan["loan_type"],
        loan_amount=loan["loan_amount"],
        remarks=sanitized_remarks,
        stage=stage_norm,           # type: ignore[arg-type]
        action=action_norm,         # type: ignore[arg-type]
    )

    # --- Recipient #1: the member ---
    member_email = (override_member_email or loan["member_email"] or "").strip().lower()
    if member_email and email_service.is_valid_email(member_email):
        dedup_key = _dedup_key(loan["control_number"], stage_norm, action_norm, status_label, member_email)
        if _dedup_already_succeeded(supabase, dedup_key):
            result.skipped += 1
            result.details.append({"recipient": member_email, "reason": "dedup_hit"})
        else:
            subject, html = render_member_email(ctx)
            send_result = email_service.send_email(to=[member_email], subject=subject, html=html)
            _write_log(
                supabase,
                loan_id=loan["control_number"],
                stage=stage_norm,
                action=action_norm,
                status_label=status_label,
                recipient_email=member_email,
                recipient_role="member",
                dedup_key=dedup_key,
                result=send_result,
                actor_user_id=actor_user_id,
            )
            if send_result.success:
                result.sent += 1
                _update_last_emailed_status(
                    supabase,
                    source_table=loan["source_table"],
                    loan_id=loan["control_number"],
                    status_label=status_label,
                )
            else:
                result.failed += 1
            result.details.append({
                "recipient": member_email,
                "role": "member",
                "success": send_result.success,
                "error": send_result.error,
            })
    else:
        result.skipped += 1
        result.details.append({"role": "member", "reason": "missing_or_invalid_email"})

    # --- Recipient #2: the next approver (only on positive transitions) ---
    if next_approver_email and action_norm in ("recommend", "approve", "proceed"):
        approver_email = next_approver_email.strip().lower()
        if email_service.is_valid_email(approver_email):
            approver_role = "Manager" if stage_norm == "bookkeeper" else "Treasurer"
            dedup_key = _dedup_key(loan["control_number"], stage_norm, action_norm, status_label, approver_email)
            if _dedup_already_succeeded(supabase, dedup_key):
                result.skipped += 1
                result.details.append({"recipient": approver_email, "reason": "dedup_hit"})
            else:
                subject, html = render_next_approver_email(ctx, approver_role)
                send_result = email_service.send_email(to=[approver_email], subject=subject, html=html)
                _write_log(
                    supabase,
                    loan_id=loan["control_number"],
                    stage=stage_norm,
                    action=action_norm,
                    status_label=status_label,
                    recipient_email=approver_email,
                    recipient_role="next_approver",
                    dedup_key=dedup_key,
                    result=send_result,
                    actor_user_id=actor_user_id,
                )
                if send_result.success:
                    result.sent += 1
                else:
                    result.failed += 1
                result.details.append({
                    "recipient": approver_email,
                    "role": "next_approver",
                    "success": send_result.success,
                    "error": send_result.error,
                })

    return result
