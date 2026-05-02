from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ApiMessage(BaseModel):
    message: str


class TimestampedModel(BaseModel):
    created_at: datetime | None = None
    updated_at: datetime | None = None
