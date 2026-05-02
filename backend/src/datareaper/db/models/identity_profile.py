from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class IdentityProfile(Base, TimestampMixin):
    __tablename__ = "identity_profiles"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    name = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    summary = Column(JSONType, default=dict)
