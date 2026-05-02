"""In-memory realtime token issuance and validation for websocket bootstrap flows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
import threading


@dataclass
class RealtimeClaim:
    connection_id: str
    scan_id: str
    channels: list[str]
    transport: str
    expires_at: datetime


_LOCK = threading.Lock()
_TOKENS: dict[str, RealtimeClaim] = {}
_DEFAULT_TTL = timedelta(minutes=20)


def issue_realtime_claim(
    *,
    scan_id: str,
    channels: list[str],
    transport: str = "websocket",
    ttl: timedelta = _DEFAULT_TTL,
) -> tuple[str, str, datetime]:
    connection_id = f"rtc_{secrets.token_hex(12)}"
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + ttl
    claim = RealtimeClaim(
        connection_id=connection_id,
        scan_id=scan_id,
        channels=channels,
        transport=transport,
        expires_at=expires_at,
    )

    with _LOCK:
        _TOKENS[token] = claim

    return connection_id, token, expires_at


def get_realtime_claim(token: str) -> RealtimeClaim | None:
    now = datetime.now(timezone.utc)
    with _LOCK:
        claim = _TOKENS.get(token)
        if claim is None:
            return None
        if claim.expires_at <= now:
            _TOKENS.pop(token, None)
            return None
        return claim


def revoke_realtime_token(token: str) -> None:
    with _LOCK:
        _TOKENS.pop(token, None)
