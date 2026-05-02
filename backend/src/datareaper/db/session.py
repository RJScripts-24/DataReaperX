from __future__ import annotations

import ssl
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from datareaper.core.config import get_settings


def get_engine():
    settings = get_settings()
    engine_kwargs: dict = {}

    # Prevent cross-event-loop connection reuse in tests (TestClient starts/stops loops frequently).
    if settings.app_env == "test":
        engine_kwargs["poolclass"] = NullPool
    else:
        # Keep long-running worker/API sessions resilient to server-side connection closes.
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_recycle"] = 300

    if settings.is_supabase_db:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        engine_kwargs["connect_args"] = {"ssl": ssl_context}

    return create_async_engine(
        settings.database_url,
        echo=settings.app_debug,
        future=True,
        **engine_kwargs,
    )


try:
    engine = get_engine()
    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
except Exception:  # pragma: no cover - local fallback when DB driver is not installed
    engine = None
    SessionLocal = None


async def get_db_session() -> AsyncIterator[AsyncSession]:
    if SessionLocal is None:
        yield None  # type: ignore[misc]
        return
    async with SessionLocal() as session:
        yield session
