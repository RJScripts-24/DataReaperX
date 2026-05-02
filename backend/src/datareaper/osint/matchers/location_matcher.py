from __future__ import annotations


def match_location(candidate: str, expected: str) -> bool:
    return expected.lower() in candidate.lower()
