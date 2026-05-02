from __future__ import annotations


def parse_profile(data: dict) -> dict:
    return {"name": data.get("name"), "location": data.get("location")}
