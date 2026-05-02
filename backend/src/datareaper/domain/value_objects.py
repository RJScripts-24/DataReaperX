from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SeedInput:
    raw: str
    normalized: str
    seed_type: str
