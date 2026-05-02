from __future__ import annotations

from difflib import SequenceMatcher


def broker_matches(query: str, broker_name: str) -> bool:
    query_lower = query.lower().strip()
    broker_lower = broker_name.lower().strip()
    if not query_lower or not broker_lower:
        return False
    if query_lower in broker_lower or broker_lower in query_lower:
        return True
    return SequenceMatcher(None, query_lower, broker_lower).ratio() >= 0.75
