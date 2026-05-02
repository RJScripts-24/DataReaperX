from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin


class IdentityAttribute(Base, TimestampMixin):
    __tablename__ = "identity_attributes"

    id = Column(String(36), primary_key=True)
    profile_id = Column(String(36), nullable=True)
    key = Column(String(64))
    value = Column(Text)
