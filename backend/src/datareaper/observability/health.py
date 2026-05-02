from __future__ import annotations

import arq
from sqlalchemy import text

from datareaper.core.config import get_settings
from datareaper.db.session import SessionLocal


async def check_health() -> dict:
    settings = get_settings()
    checks = {"db": False, "redis": False, "llm": bool(settings.groq_api_key)}

    if SessionLocal is not None:
        try:
            async with SessionLocal() as session:
                await session.execute(text("SELECT 1"))
            checks["db"] = True
        except Exception:
            checks["db"] = False

    try:
        pool = await arq.create_pool(
            arq.connections.RedisSettings.from_dsn(settings.effective_arq_redis_url)
        )
        await pool.ping()
        await pool.close()
        checks["redis"] = True
    except Exception:
        checks["redis"] = False

    status = "ok" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}


def health_snapshot() -> dict:
    return {"status": "ok"}
