from __future__ import annotations


def match_name(candidate: str, expected: str) -> bool:
    return candidate.strip().lower() == expected.strip().lower()
