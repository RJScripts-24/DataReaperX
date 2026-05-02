from __future__ import annotations


def parse_listing(html: str) -> dict:
    return {"matched": "John Doe" in html}
