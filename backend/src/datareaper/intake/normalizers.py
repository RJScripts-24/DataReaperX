from __future__ import annotations


def normalize_seed(seed: str, seed_type: str = "auto") -> str:
    normalized = seed.strip()
    if seed_type == "email" or "@" in normalized:
        return normalized.lower()
    return "".join(ch for ch in normalized if ch.isdigit() or ch == "+")
