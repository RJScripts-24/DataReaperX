from __future__ import annotations

import asyncio
import inspect
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    from supabase import Client, create_client
except Exception:  # pragma: no cover - optional dependency in local dev
    Client = Any  # type: ignore[misc,assignment]
    create_client = None

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger

logger = get_logger(__name__)
EVIDENCE_BUCKET = "evidence-vault"
_SUPABASE_PROXY_SHIM_APPLIED = False


def _apply_gotrue_proxy_shim() -> None:
    """Bridge gotrue's `proxy` kwarg to legacy httpx `proxies` when needed."""

    global _SUPABASE_PROXY_SHIM_APPLIED
    if _SUPABASE_PROXY_SHIM_APPLIED:
        return

    try:
        import httpx
        from gotrue import http_clients as gotrue_http_clients
    except Exception:  # pragma: no cover - optional dependency in local dev
        return

    if "proxy" in inspect.signature(httpx.Client.__init__).parameters:
        _SUPABASE_PROXY_SHIM_APPLIED = True
        return

    original_init = gotrue_http_clients.SyncClient.__init__

    def _sync_client_init(self: Any, *args: Any, **kwargs: Any) -> None:
        if "proxy" in kwargs and "proxies" not in kwargs:
            proxy_value = kwargs.pop("proxy")
            if proxy_value is not None:
                kwargs["proxies"] = proxy_value
        original_init(self, *args, **kwargs)

    gotrue_http_clients.SyncClient.__init__ = _sync_client_init
    _SUPABASE_PROXY_SHIM_APPLIED = True


def get_supabase_client() -> Client:
    settings = get_settings()
    if create_client is None:
        raise RuntimeError("Supabase SDK is not installed")
    if not settings.supabase_url or not settings.supabase_key:
        raise ValueError("Supabase credentials are not configured")
    try:
        return create_client(settings.supabase_url, settings.supabase_key)
    except TypeError as exc:
        if "unexpected keyword argument 'proxy'" not in str(exc):
            raise
        _apply_gotrue_proxy_shim()
        return create_client(settings.supabase_url, settings.supabase_key)


async def upload_evidence(file_bytes: bytes, filename: str, mime_type: str) -> str:
    """Upload evidence to Supabase storage and return its public URL."""

    if not file_bytes:
        raise ValueError("Evidence payload is empty")

    safe_name = Path(filename).name or "evidence.bin"
    object_name = f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{safe_name}"

    def _upload() -> str:
        client = get_supabase_client()
        bucket = client.storage.from_(EVIDENCE_BUCKET)
        bucket.upload(
            object_name,
            file_bytes,
            file_options={"content-type": mime_type, "upsert": "false"},
        )
        return bucket.get_public_url(object_name)

    try:
        return await asyncio.to_thread(_upload)
    except Exception as exc:  # pragma: no cover - external service failures
        logger.warning("evidence_upload_failed", filename=safe_name, error=str(exc))
        raise
