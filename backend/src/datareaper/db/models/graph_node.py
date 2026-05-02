from __future__ import annotations

from sqlalchemy import Column, Float, String

from datareaper.db.base import Base, TimestampMixin
from datareaper.db.types import JSONType


class GraphNode(Base, TimestampMixin):
    __tablename__ = "graph_nodes"

    id = Column(String(36), primary_key=True)
    scan_job_id = Column(String(36), nullable=True, index=True)
    node_key = Column(String(80), index=True)
    node_type = Column(String(32))
    label = Column(String(255))
    pos_x = Column(Float, default=0)
    pos_y = Column(Float, default=0)
    payload = Column(JSONType, default=dict)
