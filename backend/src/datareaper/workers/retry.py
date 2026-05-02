from __future__ import annotations


def should_retry(attempt: int, max_attempts: int = 3) -> bool:
    return attempt < max_attempts
