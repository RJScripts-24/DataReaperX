from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class DomainEvent:
    name: str
    payload: dict
