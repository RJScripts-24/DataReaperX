from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from time import perf_counter
from urllib.parse import urlsplit

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from datareaper.core.config import get_settings
from datareaper.core.logging import configure_logging, get_logger
from datareaper.db import models as _models  # noqa: F401
from datareaper.db.base import Base
from datareaper.db.session import engine

logger = get_logger(__name__)


def _database_endpoint(database_url: str) -> str:
    parsed = urlsplit(database_url)
    host = parsed.hostname or "unknown"
    port = parsed.port
    if port is None:
        return host
    return f"{host}:{port}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.app_log_level, settings.app_log_format)

    logger.info(
        "application_startup_begin",
        env=settings.app_env,
        log_level=settings.app_log_level,
        log_format=settings.app_log_format,
        auto_create_tables=settings.app_auto_create_tables,
        startup_db_timeout_seconds=settings.app_startup_db_timeout_seconds,
        database_endpoint=_database_endpoint(settings.database_url),
    )

    if engine is not None:
        try:
            async with asyncio.timeout(settings.app_startup_db_timeout_seconds):
                await _check_database_connectivity(engine, settings.database_url)
        except TimeoutError:
            logger.error(
                "database_connectivity_check_timeout",
                database_endpoint=_database_endpoint(settings.database_url),
                timeout_seconds=settings.app_startup_db_timeout_seconds,
            )

    if settings.app_auto_create_tables and engine is not None:
        logger.info("database_create_tables_begin")
        await _create_tables(engine)
        logger.info("database_create_tables_completed")

    logger.info("application_startup_complete")
    yield


async def _create_tables(db_engine: AsyncEngine) -> None:
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _check_database_connectivity(db_engine: AsyncEngine, database_url: str) -> None:
    started = perf_counter()
    endpoint = _database_endpoint(database_url)

    try:
        async with db_engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        logger.info(
            "database_connectivity_check_succeeded",
            database_endpoint=endpoint,
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
    except Exception as exc:
        logger.error(
            "database_connectivity_check_failed",
            database_endpoint=endpoint,
            duration_ms=round((perf_counter() - started) * 1000, 2),
            error=str(exc),
        )
