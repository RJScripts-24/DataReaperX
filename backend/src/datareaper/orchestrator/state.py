from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class OrchestratorState:
    scan_id: str
    seed: str
    jurisdiction: str = "DPDP"
    timeline: list[str] = field(default_factory=list)
