from __future__ import annotations

from collections import Counter
from threading import Lock

_METRICS = Counter({"requests": 0, "events": 0})
_LOCK = Lock()


def increment_metric(name: str, value: int = 1) -> None:
    if value <= 0:
        return
    with _LOCK:
        _METRICS[name] += value


def record_request(path: str | None = None) -> None:
    increment_metric("requests")
    if path:
        increment_metric(f"request:{path}")


def record_event(event_type: str | None = None) -> None:
    increment_metric("events")
    if event_type:
        increment_metric(f"event:{event_type}")


def metrics_snapshot() -> dict:
    with _LOCK:
        snapshot = dict(_METRICS)
    snapshot.setdefault("requests", 0)
    snapshot.setdefault("events", 0)
    return snapshot


__all__ = ["increment_metric", "record_request", "record_event", "metrics_snapshot"]
