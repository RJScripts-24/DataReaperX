from __future__ import annotations


def legal_notice_deadline(jurisdiction: str) -> int:
    return 30 if jurisdiction in {"DPDP", "GDPR", "CCPA"} else 30
