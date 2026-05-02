from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class ScanStage(Base, TimestampMixin):
    __tablename__ = "scan_stages"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True)
    name = Column(String(64))
    status = Column(String(32), default="pending")
