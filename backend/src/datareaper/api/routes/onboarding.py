from __future__ import annotations

from time import perf_counter

from fastapi import APIRouter, Depends, Request

from datareaper.api.deps import DbSession, get_onboarding_service
from datareaper.intake.consent_guard import enforce_consent
from datareaper.core.logging import get_logger
from datareaper.schemas.onboarding import OnboardingInitializeRequest, OnboardingInitializeResponse
from datareaper.services.onboarding_service import OnboardingService

router = APIRouter()
logger = get_logger(__name__)


@router.post("/initialize", response_model=OnboardingInitializeResponse)
async def initialize(
    request: Request,
    payload: OnboardingInitializeRequest,
    db: DbSession,
    service: OnboardingService = Depends(get_onboarding_service),
) -> dict:
    started = perf_counter()
    request_id = getattr(request.state, "request_id", None)

    logger.info(
        "onboarding_initialize_request_received",
        request_id=request_id,
        seeds_count=len(payload.seeds),
        seed_type=payload.seed_type,
        jurisdiction=payload.jurisdiction,
        consent_confirmed=payload.consent_confirmed,
    )

    try:
        enforce_consent(payload.consent_confirmed)
        response = await service.initialize_scan(db, payload.seeds, payload.seed_type, payload.jurisdiction)
        logger.info(
            "onboarding_initialize_request_completed",
            request_id=request_id,
            scan_id=response.get("scan_id"),
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
        return response
    except Exception as exc:
        logger.exception(
            "onboarding_initialize_request_failed",
            request_id=request_id,
            duration_ms=round((perf_counter() - started) * 1000, 2),
            error=str(exc),
        )
        raise
