from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from datareaper.realtime.event_bus import event_bus

router = APIRouter()
_resume_event = asyncio.Event()


class ResumeAgentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scan_id: str = Field(alias="scanId")


def _valid_session_token(token: str | None) -> bool:
    return bool(token and token.strip() and len(token.strip()) >= 8)


async def wait_for_resume_signal(timeout_seconds: float | None = None) -> bool:
    """Block until the resume event is triggered.

    Args:
        timeout_seconds: Optional wait timeout in seconds.

    Returns:
        True when resume is triggered, False on timeout.
    """
    _resume_event.clear()
    try:
        if timeout_seconds is None:
            await _resume_event.wait()
            return True
        await asyncio.wait_for(_resume_event.wait(), timeout=timeout_seconds)
        return True
    except TimeoutError:
        return False
    finally:
        _resume_event.clear()


@router.post("/agent/resume")
async def resume_agent(
    payload: ResumeAgentRequest,
    x_session_id: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> dict[str, str]:
    """Resume paused agent execution after manual CAPTCHA completion.

    Args:
        payload: Resume request body with scan identifier.
        x_session_id: Session token from frontend header.

    Returns:
        Resume acknowledgement payload.
    """
    if not _valid_session_token(x_session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid session token",
        )

    _resume_event.set()
    await event_bus.publish(
        "warroom.engagements",
        {
            "event": "agent_resumed",
            "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "scanId": payload.scan_id,
            "payload": {},
        },
    )
    return {"status": "resumed"}


__all__ = ["ResumeAgentRequest", "router", "wait_for_resume_signal"]