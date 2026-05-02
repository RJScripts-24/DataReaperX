from __future__ import annotations


def match_employer(candidate: str, expected: str) -> bool:
    return candidate.strip().lower() == expected.strip().lower()
