from __future__ import annotations

from datareaper.services.onboarding_service import OnboardingService


async def initialize_scan(
    ctx: dict,
    seed: str = "",
    seeds: list[str] | None = None,
    seed_type: str = "auto",
    jurisdiction: str = "DPDP",
) -> dict:
    service = ctx.get("onboarding_service") or OnboardingService()
    session = ctx.get("db_session")
    effective_seeds = seeds or ([seed] if seed else [])
    return await service.initialize_scan(session, effective_seeds, seed_type, jurisdiction)


def run(scan_id: str) -> dict:
    return {"job": "initialize_scan", "scan_id": scan_id, "status": "queued"}
