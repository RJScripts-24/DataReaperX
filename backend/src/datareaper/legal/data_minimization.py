from __future__ import annotations


def is_excessive_request(text: str) -> bool:
    lowered = text.lower()
    return "passport" in lowered or "government" in lowered or "proof of address" in lowered
