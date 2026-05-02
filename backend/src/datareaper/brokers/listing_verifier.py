from __future__ import annotations

from collections.abc import Mapping


def verify_listing(listing: dict) -> bool:
    if not isinstance(listing, Mapping):
        return False
    html = str(listing.get("html") or listing.get("content") or "")
    if not html:
        return False
    target = str(listing.get("name") or listing.get("identity") or "").lower()
    if not target:
        return True
    return target in html.lower()
