from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class Broker(Base, TimestampMixin):
    __tablename__ = "brokers"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), unique=True)
    category = Column(String(64), nullable=True)
    priority = Column(String(32), nullable=True)
