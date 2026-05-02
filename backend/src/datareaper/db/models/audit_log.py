from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True)
    action = Column(String(100))
    payload = Column(JSONType, default=dict)
    actor = Column(String(100), nullable=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
