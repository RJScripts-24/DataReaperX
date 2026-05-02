from __future__ import annotations

from sqlalchemy import Column, String, Text

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class AccessMirrorReport(Base, TimestampMixin):
    __tablename__ = "access_mirror_reports"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(255), nullable=True, index=True)
    source = Column(String(32), nullable=False)
    platform = Column(String(64), nullable=False)
    filename = Column(String(512), nullable=True)
    report_payload = Column(JSONType, default=dict)
    oauth_grants = Column(JSONType, nullable=True)
    revocation_log = Column(JSONType, default=dict)


class GoogleOAuthConnection(Base, TimestampMixin):
    __tablename__ = "google_oauth_connections"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(255), nullable=True, index=True)
    google_email = Column(String(320), nullable=True)
    google_subject = Column(String(255), nullable=True)
    encrypted_access_token = Column(Text, nullable=True)
    granted_scopes = Column(Text, nullable=True)
    revocation_log = Column(JSONType, default=dict)
    status = Column(String(32), default="connected")
