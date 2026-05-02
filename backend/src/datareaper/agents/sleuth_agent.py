from __future__ import annotations

import asyncio
from typing import Any, TypedDict

from datareaper.agents.base import AgentResult, BaseAgent
from datareaper.osint.account_discovery import discover_accounts
from datareaper.osint.collectors.profile_scraper import scrape_profile
from datareaper.osint.graph_builder import build_graph
from datareaper.osint.identity_resolver import resolve_identity
from datareaper.osint.username_discovery import discover_usernames
from datareaper.scraper.orchestrator import fetch_with_fallback


class SleuthState(TypedDict, total=False):
    current_broker: str
    paused: bool
    pause_reason: str | None
    failed_brokers: list[str]
    scraped_data: dict[str, Any]
    scan_id: str


class _NullWsManager:
    async def broadcast(self, payload: dict[str, Any]) -> None:  # pragma: no cover - passthrough
        _ = payload


def _extract_broker_url(target: dict[str, Any]) -> str | None:
    for key in ("opt_out_url", "url", "broker_url"):
        value = target.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def scrape_broker_node(state: SleuthState, ws_manager: Any | None = None) -> SleuthState:
    """Scrape a broker page using anti-detection fallback methods.

    Args:
        state: Current Sleuth node state.
        ws_manager: Optional websocket manager with async broadcast support.

    Returns:
        Updated state including scraped_data and failed_brokers.
    """
    if state.get("paused"):
        return state

    broker_url = state.get("current_broker")
    if not broker_url:
        return state

    state.setdefault("failed_brokers", [])
    state.setdefault("scraped_data", {})

    html = await fetch_with_fallback(broker_url, state, ws_manager or _NullWsManager())
    if html:
        state["scraped_data"][broker_url] = html
    return state


class SleuthAgent(BaseAgent):
    name = "sleuth"

    async def run(self, context: dict) -> AgentResult:
        if context.get("paused"):
            return AgentResult(agent=self.name, status="ok", payload=context)

        seed = context.get("seed", "")
        browser = context.get("browser")
        if not seed:
            return AgentResult(agent=self.name, status="error", payload=context, error="missing_seed")

        accounts = await discover_accounts(seed)
        usernames = await discover_usernames(accounts, original_seeds=[seed])
        profiles: list[dict] = []
        if browser is not None:
            profile_urls = [row.get("url") for row in accounts if row.get("url")]
            profiles = await asyncio.gather(
                *[scrape_profile(url, browser, self.llm) for url in profile_urls],
                return_exceptions=False,
            )

        if self.llm is not None:
            identity = await resolve_identity(profiles, self.llm)
        else:
            identity = {"real_name": None, "location": None}

        targets = [row.get("broker_name") for row in context.get("targets", []) if isinstance(row, dict)]

        scrape_state: SleuthState = {
            "paused": bool(context.get("paused", False)),
            "pause_reason": context.get("pause_reason"),
            "failed_brokers": list(context.get("failed_brokers") or []),
            "scraped_data": dict(context.get("scraped_data") or {}),
            "scan_id": str(context.get("scan_id") or context.get("scanId") or "unknown_scan"),
        }

        ws_manager = context.get("ws_manager")
        for target in context.get("targets", []):
            if not isinstance(target, dict):
                continue
            broker_url = _extract_broker_url(target)
            if not broker_url:
                continue
            scrape_state["current_broker"] = broker_url
            scrape_state = await scrape_broker_node(scrape_state, ws_manager=ws_manager)
            if scrape_state.get("paused"):
                break

        graph = build_graph(
            seed,
            [str(row.get("platform") or "unknown") for row in accounts],
            [str(target) for target in targets if target],
            usernames,
            {"name": identity.get("real_name") or identity.get("name"), "location": identity.get("location")},
        )

        payload = {
            **context,
            "accounts": accounts,
            "usernames": usernames,
            "identity": identity,
            "graph": graph,
            "paused": bool(scrape_state.get("paused", False)),
            "pause_reason": scrape_state.get("pause_reason"),
            "failed_brokers": list(scrape_state.get("failed_brokers") or []),
            "scraped_data": dict(scrape_state.get("scraped_data") or {}),
            "stage": "osint",
        }
        return AgentResult(agent=self.name, status="ok", payload=payload)
