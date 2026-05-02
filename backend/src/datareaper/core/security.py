from __future__ import annotations

from fastapi import Header, HTTPException, status


async def verify_internal_header(x_datareaper_key: str | None = Header(default=None)) -> None:
    if x_datareaper_key is None:
        return
    if len(x_datareaper_key.strip()) < 8:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key")
