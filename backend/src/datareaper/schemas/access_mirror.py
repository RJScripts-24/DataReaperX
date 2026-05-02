from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class OAuthGrant(BaseModel):
    id: str
    app: str
    permissions: list[str]
    risk: Literal["HIGH", "MEDIUM", "LOW"]
    source: Literal["gmail_grant", "calendar_grant", "drive_grant", "signin"]


class AuthorizedApp(BaseModel):
    app: str
    grantedDate: str
    scopes: list[str]


class DataMirrorStat(BaseModel):
    label: str
    value: str
    icon: str


class DataMirrorTimelineEvent(BaseModel):
    year: str
    event: str
    severity: Literal["low", "medium", "high"]


class DataMirrorRecommendation(BaseModel):
    action: str
    priority: Literal["high", "medium", "low"]


class GoogleConnectRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class GoogleOAuthConfigResponse(BaseModel):
    configured: bool
    clientId: str


class GoogleConnectResponse(BaseModel):
    connected: bool
    google_email: str | None = None
    grants: list[OAuthGrant] = Field(default_factory=list)
    connection_id: str | None = None


class GrantsResponse(BaseModel):
    connected: bool
    google_email: str | None = None
    grants: list[OAuthGrant] = Field(default_factory=list)
    revocation_log: dict[str, Any] = Field(default_factory=dict)


class RevokeResponse(BaseModel):
    revoked: bool
    app: str


class ParseResponse(BaseModel):
    report_id: str
    company: str
    summary: str
    stats: list[DataMirrorStat] = Field(default_factory=list)
    timeline: list[DataMirrorTimelineEvent] = Field(default_factory=list)
    thirdParties: list[str] = Field(default_factory=list)
    recommendations: list[DataMirrorRecommendation] = Field(default_factory=list)
    authorizedApps: list[AuthorizedApp] | None = None
