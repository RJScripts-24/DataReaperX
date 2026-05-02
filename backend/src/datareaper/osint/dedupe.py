from __future__ import annotations


def dedupe_items(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))
