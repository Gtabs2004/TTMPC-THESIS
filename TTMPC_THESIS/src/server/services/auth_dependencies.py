"""FastAPI dependency for verifying Supabase JWTs.

Every protected endpoint should depend on `get_current_user` so the caller's
identity comes from the verified access token, NOT from the request body.

Verification is done LOCALLY against the project's JWKS. The previous version
called Supabase Auth's /user endpoint on every request, which meant each
protected call carried a network round-trip; when that connection stalled the
resulting exception was reported as 401, so a flaky link was indistinguishable
from a revoked session and silently logged members out.
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from typing import Any

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWK

# Supabase access tokens are signed with the project's asymmetric signing key.
# Legacy projects issue HS256 tokens signed with the shared JWT secret instead;
# both are handled below.
_ASYMMETRIC_ALGS = ["ES256", "RS256"]

# Supabase puts this in every access token it mints.
_EXPECTED_AUDIENCE = "authenticated"

# Bound every outbound call. Without this the JWKS fetch inherits urllib's
# default of "wait indefinitely", which is what produced the 19-second hangs.
_JWKS_TIMEOUT_SECONDS = 5

# Signing keys rotate on the order of months, so the fetched JWK Set is cached
# on disk as well as in memory. That makes auth survive both a restart and a
# stalled link: the only time a request can block on the network is the very
# first fetch on a machine that has never reached Supabase.
_JWKS_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".jwks_cache.json")

_keys_by_kid: dict[str, PyJWK] = {}
_keys_lock = threading.RLock()


def _get_url() -> str | None:
    return os.environ.get("VITE_SUPABASE_URL")


def _get_jwt_secret() -> str | None:
    """Shared secret for legacy HS256 projects. Absent on signing-key projects."""
    return os.environ.get("SUPABASE_JWT_SECRET")


def _parse_jwks(raw: dict[str, Any]) -> dict[str, PyJWK]:
    parsed: dict[str, PyJWK] = {}
    for entry in raw.get("keys", []):
        kid = entry.get("kid")
        if not kid:
            continue
        try:
            parsed[kid] = PyJWK.from_dict(entry)
        except Exception:
            # One unusable entry must not discard the rest of the set.
            continue
    return parsed


def _load_cached_jwks() -> dict[str, PyJWK]:
    try:
        with open(_JWKS_CACHE_PATH, "r", encoding="utf-8") as fh:
            return _parse_jwks(json.load(fh))
    except Exception:
        return {}


def _fetch_jwks() -> dict[str, PyJWK]:
    """Fetch the JWK Set, persisting it on success. Raises on failure."""
    url = _get_url()
    if not url:
        raise HTTPException(status_code=500, detail="Auth not configured")

    endpoint = f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    with urllib.request.urlopen(endpoint, timeout=_JWKS_TIMEOUT_SECONDS) as resp:
        raw = json.loads(resp.read().decode("utf-8"))

    parsed = _parse_jwks(raw)
    if not parsed:
        raise ValueError("JWKS contained no usable keys")

    try:
        with open(_JWKS_CACHE_PATH, "w", encoding="utf-8") as fh:
            json.dump(raw, fh)
    except OSError:
        # A read-only deployment still works, just without restart persistence.
        pass

    return parsed


def _get_key_for_kid(kid: str) -> PyJWK:
    """Resolve a signing key, refreshing from the network only when needed.

    Order: in-memory, then the on-disk cache, then the network. A key already
    known is returned without any I/O, so a network stall cannot affect the
    steady-state path at all.
    """
    with _keys_lock:
        if kid in _keys_by_kid:
            return _keys_by_kid[kid]

        if not _keys_by_kid:
            _keys_by_kid.update(_load_cached_jwks())
            if kid in _keys_by_kid:
                return _keys_by_kid[kid]

        # Unknown kid: either a genuine rotation or a forged token. Either way
        # the set has to be refetched once to find out.
        try:
            _keys_by_kid.update(_fetch_jwks())
        except HTTPException:
            raise
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise HTTPException(
                status_code=503,
                detail="Could not reach the authentication service. Please retry.",
            ) from exc

        key = _keys_by_kid.get(kid)
        if key is None:
            # The live set genuinely has no such key -> the token is bogus.
            raise HTTPException(status_code=401, detail="Unrecognized signing key")
        return key


def warm_jwks_cache() -> bool:
    """Best-effort preload so the first authenticated request never waits.

    Safe to call at startup; returns whether keys are now available.
    """
    with _keys_lock:
        if _keys_by_kid:
            return True
        _keys_by_kid.update(_load_cached_jwks())
        if _keys_by_kid:
            return True
        try:
            _keys_by_kid.update(_fetch_jwks())
        except Exception:
            return False
        return bool(_keys_by_kid)


def _decode_asymmetric(token: str, kid: str | None) -> dict[str, Any]:
    """Verify a signing-key token, translating failures into the right status.

    The distinction that matters here: a bad signature or an expired token is
    the caller's problem (401), but an unreachable JWKS endpoint is ours (503).
    Collapsing the two into 401 is what made network stalls look like auth
    failures.
    """
    if not kid:
        raise HTTPException(status_code=401, detail="Token has no key id")

    signing_key = _get_key_for_kid(kid)
    try:
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=_ASYMMETRIC_ALGS,
            audience=_EXPECTED_AUDIENCE,
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def _decode_hs256(token: str, secret: str) -> dict[str, Any]:
    """Verify a legacy shared-secret token. No network involved."""
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=_EXPECTED_AUDIENCE,
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def get_current_user(authorization: str = Header(None)) -> dict[str, Any]:
    """Verify the bearer token and return the authenticated user.

    Raises 401 when the token itself is missing, malformed, expired or
    unverifiable; 503 when the signing keys cannot be fetched.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Malformed token: {exc}")

    alg = header.get("alg")
    if alg == "HS256":
        secret = _get_jwt_secret()
        if not secret:
            raise HTTPException(
                status_code=500,
                detail="Auth not configured: SUPABASE_JWT_SECRET required for HS256 tokens",
            )
        claims = _decode_hs256(token, secret)
    elif alg in _ASYMMETRIC_ALGS:
        claims = _decode_asymmetric(token, header.get("kid"))
    else:
        raise HTTPException(status_code=401, detail=f"Unsupported token algorithm: {alg}")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "id": str(user_id),
        "email": (claims.get("email") or "").lower(),
    }


def get_current_user_optional(authorization: str = Header(None)) -> dict[str, Any] | None:
    """Like get_current_user, but never raises — returns None on any failure.

    For endpoints where identifying the caller only improves a side effect
    (e.g. attributing an audit_log row to the real actor instead of
    service_role) and must never block the actual action a missing, expired,
    or malformed token would otherwise fail on.
    """
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
