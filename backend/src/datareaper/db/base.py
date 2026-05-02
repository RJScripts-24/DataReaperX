from __future__ import annotations

from sqlalchemy import Column, DateTime, MetaData, func
from sqlalchemy.ext.declarative import declarative_base, declared_attr

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))


class TimestampMixin:
    @declared_attr
    def created_at(cls):  # noqa: N805
        return Column(DateTime(timezone=True), server_default=func.now())

    @declared_attr
    def updated_at(cls):  # noqa: N805
        return Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
