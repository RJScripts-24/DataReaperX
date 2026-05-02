from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class ReportSnapshot(Base, TimestampMixin):
    __tablename__ = "report_snapshots"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    summary = Column(Text)
    metrics = Column(JSONType, default=dict)
    highlights = Column(JSONType, default=list)
