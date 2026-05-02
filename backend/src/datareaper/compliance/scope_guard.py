from __future__ import annotations


def in_scope(jurisdiction: str) -> bool:
    return jurisdiction in {"DPDP", "GDPR", "CCPA"}
