from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(320), nullable=True)
    display_name = Column(String(120), nullable=True)
