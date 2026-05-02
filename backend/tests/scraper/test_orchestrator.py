from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest

import datareaper.scraper.orchestrator as orchestrator_module
from datareaper.scraper.exceptions import BYOBNotAvailableError, FlareSolverrError
from datareaper.scraper.orchestrator import fetch_with_fallback


class DummyWsManager:
    async def broadcast(self, payload: dict) -> None:
        _ = payload


@pytest.mark.asyncio
async def test_fetch_with_fallback_uses_byob_first(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_byob(url: str) -> str:
        return f"<html>{url}</html>"

    async def fake_probe(url: str) -> httpx.Response:
        raise AssertionError("FlareSolverr should not be called when BYOB succeeds")

    def fake_uc(url: str) -> str:
        raise AssertionError("UC should not be called when BYOB succeeds")

    monkeypatch.setattr("datareaper.scraper.orchestrator.byob_browser.get_byob_page", fake_byob)
    monkeypatch.setattr("datareaper.scraper.orchestrator.flaresolverr_client.probe_with_clearance", fake_probe)
    monkeypatch.setattr(orchestrator_module, "uc_browser", SimpleNamespace(scrape_with_uc=fake_uc))
    monkeypatch.setattr(
        "datareaper.scraper.orchestrator.captcha_detector.detect_captcha",
        lambda html: {"detected": False, "type": None},
    )

    result = await fetch_with_fallback("https://example.com", {"failed_brokers": []}, DummyWsManager())
    assert result == "<html>https://example.com</html>"


@pytest.mark.asyncio
async def test_fetch_with_fallback_uses_flaresolverr_when_byob_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_byob(url: str) -> str:
        raise BYOBNotAvailableError("BYOB unavailable")

    async def fake_probe(url: str) -> httpx.Response:
        return httpx.Response(200, text="<html>flare</html>")

    monkeypatch.setattr("datareaper.scraper.orchestrator.byob_browser.get_byob_page", fake_byob)
    monkeypatch.setattr("datareaper.scraper.orchestrator.flaresolverr_client.probe_with_clearance", fake_probe)
    monkeypatch.setattr(
        "datareaper.scraper.orchestrator.captcha_detector.detect_captcha",
        lambda html: {"detected": False, "type": None},
    )

    state = {"failed_brokers": []}
    result = await fetch_with_fallback("https://example.com", state, DummyWsManager())
    assert result == "<html>flare</html>"


@pytest.mark.asyncio
async def test_fetch_with_fallback_uses_uc_after_flaresolverr_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_byob(url: str) -> str:
        raise BYOBNotAvailableError("BYOB unavailable")

    async def fake_probe(url: str) -> httpx.Response:
        raise FlareSolverrError("flare down")

    def fake_uc(url: str) -> str:
        return "<html>uc</html>"

    monkeypatch.setattr("datareaper.scraper.orchestrator.byob_browser.get_byob_page", fake_byob)
    monkeypatch.setattr("datareaper.scraper.orchestrator.flaresolverr_client.probe_with_clearance", fake_probe)
    monkeypatch.setattr(orchestrator_module, "uc_browser", SimpleNamespace(scrape_with_uc=fake_uc))
    monkeypatch.setattr(
        "datareaper.scraper.orchestrator.captcha_detector.detect_captcha",
        lambda html: {"detected": False, "type": None},
    )

    state = {"failed_brokers": []}
    result = await fetch_with_fallback("https://example.com", state, DummyWsManager())
    assert result == "<html>uc</html>"


@pytest.mark.asyncio
async def test_fetch_with_fallback_marks_failed_broker_when_all_methods_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_byob(url: str) -> str:
        raise BYOBNotAvailableError("BYOB unavailable")

    async def fake_probe(url: str) -> httpx.Response:
        raise FlareSolverrError("flare down")

    def fake_uc(url: str) -> str:
        raise RuntimeError("uc unavailable")

    monkeypatch.setattr("datareaper.scraper.orchestrator.byob_browser.get_byob_page", fake_byob)
    monkeypatch.setattr("datareaper.scraper.orchestrator.flaresolverr_client.probe_with_clearance", fake_probe)
    monkeypatch.setattr(orchestrator_module, "uc_browser", SimpleNamespace(scrape_with_uc=fake_uc))
    monkeypatch.setattr(
        "datareaper.scraper.orchestrator.captcha_detector.detect_captcha",
        lambda html: {"detected": False, "type": None},
    )

    state = {"failed_brokers": []}
    result = await fetch_with_fallback("https://blocked.example", state, DummyWsManager())

    assert result is None
    assert state["failed_brokers"] == ["https://blocked.example"]


@pytest.mark.asyncio
async def test_fetch_with_fallback_retries_after_resume_when_captcha_detected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_count = {"byob": 0, "detect": 0}

    async def fake_byob(url: str) -> str:
        call_count["byob"] += 1
        return "<html>challenge</html>"

    def fake_detect(html: str) -> dict:
        call_count["detect"] += 1
        if call_count["detect"] == 1:
            return {"detected": True, "type": "turnstile"}
        return {"detected": False, "type": None}

    async def fake_handle(state: dict, ws_manager: DummyWsManager) -> dict:
        state["paused"] = True
        state["pause_reason"] = "captcha"
        return state

    async def fake_wait() -> bool:
        return True

    monkeypatch.setattr("datareaper.scraper.orchestrator.byob_browser.get_byob_page", fake_byob)
    monkeypatch.setattr("datareaper.scraper.orchestrator.captcha_detector.detect_captcha", fake_detect)
    monkeypatch.setattr("datareaper.scraper.orchestrator.captcha_detector.handle_captcha_block", fake_handle)
    monkeypatch.setattr("datareaper.scraper.orchestrator.wait_for_resume_signal", fake_wait)

    state = {"failed_brokers": [], "current_broker": "https://captcha.example"}
    result = await fetch_with_fallback("https://captcha.example", state, DummyWsManager())

    assert result == "<html>challenge</html>"
    assert call_count["byob"] == 2
