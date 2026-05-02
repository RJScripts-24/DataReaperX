from __future__ import annotations

import asyncio

from datareaper.core.config import get_settings
from datareaper.db.session import SessionLocal
from datareaper.services.dashboard_service import DashboardService
from datareaper.services.onboarding_service import OnboardingService


async def main() -> None:
	settings = get_settings()
	seed = "smoke@email.com"

	if SessionLocal is None:
		payload = await DashboardService().get_dashboard(None, "smoke")
		print(payload)
		return

	async with SessionLocal() as session:
		initialized = await OnboardingService().initialize_scan(
			session=session,
			seeds=[seed],
			seed_type="email",
			jurisdiction="DPDP",
		)
		scan_id = initialized["scan_id"]
		payload = await DashboardService().get_dashboard(session, scan_id)
		print(payload)


if __name__ == "__main__":
	asyncio.run(main())
