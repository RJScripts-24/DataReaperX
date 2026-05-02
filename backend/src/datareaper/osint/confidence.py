from __future__ import annotations


def confidence_score(matches: int) -> float:
    return min(1.0, 0.5 + (matches * 0.1))
