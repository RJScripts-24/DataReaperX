"""Google OAuth session store shared by /v1 and authenticated /api routes."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field


class SessionPrincipal(BaseModel):
    """Principal returned after Google ID token exchange."""

    email: str = Field(..., description="Normalized Google email")
    google_sub: str = Field(..., description="Stable Google subject identifier")
    expires_at: datetime


_SESSION_TTL = timedelta(hours=8)
_SESSIONS: dict[str, SessionPrincipal] = {}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def issue_session(*, email: str, google_sub: str) -> tuple[str, SessionPrincipal]:
    session_id = f"ses_{secrets.token_hex(12)}"
    expires_at = _now_utc() + _SESSION_TTL
    principal = SessionPrincipal(email=email.strip(), google_sub=str(google_sub).strip(), expires_at=expires_at)
    _SESSIONS[session_id] = principal
    return session_id, principal


def get_session(session_id: str | None) -> SessionPrincipal | None:
    sid = str(session_id or "").strip()
    if not sid:
        return None
    principal = _SESSIONS.get(sid)
    if principal is None:
        return None
    if principal.expires_at <= _now_utc():
        _SESSIONS.pop(sid, None)
        return None
    return principal


def revoke_session(session_id: str) -> None:
    _SESSIONS.pop(str(session_id).strip(), None)
