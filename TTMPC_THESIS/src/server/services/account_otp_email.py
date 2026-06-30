"""HTML templates + send wrappers for account-security OTP emails."""

from __future__ import annotations

from html import escape
from typing import Literal

from . import email_service

Purpose = Literal["email_change", "email_change_initial", "password_change"]


def _subject(purpose: Purpose) -> str:
    if purpose == "password_change":
        return "Your TTMPC password change code"
    return "Your TTMPC email change code"


def _action_label(purpose: Purpose) -> str:
    if purpose == "password_change":
        return "change your account password"
    if purpose == "email_change_initial":
        return "set the email address on your TTMPC account"
    return "change the email address on your TTMPC account"


def _render_html(code: str, purpose: Purpose, ttl_minutes: int) -> str:
    action = _action_label(purpose)
    safe_code = escape(code)
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f6f8fa; padding:24px; margin:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; border:1px solid #e5e7eb; padding:32px;">
      <tr>
        <td style="text-align:center;">
          <h1 style="margin:0 0 8px; font-size:20px; color:#111827;">TTMPC Account Security</h1>
          <p style="margin:0 0 24px; color:#4b5563; font-size:14px;">
            Use the code below to {escape(action)}.
          </p>
          <div style="background:#1D6021; color:#ffffff; font-size:32px; letter-spacing:8px; font-weight:700; padding:18px 24px; border-radius:10px; display:inline-block;">
            {safe_code}
          </div>
          <p style="margin:24px 0 8px; color:#4b5563; font-size:13px;">
            This code expires in {ttl_minutes} minutes.
          </p>
          <p style="margin:0; color:#9ca3af; font-size:12px;">
            If you didn't request this change, you can safely ignore this email.
            No changes will be made until the code is entered.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_otp_email(
    *,
    to_email: str,
    code: str,
    purpose: Purpose,
    ttl_minutes: int,
) -> email_service.SendResult:
    return email_service.send_email(
        to=[to_email],
        subject=_subject(purpose),
        html=_render_html(code=code, purpose=purpose, ttl_minutes=ttl_minutes),
    )
