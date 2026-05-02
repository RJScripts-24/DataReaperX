from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Annotated, Any, AsyncIterator

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select

from datareaper.api.deps import DbSession
from datareaper.core.config import get_settings
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.models.access_mirror_report import AccessMirrorReport, GoogleOAuthConnection
from datareaper.schemas.access_mirror import (
    GoogleConnectRequest,
    GoogleConnectResponse,
    GoogleOAuthConfigResponse,
    GrantsResponse,
    ParseResponse,
    RevokeResponse,
)
from datareaper.services.access_mirror_parser import extract_google_oauth_grants, parse_export

router = APIRouter()
logger = get_logger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

MAX_UPLOAD_BYTES = 200 * 1024 * 1024

_memory_reports: dict[str, dict[str, Any]] = {}
_memory_connections: dict[str, dict[str, Any]] = {}


def _session_id(x_session_id: str | None = Header(default=None, alias="X-Session-Id")) -> str | None:
    value = str(x_session_id or "").strip()
    return value or None


async def _iter_upload_chunks(upload: UploadFile, chunk_size: int = 1024 * 1024) -> AsyncIterator[bytes]:
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        yield chunk


def _risk_from_scope(scope: str) -> tuple[str, str, str]:
    scope_map: dict[str, tuple[str, str, str]] = {
        "https://www.googleapis.com/auth/gmail.readonly": ("Gmail", "Read Gmail", "HIGH"),
        "https://www.googleapis.com/auth/gmail.send": ("Gmail", "Send email on your behalf", "HIGH"),
        "https://www.googleapis.com/auth/calendar": ("Google Calendar", "Manage your calendar", "MEDIUM"),
        "https://www.googleapis.com/auth/calendar.readonly": ("Google Calendar", "Read your calendar", "MEDIUM"),
        "https://www.googleapis.com/auth/drive": ("Google Drive", "Manage Drive files", "HIGH"),
        "https://www.googleapis.com/auth/drive.readonly": ("Google Drive", "Read Drive files", "LOW"),
        "https://www.googleapis.com/auth/contacts.readonly": ("Google Contacts", "Read your contacts", "MEDIUM"),
        "openid": ("Google Sign-in", "Verify your identity", "LOW"),
        "email": ("Google Sign-in", "See your email address", "LOW"),
        "profile": ("Google Sign-in", "See your basic profile info", "LOW"),
        "https://www.googleapis.com/auth/userinfo.email": ("Google Sign-in", "See your email address", "LOW"),
        "https://www.googleapis.com/auth/userinfo.profile": ("Google Sign-in", "See your basic profile info", "LOW"),
    }
    app, permission, risk = scope_map.get(scope, ("Google Account", scope, "LOW"))
    return app, permission, risk


def _scope_source(scope: str) -> str:
    if "gmail" in scope:
        return "gmail_grant"
    if "calendar" in scope:
        return "calendar_grant"
    if "drive" in scope:
        return "drive_grant"
    return "signin"


_RISK_WEIGHT = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
_SOURCE_WEIGHT = {"signin": 0, "drive_grant": 1, "calendar_grant": 1, "gmail_grant": 2}


def _max_risk(left: str, right: str) -> str:
    return left if _RISK_WEIGHT.get(left, 0) >= _RISK_WEIGHT.get(right, 0) else right


def _max_source(left: str, right: str) -> str:
    return left if _SOURCE_WEIGHT.get(left, 0) >= _SOURCE_WEIGHT.get(right, 0) else right


def _resolve_google_oauth_credentials() -> tuple[str, str]:
    settings = get_settings()
    client_id = str(settings.google_client_id or "").strip()
    client_secret = str(settings.google_client_secret or "").strip()
    return client_id, client_secret


def _is_missing_table_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "undefinedtableerror" in text or ('relation "' in text and '" does not exist' in text)


async def _ensure_access_mirror_schema(db: DbSession) -> bool:
    if db is None:
        return False

    try:
        connection = await db.connection()
        await connection.run_sync(lambda conn: AccessMirrorReport.__table__.create(bind=conn, checkfirst=True))
        await connection.run_sync(lambda conn: GoogleOAuthConnection.__table__.create(bind=conn, checkfirst=True))

        for index in AccessMirrorReport.__table__.indexes:
            await connection.run_sync(lambda conn, idx=index: idx.create(bind=conn, checkfirst=True))
        for index in GoogleOAuthConnection.__table__.indexes:
            await connection.run_sync(lambda conn, idx=index: idx.create(bind=conn, checkfirst=True))

        await db.commit()
        logger.info("access_mirror_schema_ensured")
        return True
    except Exception as schema_exc:  # pragma: no cover - schema repair best effort
        await db.rollback()
        logger.warning("access_mirror_schema_ensure_failed", error=str(schema_exc))
        return False


async def _fetch_google_grants(access_token: str) -> list[dict]:
    if not access_token:
        return []

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(GOOGLE_TOKEN_INFO_URL, params={"access_token": access_token})
        if response.status_code != 200:
            return []

        info = response.json()
        raw_scopes = [scope for scope in str(info.get("scope", "")).split() if scope]
        scopes: list[str] = []
        seen_scopes: set[str] = set()
        for scope in raw_scopes:
            if scope in seen_scopes:
                continue
            seen_scopes.add(scope)
            scopes.append(scope)

        grouped: dict[str, dict[str, Any]] = {}
        for scope in scopes:
            app, permission, risk = _risk_from_scope(scope)
            source = _scope_source(scope)

            entry = grouped.get(app)
            if entry is None:
                grouped[app] = {
                    "app": app,
                    "permissions": [permission],
                    "risk": risk,
                    "source": source,
                }
                continue

            existing_permissions = set(entry.get("permissions", []))
            if permission not in existing_permissions:
                entry["permissions"].append(permission)
            entry["risk"] = _max_risk(str(entry.get("risk", "LOW")), risk)
            entry["source"] = _max_source(str(entry.get("source", "signin")), source)

        ordered = sorted(
            grouped.values(),
            key=lambda item: (-_RISK_WEIGHT.get(str(item.get("risk", "LOW")), 0), str(item.get("app", "")).lower()),
        )

        grants: list[dict] = []
        for index, item in enumerate(ordered):
            grants.append(
                {
                    "id": f"live_{index}",
                    "app": item.get("app"),
                    "permissions": item.get("permissions", []),
                    "risk": item.get("risk", "LOW"),
                    "source": item.get("source", "signin"),
                }
            )
        return grants
    except Exception as exc:  # pragma: no cover - network failure fallback
        logger.warning("google_grants_fetch_failed", error=str(exc))
        return []


@router.get("/google/config", response_model=GoogleOAuthConfigResponse)
async def google_oauth_config() -> dict:
    client_id, _ = _resolve_google_oauth_credentials()
    return {"configured": bool(client_id), "clientId": client_id}


@router.post("/google/connect", response_model=GoogleConnectResponse)
async def google_connect(payload: GoogleConnectRequest, db: DbSession, session_id: str | None = Depends(_session_id)) -> dict:
    client_id, client_secret = _resolve_google_oauth_credentials()
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured on the backend.")

    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": payload.code,
                "code_verifier": payload.code_verifier,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": payload.redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        logger.warning("google_token_exchange_failed", status=token_resp.status_code)
        raise HTTPException(status_code=400, detail="Google token exchange failed. The code may have expired.")

    token_data = token_resp.json()
    access_token = str(token_data.get("access_token") or "")
    if not access_token:
        raise HTTPException(status_code=400, detail="Google did not return an access token.")

    google_email: str | None = None
    google_subject: str | None = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            user_resp = await client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if user_resp.status_code == 200:
            user_info = user_resp.json()
            google_email = str(user_info.get("email") or "").strip() or None
            google_subject = str(user_info.get("sub") or "").strip() or None
    except Exception as exc:  # pragma: no cover - identity lookup best effort
        logger.warning("google_userinfo_fetch_failed", error=str(exc))

    grants = await _fetch_google_grants(access_token)
    connection_id = new_id("gconn")
    scope_string = str(token_data.get("scope") or "")
    key = session_id or "__anonymous__"

    if db is not None:
        def _connection_row() -> GoogleOAuthConnection:
            return GoogleOAuthConnection(
                id=connection_id,
                session_id=session_id,
                google_email=google_email,
                google_subject=google_subject,
                encrypted_access_token=access_token,
                granted_scopes=scope_string,
                revocation_log={},
                status="connected",
            )

        try:
            db.add(_connection_row())
            await db.commit()
        except Exception as exc:  # pragma: no cover - best effort DB fallback
            await db.rollback()
            if _is_missing_table_error(exc) and await _ensure_access_mirror_schema(db):
                try:
                    db.add(_connection_row())
                    await db.commit()
                    logger.info("google_oauth_persist_recovered_after_schema_ensure", session_id=session_id)
                except Exception as retry_exc:
                    await db.rollback()
                    logger.warning(
                        "google_oauth_persist_retry_failed_falling_back",
                        error=str(retry_exc),
                        session_id=session_id,
                    )
                    _memory_connections[key] = {
                        "id": connection_id,
                        "google_email": google_email,
                        "access_token": access_token,
                        "grants": grants,
                        "revocation_log": {},
                        "status": "connected",
                    }
                    logger.warning("google_oauth_persist_failed_falling_back", error=str(exc), session_id=session_id)
                    return {
                        "connected": True,
                        "google_email": google_email,
                        "grants": grants,
                        "connection_id": connection_id,
                    }
                else:
                    logger.info("google_oauth_connected", session_id=session_id, email=google_email, grants=len(grants))
                    return {
                        "connected": True,
                        "google_email": google_email,
                        "grants": grants,
                        "connection_id": connection_id,
                    }

            logger.warning("google_oauth_persist_failed_falling_back", error=str(exc), session_id=session_id)
            _memory_connections[key] = {
                "id": connection_id,
                "google_email": google_email,
                "access_token": access_token,
                "grants": grants,
                "revocation_log": {},
                "status": "connected",
            }
    else:
        _memory_connections[key] = {
            "id": connection_id,
            "google_email": google_email,
            "access_token": access_token,
            "grants": grants,
            "revocation_log": {},
            "status": "connected",
        }

    logger.info("google_oauth_connected", session_id=session_id, email=google_email, grants=len(grants))
    return {"connected": True, "google_email": google_email, "grants": grants, "connection_id": connection_id}


@router.get("/google/grants", response_model=GrantsResponse)
async def google_grants(db: DbSession, session_id: str | None = Depends(_session_id)) -> dict:
    key = session_id or "__anonymous__"
    if db is not None:
        try:
            result = await db.execute(
                select(GoogleOAuthConnection)
                .where(
                    GoogleOAuthConnection.session_id == session_id,
                    GoogleOAuthConnection.status == "connected",
                )
                .order_by(GoogleOAuthConnection.created_at.desc())
                .limit(1)
            )
            conn = result.scalars().first()
            if conn is None:
                return {"connected": False, "google_email": None, "grants": [], "revocation_log": {}}
            grants = await _fetch_google_grants(conn.encrypted_access_token or "")
            return {
                "connected": True,
                "google_email": conn.google_email,
                "grants": grants,
                "revocation_log": dict(conn.revocation_log or {}),
            }
        except Exception as exc:  # pragma: no cover - best effort DB fallback
            if _is_missing_table_error(exc) and await _ensure_access_mirror_schema(db):
                try:
                    result = await db.execute(
                        select(GoogleOAuthConnection)
                        .where(
                            GoogleOAuthConnection.session_id == session_id,
                            GoogleOAuthConnection.status == "connected",
                        )
                        .order_by(GoogleOAuthConnection.created_at.desc())
                        .limit(1)
                    )
                    conn = result.scalars().first()
                    if conn is None:
                        return {"connected": False, "google_email": None, "grants": [], "revocation_log": {}}
                    grants = await _fetch_google_grants(conn.encrypted_access_token or "")
                    return {
                        "connected": True,
                        "google_email": conn.google_email,
                        "grants": grants,
                        "revocation_log": dict(conn.revocation_log or {}),
                    }
                except Exception as retry_exc:
                    logger.warning(
                        "google_oauth_grants_query_retry_failed_falling_back",
                        error=str(retry_exc),
                        session_id=session_id,
                    )
            logger.warning("google_oauth_grants_query_failed_falling_back", error=str(exc), session_id=session_id)

    mem = _memory_connections.get(key)
    if not mem:
        return {"connected": False, "google_email": None, "grants": [], "revocation_log": {}}
    return {
        "connected": True,
        "google_email": mem.get("google_email"),
        "grants": mem.get("grants", []),
        "revocation_log": mem.get("revocation_log", {}),
    }


@router.post("/google/revoke/{app_name}", response_model=RevokeResponse)
async def revoke_grant(app_name: str, db: DbSession, session_id: str | None = Depends(_session_id)) -> dict:
    logger.info("google_grant_revoke_requested", session_id=session_id, app=app_name)
    now_iso = datetime.now(UTC).isoformat()
    key = session_id or "__anonymous__"

    if db is not None:
        try:
            result = await db.execute(
                select(GoogleOAuthConnection)
                .where(
                    GoogleOAuthConnection.session_id == session_id,
                    GoogleOAuthConnection.status == "connected",
                )
                .order_by(GoogleOAuthConnection.created_at.desc())
                .limit(1)
            )
            conn = result.scalars().first()
            if conn is not None:
                log = dict(conn.revocation_log or {})
                log[app_name] = {"revoked": True, "revoked_at": now_iso}
                conn.revocation_log = log
                await db.commit()
        except Exception as exc:  # pragma: no cover - best effort DB fallback
            await db.rollback()
            if _is_missing_table_error(exc) and await _ensure_access_mirror_schema(db):
                try:
                    result = await db.execute(
                        select(GoogleOAuthConnection)
                        .where(
                            GoogleOAuthConnection.session_id == session_id,
                            GoogleOAuthConnection.status == "connected",
                        )
                        .order_by(GoogleOAuthConnection.created_at.desc())
                        .limit(1)
                    )
                    conn = result.scalars().first()
                    if conn is not None:
                        log = dict(conn.revocation_log or {})
                        log[app_name] = {"revoked": True, "revoked_at": now_iso}
                        conn.revocation_log = log
                        await db.commit()
                except Exception as retry_exc:
                    await db.rollback()
                    logger.warning(
                        "google_oauth_revoke_persist_retry_failed_falling_back",
                        error=str(retry_exc),
                        session_id=session_id,
                    )
            logger.warning("google_oauth_revoke_persist_failed_falling_back", error=str(exc), session_id=session_id)
    else:
        mem = _memory_connections.get(key, {})
        log = dict(mem.get("revocation_log", {}))
        log[app_name] = {"revoked": True, "revoked_at": now_iso}
        mem["revocation_log"] = log
        _memory_connections[key] = mem

    mem = _memory_connections.get(key, {})
    log = dict(mem.get("revocation_log", {}))
    log[app_name] = {"revoked": True, "revoked_at": now_iso}
    mem["revocation_log"] = log
    _memory_connections[key] = mem

    return {"revoked": True, "app": app_name}


@router.post("/parse", response_model=ParseResponse)
async def parse_data_export(
    platform: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    db: DbSession,
    session_id: str | None = Depends(_session_id),
) -> dict:
    valid_platforms = {"Google", "Instagram", "LinkedIn", "Amazon", "Spotify", "Uber", "Other"}
    if platform not in valid_platforms:
        raise HTTPException(status_code=400, detail=f"Unknown platform '{platform}'.")

    filename = file.filename or "export"
    chunks: list[bytes] = []
    total = 0
    async for chunk in _iter_upload_chunks(file):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 200 MB.")
        chunks.append(chunk)
    file_bytes = b"".join(chunks)

    logger.info(
        "access_mirror_parse_started",
        platform=platform,
        filename=filename,
        size_bytes=len(file_bytes),
        session_id=session_id,
    )

    loop = asyncio.get_running_loop()
    report = await loop.run_in_executor(None, parse_export, platform, filename, file_bytes)

    oauth_grants: list[dict] | None = None
    if platform == "Google":
        oauth_grants = await loop.run_in_executor(None, extract_google_oauth_grants, file_bytes)
        if oauth_grants:
            report["authorizedApps"] = oauth_grants

    report_id = new_id("amr")
    key = session_id or "__anonymous__"
    if db is not None:
        try:
            db.add(
                AccessMirrorReport(
                    id=report_id,
                    session_id=session_id,
                    source="file_upload",
                    platform=platform,
                    filename=filename,
                    report_payload=report,
                    oauth_grants=oauth_grants,
                    revocation_log={},
                )
            )
            await db.commit()
        except Exception as exc:  # pragma: no cover - best effort DB fallback
            await db.rollback()
            if _is_missing_table_error(exc) and await _ensure_access_mirror_schema(db):
                try:
                    db.add(
                        AccessMirrorReport(
                            id=report_id,
                            session_id=session_id,
                            source="file_upload",
                            platform=platform,
                            filename=filename,
                            report_payload=report,
                            oauth_grants=oauth_grants,
                            revocation_log={},
                        )
                    )
                    await db.commit()
                    logger.info("access_mirror_report_persist_recovered_after_schema_ensure", session_id=session_id)
                    return {"report_id": report_id, **report}
                except Exception as retry_exc:
                    await db.rollback()
                    logger.warning(
                        "access_mirror_report_persist_retry_failed_falling_back",
                        error=str(retry_exc),
                        session_id=session_id,
                    )
            logger.warning("access_mirror_report_persist_failed_falling_back", error=str(exc), session_id=session_id)
            _memory_reports[report_id] = {"session_id": session_id, "platform": platform, "report": report}
    else:
        _memory_reports[report_id] = {"session_id": key, "platform": platform, "report": report}

    logger.info("access_mirror_parse_complete", report_id=report_id, platform=platform)
    return {"report_id": report_id, **report}
