from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class ActivityEvent(Base, TimestampMixin):
    __tablename__ = "activity_events"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    event_type = Column(String(50))
    message = Column(Text)
    payload = Column(JSONType, default=dict)
