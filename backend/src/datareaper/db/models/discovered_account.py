from __future__ import annotations

from sqlalchemy import Column, Integer, String

from datareaper.db.base import Base, TimestampMixin


class DiscoveredAccount(Base, TimestampMixin):
    __tablename__ = "discovered_accounts"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    profile_id = Column(String(36), nullable=True)
    platform = Column(String(64))
    username = Column(String(255))
    profile_url = Column(String(500), nullable=True)
    confidence = Column(Integer, default=90)
