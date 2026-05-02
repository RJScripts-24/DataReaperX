from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class LegalRequest(Base, TimestampMixin):
    __tablename__ = "legal_requests"

    id = Column(String(36), primary_key=True)
    broker_case_id = Column(String(36), nullable=True, index=True)
    channel = Column(String(32), default="email")
    subject = Column(String(255), default="Data Deletion Request")
    body = Column(Text)
    citations = Column(JSONType, default=list)
    status = Column(String(32), default="drafted")
