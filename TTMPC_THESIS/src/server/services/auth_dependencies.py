"""FastAPI dependency for verifying Supabase JWTs.

Every protected endpoint should depend on `get_current_user` so the caller's
identity comes from the verified access token, NOT from the request body.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Header, HTTPException
from supabase import Client, create_client


def _get_url() -> str | None:
    return os.environ.get("VITE_SUPABASE_URL")


def _get_anon_key() -> str | None:
    return os.environ.get("VITE_SUPABASE_ANON_KEY")


def get_current_user(authorization: str = Header(None)) -> dict[str, Any]:
    """Verify the bearer token and return the authenticated user.

    Raises 401 on missing / invalid token.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")

    url = _get_url()
    anon_key = _get_anon_key()
    if not (url and anon_key):
        raise HTTPException(status_code=500, detail="Auth not configured")

    try:
        verifier: Client = create_client(url, anon_key)
        resp = verifier.auth.get_user(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {exc}")

    user = getattr(resp, "user", None)
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "id": str(user.id),
        "email": (getattr(user, "email", "") or "").lower(),
    }
