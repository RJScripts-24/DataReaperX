from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class BrokerCase(Base, TimestampMixin):
    __tablename__ = "broker_cases"

    id = Column(String(36), primary_key=True)
    broker_listing_id = Column(String(36), nullable=True)
    broker_id = Column(String(36), nullable=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    broker_name = Column(String(255))
    status = Column(String(32), default="in-progress")
    jurisdiction = Column(String(32), default="DPDP")
    last_activity_label = Column(String(64), default="Just now")
    data_types = Column(JSONType, default=list)
