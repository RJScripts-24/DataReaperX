from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ScanState:
    scan_id: str
    status: str = "initializing"
    progress: int = 0
    stages: list[str] = field(default_factory=list)
