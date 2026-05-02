from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

try:
    from loguru import logger
except Exception:  # pragma: no cover - fallback only used in minimal environments
    import logging

    logger = logging.getLogger(__name__)

from datareaper.realtime.event_bus import event_bus

from . import byob_browser
from . import captcha_detector
from . import flaresolverr_client
from .exceptions import (
    AllMethodsExhaustedError,
    BYOBNotAvailableError,
    FlareSolverrError,
)
from .resume_handler import wait_for_resume_signal

try:  # pragma: no cover - optional runtime dependency
    from . import uc_browser
except Exception:  # pragma: no cover - optional runtime dependency
    uc_browser = None


class _EventBusWsManager:
    def __init__(self, scan_id: str) -> None:
        self._scan_id = scan_id

    async def broadcast(self, payload: dict[str, Any]) -> None:
        event_name = str(payload.get("event") or "warroom.engagement.updated")
        event_payload = {k: v for k, v in payload.items() if k != "event"}
        await event_bus.publish(
            "warroom.engagements",
            {
                "event": event_name,
                "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "scanId": self._scan_id,
                "payload": event_payload,
            },
        )


async def _detect_and_pause_if_needed(
    html: str,
    state: dict[str, Any],
    ws_manager: Any,
) -> bool:
    captcha_info = captcha_detector.detect_captcha(html)
    if not captcha_info.get("detected"):
        return False

    state["captcha_type"] = captcha_info.get("type")
    state["last_html"] = html
    await captcha_detector.handle_captcha_block(state, ws_manager)
    await wait_for_resume_signal()
    state["paused"] = False
    state["pause_reason"] = None
    state["captcha_type"] = None
    return True


async def fetch_with_fallback(url: str, state: dict[str, Any], ws_manager: Any) -> str | None:
    """Fetch page HTML via BYOB -> FlareSolverr -> UC fallback cascade.

    Args:
        url: Target URL to scrape.
        state: Mutable LangGraph-style state dictionary.
        ws_manager: WebSocket manager exposing an async broadcast method.

    Returns:
        HTML string on success, otherwise None when all methods fail.
    """
    state.setdefault("failed_brokers", [])
    ws = ws_manager or _EventBusWsManager(str(state.get("scan_id") or "unknown_scan"))

    method_errors: list[str] = []

    logger.info(f"[Orchestrator] Attempting byob for {url}")
    try:
        html = await byob_browser.get_byob_page(url)
        if await _detect_and_pause_if_needed(html, state, ws):
            return await fetch_with_fallback(url, state, ws)
        return html
    except BYOBNotAvailableError as exc:
        logger.warning(f"[Orchestrator] byob failed: {exc}")
        method_errors.append(f"byob={exc}")
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning(f"[Orchestrator] byob failed: {exc}")
        method_errors.append(f"byob={exc}")

    logger.info(f"[Orchestrator] Attempting flaresolverr for {url}")
    try:
        response = await flaresolverr_client.probe_with_clearance(url)
        html = response.text
        if await _detect_and_pause_if_needed(html, state, ws):
            return await fetch_with_fallback(url, state, ws)
        return html
    except FlareSolverrError as exc:
        logger.warning(f"[Orchestrator] flaresolverr failed: {exc}")
        method_errors.append(f"flaresolverr={exc}")
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning(f"[Orchestrator] flaresolverr failed: {exc}")
        method_errors.append(f"flaresolverr={exc}")

    logger.info(f"[Orchestrator] Attempting uc for {url}")
    try:
        uc_module = uc_browser
        if uc_module is None:
            from . import uc_browser as uc_module

        html = await asyncio.to_thread(uc_module.scrape_with_uc, url)
        if await _detect_and_pause_if_needed(html, state, ws):
            return await fetch_with_fallback(url, state, ws)
        return html
    except Exception as exc:
        logger.warning(f"[Orchestrator] uc failed: {exc}")
        method_errors.append(f"uc={exc}")

    error_message = "; ".join(method_errors) if method_errors else "unknown_error"
    logger.warning(f"[Orchestrator] all methods failed for {url}: {error_message}")
    if url not in state["failed_brokers"]:
        state["failed_brokers"].append(url)

    _ = AllMethodsExhaustedError(f"All fetch methods exhausted for {url}: {error_message}")
    return None


__all__ = ["fetch_with_fallback"]