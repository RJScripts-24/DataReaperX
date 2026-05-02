from __future__ import annotations


def parse_holehe(data: dict) -> list[str]:
    return data.get("services", [])
