from __future__ import annotations

from urllib.parse import urlparse


def domain_of(url: str) -> str:
    return urlparse(url).netloc
