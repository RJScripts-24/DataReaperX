from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class EmailMessage(Base, TimestampMixin):
    __tablename__ = "email_messages"

    id = Column(String(36), primary_key=True)
    thread_id = Column(String(36), nullable=True, index=True)
    direction = Column(String(16))
    body = Column(Text)
    sender = Column(String(255), nullable=True)
    metadata_json = Column(JSONType, default=dict)
    display_timestamp = Column(String(64), default="Now")
