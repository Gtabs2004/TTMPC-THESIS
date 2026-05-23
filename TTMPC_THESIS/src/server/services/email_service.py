"""Low-level email transport for the loan notification workflow.

Wraps the Resend HTTP API. Designed so that callers can treat sending as
fire-and-forget: every public function returns a `SendResult` and never raises.
The notification layer is responsible for deciding whether to retry or log.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Iterable
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

logger = logging.getLogger("ttmpc.email")

RESEND_ENDPOINT = "https://api.resend.com/emails"
DEFAULT_TIMEOUT_SECONDS = 10
DEFAULT_MAX_ATTEMPTS = 2

# RFC 5322-ish; intentionally permissive but rejects obvious garbage.
_EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")


@dataclass
class SendResult:
    success: bool
    provider_message_id: str | None = None
    error: str | None = None
    attempts: int = 1
    skipped_reason: str | None = None


def _resend_api_key() -> str | None:
    return os.environ.get("RESEND_API_KEY") or os.environ.get("VITE_RESEND_API_KEY")


def _resend_from_email() -> str:
    return os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")


def is_valid_email(value: str | None) -> bool:
    if not value:
        return False
    candidate = str(value).strip()
    if not candidate or len(candidate) > 254:
        return False
    return bool(_EMAIL_RE.match(candidate))


def normalize_recipients(recipients: Iterable[str | None]) -> list[str]:
    """De-duplicate, lowercase, and validate a list of recipient addresses."""
    seen: list[str] = []
    for raw in recipients or []:
        if not raw:
            continue
        candidate = str(raw).strip().lower()
        if not is_valid_email(candidate):
            continue
        if candidate not in seen:
            seen.append(candidate)
    return seen


def sanitize_text(value: str | None, max_length: int = 2000) -> str:
    """Strip control chars and clip length. Intended for plain-text snippets
    rendered into the HTML body. The templates HTML-escape this further."""
    if value is None:
        return ""
    text = str(value)
    # Remove control characters except basic whitespace.
    text = "".join(ch for ch in text if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    text = text.strip()
    if len(text) > max_length:
        text = text[: max_length - 1] + "…"
    return text


def send_email(
    *,
    to: list[str],
    subject: str,
    html: str,
    reply_to: str | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> SendResult:
    """Send an email via Resend. Never raises — failures are reported on the
    returned `SendResult`. Caller logs and decides whether to retry later."""

    recipients = normalize_recipients(to)
    if not recipients:
        return SendResult(success=False, skipped_reason="no_valid_recipient", error="No valid recipient email.")

    api_key = _resend_api_key()
    if not api_key:
        return SendResult(success=False, skipped_reason="missing_api_key", error="RESEND_API_KEY is not configured.")

    payload = {
        "from": _resend_from_email(),
        "to": recipients,
        "subject": subject[:200] if subject else "(no subject)",
        "html": html,
    }
    if reply_to and is_valid_email(reply_to):
        payload["reply_to"] = reply_to

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "TTMPC-Loan-Notifier/1.0",
    }

    last_error: str | None = None
    for attempt in range(1, max(1, max_attempts) + 1):
        req = urlrequest.Request(RESEND_ENDPOINT, data=body, headers=headers, method="POST")
        try:
            with urlrequest.urlopen(req, timeout=timeout) as response:
                raw = response.read().decode("utf-8") if response else ""
                data = json.loads(raw) if raw else {}
                message_id = data.get("id") if isinstance(data, dict) else None
                return SendResult(success=True, provider_message_id=message_id, attempts=attempt)
        except HTTPError as err:
            error_body = ""
            try:
                error_body = err.read().decode("utf-8") if err.fp else ""
            except Exception:
                error_body = ""
            last_error = f"HTTP {err.code}: {error_body or err.reason}"
            # Don't retry client-side errors (auth, validation).
            if 400 <= err.code < 500 and err.code not in (408, 425, 429):
                break
        except URLError as err:
            last_error = f"network: {err.reason}"
        except Exception as err:  # pragma: no cover - defensive
            last_error = f"unexpected: {err}"

        if attempt < max_attempts:
            time.sleep(min(2 ** (attempt - 1), 4))

    logger.warning("Resend send failed after %s attempt(s): %s", max_attempts, last_error)
    return SendResult(success=False, error=last_error or "Unknown send failure", attempts=max_attempts)
