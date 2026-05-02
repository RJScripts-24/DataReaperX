from __future__ import annotations

from fastapi import APIRouter

from datareaper.api.routes import (
    content,
    dashboard,
    events,
    health,
    inbox,
    onboarding,
    recon,
    reports,
    scans,
    targets,
    v1_contract,
    war_room,
)
from datareaper.scraper.resume_handler import router as resume_router

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(scans.router, prefix="/scans", tags=["scans"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(recon.router, prefix="/recon", tags=["recon"])
api_router.include_router(targets.router, prefix="/targets", tags=["targets"])
api_router.include_router(war_room.router, prefix="/war-room", tags=["war-room"])
api_router.include_router(inbox.router, prefix="/inbox", tags=["inbox"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(resume_router, tags=["agent-control"])

v1_router = APIRouter()
v1_router.include_router(v1_contract.router, tags=["v1"])
v1_router.include_router(content.router, prefix="/content", tags=["content"])
