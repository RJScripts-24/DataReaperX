from __future__ import annotations


def match_target(target: str, candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate.lower() == target.lower():
            return candidate
    return None
