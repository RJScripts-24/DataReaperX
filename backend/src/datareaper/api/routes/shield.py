from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse
from redis.asyncio import Redis

from datareaper.core.logging import get_logger

from datareaper.core.config import get_settings as _get_settings

logger = get_logger(__name__)

router = APIRouter()

SHIELD_TOKEN_PREFIX = "shield_token:"
SHIELD_ACTIVE_PREFIX = "shield_active:"
SHIELD_TOKEN_TTL = 3600  # 1 hour
SHIELD_ACTIVE_TTL = 120   # 2 minutes
STATIC_ZIP_PATH = None  # lazily resolved


def _get_static_zip_path() -> str:
    """Resolve the static extension zip path lazily to avoid import-time errors."""
    global STATIC_ZIP_PATH
    if STATIC_ZIP_PATH is None:
        import os
        from datareaper.core.config import BACKEND_ROOT
        STATIC_ZIP_PATH = os.path.join(BACKEND_ROOT, "static", "datareaper-tripwire.zip")
    return STATIC_ZIP_PATH


async def get_redis() -> Redis:
    """Return a Redis client using the configured Redis URL."""
    s = _get_settings()
    return Redis.from_url(s.redis_url, encoding="utf-8", decode_responses=True)


def _valid_session_token(token: str | None) -> bool:
    return bool(token and token.strip() and len(token.strip()) >= 8)


# ---------------------------------------------------------------------------
# Endpoint 1: POST /shield/token
# ---------------------------------------------------------------------------
@router.post("/token")
async def issue_shield_token(
    x_session_id: Annotated[str | None, Header(alias="X-Session-Id")] = None,
    redis: Redis = Depends(get_redis),
) -> dict:
    """Issue a short-lived shield token tied to the session."""
    if not _valid_session_token(x_session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid session token",
        )

    token = uuid.uuid4().hex
    key = f"{SHIELD_TOKEN_PREFIX}{token}"
    await redis.setex(key, SHIELD_TOKEN_TTL, x_session_id.strip())

    return {"shield_token": token, "expires_in": SHIELD_TOKEN_TTL}


# ---------------------------------------------------------------------------
# Endpoint 2: GET /shield/status
# ---------------------------------------------------------------------------
@router.get("/status")
async def shield_status(
    x_session_id: Annotated[str | None, Header(alias="X-Session-Id")] = None,
    redis: Redis = Depends(get_redis),
) -> dict:
    """Report whether the shield extension is active for this session."""
    if not _valid_session_token(x_session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid session token",
        )

    active_key = f"{SHIELD_ACTIVE_PREFIX}{x_session_id.strip()}"
    raw = await redis.get(active_key)

    if raw:
        # raw stores the ISO timestamp string
        return {"active": True, "last_seen": raw}
    return {"active": False, "last_seen": None}


# ---------------------------------------------------------------------------
# Endpoint 3: POST /shield/heartbeat
# ---------------------------------------------------------------------------
@router.post("/heartbeat")
async def shield_heartbeat(
    authorization: Annotated[str | None, Header()] = None,
    redis: Redis = Depends(get_redis),
) -> dict:
    """Accept a heartbeat from the installed extension."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token",
        )

    token = authorization.removeprefix("Bearer ").strip()
    token_key = f"{SHIELD_TOKEN_PREFIX}{token}"
    session_id = await redis.get(token_key)

    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired shield token",
        )

    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    active_key = f"{SHIELD_ACTIVE_PREFIX}{session_id}"
    await redis.setex(active_key, SHIELD_ACTIVE_TTL, now_iso)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Endpoint 4: GET /shield/download
# ---------------------------------------------------------------------------
@router.get("/download")
async def download_extension():
    """Serve the pre-packaged Chrome extension zip."""
    import os
    zip_path = _get_static_zip_path()
    if not os.path.isfile(zip_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extension package not found.",
        )
    return FileResponse(
        path=zip_path,
        filename="datareaper-tripwire.zip",
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="datareaper-tripwire.zip"'},
    )


# ---------------------------------------------------------------------------
# Endpoint 5: GET /shield/config
# ---------------------------------------------------------------------------
@router.get("/config")
async def shield_config():
    """
    Return non-secret runtime config the extension and frontend need.
    No auth required — contains no keys, only URLs and feature flags.
    """
    s = _get_settings()
    return {
        "dashboard_origin": s.shield_dashboard_origin,
        "api_base": s.shield_api_base,
        "safe_browsing_enabled": bool(s.google_safe_browsing_api_key),
    }
