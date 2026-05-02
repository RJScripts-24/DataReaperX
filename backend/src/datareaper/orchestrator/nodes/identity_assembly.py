from __future__ import annotations

import asyncio
import re

from datareaper.osint.identity_resolver import resolve_identity


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return {"real_name": None, "location": None, "employer": None}


def _guess_name_from_seed(seed: str) -> str | None:
    if "@" not in seed:
        return None
    local_part = seed.split("@", maxsplit=1)[0]
    tokens = [part for part in re.split(r"[._-]+", local_part) if part.isalpha()]
    if not tokens:
        return None
    return " ".join(token.capitalize() for token in tokens[:3])


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("identity_assembly")
    seed = str(state.get("normalized_seed") or state.get("seed") or "")
    profile_clues = state.get("scraped_profiles") or []
    clues = [row for row in profile_clues if isinstance(row, dict)]

    guessed_name = _guess_name_from_seed(seed)
    if guessed_name and not clues:
        clues = [{"name": guessed_name}]

    identity = _run_async(resolve_identity(clues, llm=None))
    if not isinstance(identity, dict):
        identity = {"real_name": guessed_name, "location": None, "employer": None}

    if guessed_name and not identity.get("real_name"):
        identity["real_name"] = guessed_name

    state["identity"] = identity
    state["stage"] = "identity_assembly"
    state["progress"] = max(int(state.get("progress", 0)), 40)
    return state
