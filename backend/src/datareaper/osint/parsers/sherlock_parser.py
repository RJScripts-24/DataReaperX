from __future__ import annotations


def parse_sherlock(data: dict) -> list[str]:
    return data.get("sites_found", [])
