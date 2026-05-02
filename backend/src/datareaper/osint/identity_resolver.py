from __future__ import annotations

import json
from collections import Counter

from datareaper.core.logging import get_logger
from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.prompt_loader import load_prompt

logger = get_logger(__name__)


def _fallback_identity(scraped_profiles: list[dict]) -> dict:
    names = Counter(str(row.get("name")) for row in scraped_profiles if row.get("name"))
    locations = Counter(str(row.get("location")) for row in scraped_profiles if row.get("location"))
    employers = Counter(str(row.get("employer")) for row in scraped_profiles if row.get("employer"))
    return {
        "real_name": names.most_common(1)[0][0] if names else None,
        "location": locations.most_common(1)[0][0] if locations else None,
        "employer": employers.most_common(1)[0][0] if employers else None,
        "sources": scraped_profiles,
    }


def _has_llm_worthy_signal(scraped_profiles: list[dict]) -> bool:
    signal_fields = ("name", "location", "employer", "job_title")
    signal_points = 0
    profiles_with_signal = 0

    for row in scraped_profiles:
        row_signal = 0
        for field in signal_fields:
            if str(row.get(field) or "").strip():
                signal_points += 1
                row_signal += 1
        if row_signal:
            profiles_with_signal += 1

    return signal_points >= 3 and profiles_with_signal >= 2


async def resolve_identity(scraped_profiles: list[dict], llm: BaseLLMClient | None) -> dict:
    if not scraped_profiles:
        return {"real_name": None, "location": None, "employer": None}

    fallback = _fallback_identity(scraped_profiles)
    if llm is not None and _has_llm_worthy_signal(scraped_profiles):
        prompt_payload = json.dumps(scraped_profiles, ensure_ascii=True)
        system = load_prompt("sleuth_identity.md")
        prompt = (
            "Given these scraped profiles, synthesize the most likely identity profile.\n\n"
            "Profiles:\n"
            f"{prompt_payload}"
        )
        try:
            resolved = await llm.generate_json(prompt=prompt, system=system)
            if isinstance(resolved, dict):
                return resolved
        except Exception as exc:  # pragma: no cover - provider failures should fall back
            logger.warning("identity_resolution_llm_failed", error=str(exc))
    elif llm is not None:
        logger.info("identity_resolution_llm_skipped_low_signal", profiles=len(scraped_profiles))

    return fallback
