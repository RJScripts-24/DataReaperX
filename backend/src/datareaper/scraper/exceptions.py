from __future__ import annotations


class BYOBNotAvailableError(RuntimeError):
    """Raised when the local Chrome CDP endpoint is unavailable."""


class FlareSolverrError(RuntimeError):
    """Raised when FlareSolverr cannot solve or return a valid response."""


class AllMethodsExhaustedError(RuntimeError):
    """Raised when every scraper strategy fails for a URL."""


__all__ = [
    "AllMethodsExhaustedError",
    "BYOBNotAvailableError",
    "FlareSolverrError",
]