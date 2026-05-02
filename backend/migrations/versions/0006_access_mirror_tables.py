"""Add access_mirror_reports and google_oauth_connections tables.

Revision ID: 0006_access_mirror_tables
Revises: 0005_audit_and_events
Create Date: 2026-05-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_access_mirror_tables"
down_revision = "0005_audit_and_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "access_mirror_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("platform", sa.String(64), nullable=False),
        sa.Column("filename", sa.String(512), nullable=True),
        sa.Column("report_payload", sa.JSON(), nullable=True),
        sa.Column("oauth_grants", sa.JSON(), nullable=True),
        sa.Column("revocation_log", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_access_mirror_reports_session_id", "access_mirror_reports", ["session_id"])

    op.create_table(
        "google_oauth_connections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column("google_email", sa.String(320), nullable=True),
        sa.Column("google_subject", sa.String(255), nullable=True),
        sa.Column("encrypted_access_token", sa.Text(), nullable=True),
        sa.Column("granted_scopes", sa.Text(), nullable=True),
        sa.Column("revocation_log", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), server_default="connected"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_google_oauth_connections_session_id", "google_oauth_connections", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_google_oauth_connections_session_id", table_name="google_oauth_connections")
    op.drop_table("google_oauth_connections")
    op.drop_index("ix_access_mirror_reports_session_id", table_name="access_mirror_reports")
    op.drop_table("access_mirror_reports")
