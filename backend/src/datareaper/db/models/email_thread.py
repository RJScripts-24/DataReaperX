from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class EmailThread(Base, TimestampMixin):
    __tablename__ = "email_threads"

    id = Column(String(36), primary_key=True)
    broker_case_id = Column(String(36), nullable=True, index=True)
    external_thread_id = Column(String(255), nullable=True)
    subject = Column(String(255), nullable=True)
    status = Column(String(32), default="active")
