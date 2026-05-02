from __future__ import annotations

from sqlalchemy import Column, Integer, String

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class BrokerListing(Base, TimestampMixin):
    __tablename__ = "broker_listings"

    id = Column(String(36), primary_key=True)
    broker_id = Column(String(36), nullable=True)
    profile_id = Column(String(36), nullable=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    status = Column(String(32), default="identified")
    confidence = Column(Integer, default=90)
    matched_data = Column(JSONType, default=dict)
