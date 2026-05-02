"""Add owner_google_sub to scan_jobs for per-user isolation."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_scan_job_owner_google_sub"
down_revision = "0006_access_mirror_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scan_jobs", sa.Column("owner_google_sub", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_jobs", "owner_google_sub")
