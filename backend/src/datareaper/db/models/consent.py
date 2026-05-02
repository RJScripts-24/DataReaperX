from __future__ import annotations

from sqlalchemy import Boolean, Column, String

from datareaper.db.base import Base, TimestampMixin


class Consent(Base, TimestampMixin):
    __tablename__ = "consents"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=True)
    seed_value = Column(String(320))
    confirmed = Column(Boolean, default=False)
