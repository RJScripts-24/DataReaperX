from __future__ import annotations

from datareaper.core.logging import get_logger
from datareaper.integrations.holehe.adapter import run_holehe

logger = get_logger(__name__)


async def discover_accounts_via_holehe(email: str) -> list[dict]:
    try:
        accounts = await run_holehe(email)
        logger.info("holehe_discovered_accounts", email=email, count=len(accounts))
        return accounts
    except Exception as exc:  # pragma: no cover - external integration failures
        logger.warning("holehe_discovery_failed", email=email, error=str(exc))
        return []
