from __future__ import annotations

from pydantic import BaseModel, Field


class EventSchema(BaseModel):
    id: str
    channel: str
    payload: dict = Field(default_factory=dict)
