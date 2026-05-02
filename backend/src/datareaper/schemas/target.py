from __future__ import annotations

from pydantic import BaseModel, Field


class BrokerTargetSchema(BaseModel):
    id: str
    broker_name: str
    status: str
    last_activity: str
    message_count: int
    data_types: list[str]
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
