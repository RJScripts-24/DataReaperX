from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.core.config import Settings, get_settings
from datareaper.db.session import get_db_session
from datareaper.services.audit_service import AuditService
from datareaper.services.dashboard_service import DashboardService
from datareaper.services.inbox_service import InboxService
from datareaper.services.onboarding_service import OnboardingService
from datareaper.services.recon_service import ReconService
from datareaper.services.report_service import ReportService
from datareaper.services.scan_service import ScanService
from datareaper.services.target_service import TargetService
from datareaper.services.war_room_service import WarRoomService

DbSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_app_settings() -> Settings:
    return get_settings()


def get_onboarding_service() -> OnboardingService:
    return OnboardingService()


def get_scan_service() -> ScanService:
    return ScanService()


def get_dashboard_service() -> DashboardService:
    return DashboardService()


def get_recon_service() -> ReconService:
    return ReconService()


def get_target_service() -> TargetService:
    return TargetService()


def get_war_room_service() -> WarRoomService:
    return WarRoomService()


def get_inbox_service() -> InboxService:
    return InboxService()


def get_report_service() -> ReportService:
    return ReportService()


def get_audit_service() -> AuditService:
    return AuditService()
