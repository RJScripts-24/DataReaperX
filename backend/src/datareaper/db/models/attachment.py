from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class Attachment(Base, TimestampMixin):
    __tablename__ = "attachments"

    id = Column(String(36), primary_key=True)
    email_message_id = Column(String(36), nullable=True)
    filename = Column(String(255))
    storage_path = Column(String(500))
    content_type = Column(String(120), nullable=True)
