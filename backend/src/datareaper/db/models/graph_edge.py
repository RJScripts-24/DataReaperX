from __future__ import annotations

from sqlalchemy import Column, String

from datareaper.db.base import Base, TimestampMixin


class GraphEdge(Base, TimestampMixin):
    __tablename__ = "graph_edges"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    source_node_key = Column(String(80))
    target_node_key = Column(String(80))
    relationship = Column(String(64))
