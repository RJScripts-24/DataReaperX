from __future__ import annotations

from collections import defaultdict
from time import time


class InMemoryRateLimiter:
    def __init__(self, window_seconds: int = 60, max_requests: int = 30) -> None:
        self.window_seconds = window_seconds
        self.max_requests = max_requests
        self._entries: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = time()
        self._entries[key] = [entry for entry in self._entries[key] if now - entry < self.window_seconds]
        if len(self._entries[key]) >= self.max_requests:
            return False
        self._entries[key].append(now)
        return True
