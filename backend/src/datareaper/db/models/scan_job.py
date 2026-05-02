from __future__ import annotations

from sqlalchemy import Column, Integer, String

from datareaper.db.base import Base, TimestampMixin


class ScanJob(Base, TimestampMixin):
    __tablename__ = "scan_jobs"

    id = Column(String(36), primary_key=True)
    seed_id = Column(String(36), nullable=True)
    status = Column(String(32), default="initializing")
    progress = Column(Integer, default=0)
    current_stage = Column(String(64), default="validate_seed")
    jurisdiction = Column(String(32), default="DPDP")
