"""HTML templates for loan-workflow notification emails.

Templates are pure functions of context. They escape all dynamic data so callers
do not have to pre-sanitize, but `email_service.sanitize_text` should still be
used on free-form fields (remarks) before reaching the template.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from typing import Literal

Stage = Literal["bookkeeper", "manager", "treasurer"]
Action = Literal[
    "recommend",         # bookkeeper -> manager
    "reject",
    "revise",
    "approve",           # manager -> treasurer
    "proceed",           # alias for manager approve
    "disburse",          # treasurer disbursement scheduled
    "released",          # treasurer/cashier confirmed release
]


@dataclass
class LoanEmailContext:
    member_name: str
    loan_id: str
    loan_type: str | None = None
    loan_amount: float | None = None
    remarks: str | None = None
    stage: Stage = "bookkeeper"
    action: Action = "recommend"


_STAGE_LABEL = {
    "bookkeeper": "Bookkeeper Review",
    "manager": "Manager Approval",
    "treasurer": "Treasurer / Disbursement",
}


def _format_amount(amount: float | None) -> str:
    if amount is None:
        return "—"
    try:
        return f"₱{float(amount):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _resolve_status_label(stage: Stage, action: Action) -> str:
    table = {
        ("bookkeeper", "recommend"): "Recommended for Manager Approval",
        ("bookkeeper", "reject"): "Rejected by Bookkeeper",
        ("bookkeeper", "revise"): "Returned for Revision (Bookkeeper)",
        ("manager", "approve"): "Approved by Manager",
        ("manager", "proceed"): "Approved by Manager",
        ("manager", "reject"): "Rejected by Manager",
        ("manager", "revise"): "Returned for Revision (Manager)",
        ("treasurer", "disburse"): "Ready for Claim at Cashier",
        ("treasurer", "released"): "Released / Disbursed",
        ("treasurer", "reject"): "Disbursement Cancelled",
    }
    return table.get((stage, action), f"{stage.title()} Update")


def _color_for(action: Action) -> str:
    if action in ("recommend", "approve", "proceed", "released", "disburse"):
        return "#059669"   # green
    if action in ("reject",):
        return "#dc2626"   # red
    if action in ("revise",):
        return "#d97706"   # amber
    return "#2563eb"


def member_email_subject(stage: Stage, action: Action, loan_id: str) -> str:
    label = _resolve_status_label(stage, action)
    return f"TTMPC Loan {loan_id}: {label}"


def render_member_email(ctx: LoanEmailContext) -> tuple[str, str]:
    """Returns (subject, html) for a member-facing notification."""
    status_label = _resolve_status_label(ctx.stage, ctx.action)
    color = _color_for(ctx.action)

    safe_member = escape(ctx.member_name or "Member")
    safe_loan_id = escape(ctx.loan_id or "—")
    safe_loan_type = escape(ctx.loan_type or "—")
    safe_amount = escape(_format_amount(ctx.loan_amount))
    safe_stage = escape(_STAGE_LABEL.get(ctx.stage, ctx.stage.title()))
    safe_status = escape(status_label)

    remarks_block = ""
    if ctx.remarks:
        safe_remarks = escape(ctx.remarks).replace("\n", "<br/>")
        remarks_block = f"""
            <div style="margin-top:24px;padding:16px 20px;background:#fff7ed;border:1px solid #ffedd5;border-radius:10px;">
                <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.05em;">Remarks</p>
                <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.55;">{safe_remarks}</p>
            </div>
        """

    html = f"""
    <div style="background:#f8fafc;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.03);">
            <div style="background:#0f172a;padding:24px 32px;">
                <p style="color:#60a5fa;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px 0;">TTMPC Loan Portal</p>
                <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">{safe_stage}</h1>
            </div>
            <div style="padding:32px;">
                <p style="font-size:15px;color:#334155;margin:0 0 8px 0;">Hello <strong>{safe_member}</strong>,</p>
                <p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 24px 0;">
                    This is an official notification regarding the status of your loan application.
                </p>
                <div style="text-align:center;padding:24px;background:#f1f5f9;border-radius:10px;border:1px dashed #cbd5e1;">
                    <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Current Status</span>
                    <div style="margin-top:8px;font-size:22px;font-weight:800;color:{color};letter-spacing:-0.4px;">{safe_status}</div>
                </div>
                <table style="width:100%;margin-top:24px;border-collapse:collapse;font-size:13px;color:#334155;">
                    <tr><td style="padding:6px 0;color:#64748b;">Loan Control No.</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_loan_id}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Loan Type</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_loan_type}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Amount Applied</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_amount}</td></tr>
                </table>
                {remarks_block}
                <p style="margin-top:28px;font-size:14px;color:#475569;line-height:1.6;">
                    You may log in to the TTMPC member portal to view the full status of your application.
                    If you have questions, please contact the cooperative office.
                </p>
                <div style="margin-top:32px;padding-top:20px;border-top:1px solid #f1f5f9;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">TTMPC Loan Validation Office</p>
                    <p style="margin:2px 0 0 0;font-size:12px;color:#94a3b8;">Bookkeeper · Manager · Treasurer Approval Chain</p>
                </div>
            </div>
            <div style="background:#f8fafc;padding:16px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
                Automated message — please do not reply directly.
            </div>
        </div>
    </div>
    """
    return member_email_subject(ctx.stage, ctx.action, ctx.loan_id), html


def render_next_approver_email(ctx: LoanEmailContext, approver_role: str) -> tuple[str, str]:
    """Internal notification to the next approver (manager or treasurer)."""
    status_label = _resolve_status_label(ctx.stage, ctx.action)
    safe_member = escape(ctx.member_name or "Member")
    safe_loan_id = escape(ctx.loan_id or "—")
    safe_loan_type = escape(ctx.loan_type or "—")
    safe_amount = escape(_format_amount(ctx.loan_amount))
    safe_status = escape(status_label)
    safe_role = escape(approver_role)

    subject = f"[Action Needed] Loan {ctx.loan_id} ready for {approver_role} review"
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;background:#f8fafc;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
            <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1d6021;font-weight:700;">TTMPC Loan Workflow</p>
            <h2 style="margin:0 0 16px 0;font-size:18px;color:#0f172a;">A loan application is ready for {safe_role} review</h2>
            <p style="font-size:14px;color:#475569;margin:0 0 18px 0;line-height:1.55;">
                Status transitioned to <strong>{safe_status}</strong>. Please review the application in the portal.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#334155;">
                <tr><td style="padding:6px 0;color:#64748b;">Member</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_member}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Loan Control No.</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_loan_id}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Loan Type</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_loan_type}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;">{safe_amount}</td></tr>
            </table>
        </div>
    </div>
    """
    return subject, html


def status_label_for(stage: Stage, action: Action) -> str:
    """Public accessor used by the dedup/transition layer."""
    return _resolve_status_label(stage, action)
