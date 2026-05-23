"""In-app loan notification orchestration.

This module is responsible for the *internal* notification bell feed
(Manager and Treasurer staff inboxes). Member-facing email lives in
`notification_service.py` and uses Resend — the two systems intentionally
share nothing because they have different lifecycles, recipients, and
failure semantics.

Public surface:
    create_loan_notification(supabase, *, ...)
        Insert a single notification row. Idempotent on dedup_key — if an
        unread row with the same dedup_key exists, the insert is skipped.
        Safe to call from BackgroundTasks. Never raises.

Design notes:
    * One notification per role-transition, deduplicated by
      sha256(recipient_role|loan_id|notification_type|status_label).
    * The partial unique index on the table enforces this at the DB level
      so concurrent inserts can't race past the application check.
    * Failure modes (missing supabase client, table not migrated yet, etc.)
      are swallowed and logged so the loan workflow never blocks.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any, Literal

logger = logging.getLogger("ttmpc.notify.inapp")

Role = Literal["manager", "treasurer", "bookkeeper", "member"]
NotificationType = Literal[
    "recommend",            # bookkeeper -> manager (loan recommended for approval)
    "decline",              # bookkeeper -> manager (loan declined at bookkeeper stage)
    "approve",              # manager -> treasurer (loan approved, ready for disbursement)
    "revise",               # manager -> bookkeeper (returned for revision)
    "reject",               # manager -> bookkeeper (rejected at manager stage)
    # Member-facing types ----------------------------------------------------
    "member_submitted",     # application received (bookkeeper review pending)
    "member_recommended",   # bookkeeper recommended your loan to manager
    "member_bk_declined",   # bookkeeper declined your loan
    "member_approved",      # manager approved your loan
    "member_mgr_rejected",  # manager rejected your loan
    "member_mgr_revise",    # manager returned your loan for revision
    "member_ready_claim",   # treasurer confirmed; ready to claim at cashier
    "member_released",      # cashier released funds
    "member_cancelled",     # treasurer cancelled disbursement
]

_SEVERITY_BY_TYPE: dict[str, str] = {
    "recommend": "success",
    "approve": "success",
    "decline": "danger",
    "reject": "danger",
    "revise": "warning",
    "member_submitted": "info",
    "member_recommended": "success",
    "member_bk_declined": "danger",
    "member_approved": "success",
    "member_mgr_rejected": "danger",
    "member_mgr_revise": "warning",
    "member_ready_claim": "success",
    "member_released": "success",
    "member_cancelled": "danger",
}


@dataclass
class NotificationResult:
    inserted: bool
    skipped_reason: str | None = None
    error: str | None = None
    notification_id: int | None = None


def _safe(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _dedup_key(recipient_role: str, loan_id: str, notification_type: str, status_label: str) -> str:
    raw = f"{recipient_role}|{loan_id}|{notification_type}|{status_label}".lower().encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _redirect_url(recipient_role: str, loan_id: str) -> str:
    role = recipient_role.lower()
    if role == "manager":
        return f"/loan-approval/{loan_id}"
    if role == "treasurer":
        return f"/treasurer-loan-approval/{loan_id}"
    if role == "bookkeeper":
        return f"/bookkeeper-loan-approval/{loan_id}"
    if role == "member":
        return "/member-loans"
    return f"/loan-approval/{loan_id}"


def _build_message(
    *,
    notification_type: str,
    member_name: str,
    loan_type: str | None,
    loan_id: str,
) -> tuple[str, str]:
    safe_member = member_name or "A member"
    safe_loan_type = loan_type or "loan"
    if notification_type == "recommend":
        title = "Loan recommended for your approval"
        message = (
            f"The loan application of {safe_member} for {safe_loan_type} has been "
            f"processed and recommended for approval by the Bookkeeper."
        )
    elif notification_type == "decline":
        title = "Loan declined by Bookkeeper"
        message = (
            f"The loan application of {safe_member} for {safe_loan_type} has been "
            f"reviewed and declined by the Bookkeeper."
        )
    elif notification_type == "approve":
        title = "Loan ready for Treasurer processing"
        message = (
            f"A loan application from {safe_member} ({safe_loan_type}) has been "
            f"approved by the Manager and is ready for Treasurer processing."
        )
    elif notification_type == "revise":
        title = "Loan returned for revision"
        message = (
            f"The loan application of {safe_member} ({safe_loan_type}) was returned "
            f"for revision. Please review the remarks."
        )
    elif notification_type == "reject":
        title = "Loan rejected by Manager"
        message = (
            f"The loan application of {safe_member} ({safe_loan_type}) has been "
            f"rejected by the Manager."
        )
    # ---- Member-facing messages ----
    elif notification_type == "member_submitted":
        title = "Loan application received"
        message = f"Your {safe_loan_type} application has been received and is under Bookkeeper review."
    elif notification_type == "member_recommended":
        title = "Application moved to Manager"
        message = f"Your {safe_loan_type} application has been recommended for approval and forwarded to the Manager."
    elif notification_type == "member_bk_declined":
        title = "Application declined at Bookkeeper review"
        message = f"Your {safe_loan_type} application was declined during Bookkeeper review. Please contact the cooperative for details."
    elif notification_type == "member_approved":
        title = "Loan approved by Manager"
        message = f"Your {safe_loan_type} loan has been approved by the Manager and is now being prepared for disbursement."
    elif notification_type == "member_mgr_rejected":
        title = "Application rejected by Manager"
        message = f"Your {safe_loan_type} application was not approved by the Manager. Please contact the cooperative for details."
    elif notification_type == "member_mgr_revise":
        title = "Application returned for revision"
        message = f"Your {safe_loan_type} application was returned for revision. Please review the remarks and resubmit."
    elif notification_type == "member_ready_claim":
        title = "Loan ready for claim"
        message = f"Your {safe_loan_type} loan is ready. Please proceed to the Cashier to claim the disbursement."
    elif notification_type == "member_released":
        title = "Loan disbursed"
        message = f"Your {safe_loan_type} loan has been released. Thank you for using TTMPC."
    elif notification_type == "member_cancelled":
        title = "Disbursement cancelled"
        message = f"The disbursement for your {safe_loan_type} loan was cancelled. Please contact the cooperative for details."
    else:
        title = "Loan workflow update"
        message = f"The loan {loan_id} has a new workflow update."
    return title, message


def create_loan_notification(
    supabase,
    *,
    recipient_role: str,
    notification_type: str,
    loan_id: str,
    member_name: str | None = None,
    loan_type: str | None = None,
    status_label: str | None = None,
    actor_user_id: str | None = None,
    recipient_user_id: str | None = None,
    recipient_member_id: str | None = None,
) -> NotificationResult:
    """Insert one in-app notification row. Never raises.

    Deduplication: if an *unread* row with the same dedup_key already exists,
    the insert is skipped. This protects against double-clicks, AJAX retries,
    page-refresh resubmits, and concurrent admin actions on the same loan.
    """
    if not supabase:
        return NotificationResult(inserted=False, skipped_reason="supabase_unavailable")

    role = _safe(recipient_role).lower()
    ntype = _safe(notification_type).lower()
    clean_loan_id = _safe(loan_id)

    if not role or not ntype or not clean_loan_id:
        return NotificationResult(inserted=False, error="missing role/type/loan_id")

    status_label_norm = _safe(status_label) or ntype
    dedup_key = _dedup_key(role, clean_loan_id, ntype, status_label_norm)

    # Application-level dedup check (DB unique index is the safety net).
    try:
        existing = (
            supabase.table("loan_notifications")
            .select("id")
            .eq("dedup_key", dedup_key)
            .eq("is_read", False)
            .limit(1)
            .execute()
        )
        if existing.data:
            return NotificationResult(
                inserted=False,
                skipped_reason="dedup_hit_unread",
                notification_id=existing.data[0].get("id"),
            )
    except Exception as err:
        # If the table isn't migrated yet, skip silently.
        logger.warning("loan_notifications dedup check failed: %s", err)
        return NotificationResult(inserted=False, error=f"dedup_check_failed: {err}")

    title, message = _build_message(
        notification_type=ntype,
        member_name=member_name or "",
        loan_type=loan_type,
        loan_id=clean_loan_id,
    )

    record = {
        "recipient_role": role,
        "recipient_user_id": recipient_user_id,
        "recipient_member_id": _safe(recipient_member_id) or None,
        "title": title,
        "message": message,
        "notification_type": ntype,
        "severity": _SEVERITY_BY_TYPE.get(ntype, "info"),
        "loan_id": clean_loan_id,
        "redirect_url": _redirect_url(role, clean_loan_id),
        "dedup_key": dedup_key,
        "is_read": False,
        "created_by": actor_user_id,
    }

    try:
        resp = supabase.table("loan_notifications").insert(record).execute()
        inserted_id = (resp.data or [{}])[0].get("id") if resp.data else None
        return NotificationResult(inserted=True, notification_id=inserted_id)
    except Exception as err:
        # Most likely a race against the partial unique index — treat as dedup.
        msg = str(err).lower()
        if "loan_notifications_dedup_unread_uniq" in msg or "duplicate key" in msg:
            return NotificationResult(inserted=False, skipped_reason="dedup_unique_race")
        logger.warning("loan_notifications insert failed: %s", err)
        return NotificationResult(inserted=False, error=str(err))
