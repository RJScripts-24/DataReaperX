from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.api.session_auth import SessionPrincipal, get_session
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


def require_google_session(
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
) -> SessionPrincipal:
    session_id = str(x_session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session token.")
    principal = get_session(session_id)
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid or expired.")
    if principal.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired.")
    return principal


RequireGoogleSession = Annotated[SessionPrincipal, Depends(require_google_session)]


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
