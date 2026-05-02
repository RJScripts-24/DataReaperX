from __future__ import annotations

from enum import Enum


class ScanStatus(str, Enum):
    INITIALIZING = "initializing"
    ACTIVE = "active"
    RESOLVED = "resolved"


class BrokerCaseStatus(str, Enum):
    STALLING = "stalling"
    ILLEGAL = "illegal"
    IN_PROGRESS = "in-progress"
    RESOLVED = "resolved"
