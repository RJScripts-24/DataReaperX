"""Content endpoints for landing-page resource cards."""

from __future__ import annotations

from fastapi import APIRouter, Query

from datareaper.schemas.api_v1 import ResourceCard, ResourceCardListResponse

router = APIRouter()

_DEFAULT_RESOURCES = [
    ResourceCard(
        id="res_architecture",
        tag="architecture",
        title="The Architecture of DataReaper: Sleuth, Legal, and Communications Agents",
        imageUrl="/images/product-fabric.jpg",
        href="/docs/guidelines.md",
    ),
    ResourceCard(
        id="res_triage",
        tag="nlp triage",
        title="Advanced NLP Triage: How We Handle Stalling and Illegal Pushback",
        imageUrl="/images/product-shuttle.jpg",
        href="/docs/guidelines.md",
    ),
    ResourceCard(
        id="res_legal",
        tag="legal",
        title="Understanding DPDP and GDPR: Your Rights to Data Deletion",
        imageUrl="/images/problem-people.png",
        href="/docs/guidelines.md",
    ),
]


@router.get("/resources", response_model=ResourceCardListResponse)
async def list_resources(section: str = Query(default="framework")) -> ResourceCardListResponse:
    _ = section
    return ResourceCardListResponse(items=_DEFAULT_RESOURCES)
