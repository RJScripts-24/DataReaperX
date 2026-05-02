from __future__ import annotations


def build_citations(jurisdiction: str) -> list[str]:
    if jurisdiction == "GDPR":
        return ["Article 17", "Article 5(1)(c)"]
    if jurisdiction == "CCPA":
        return ["Section 1798.105"]
    return ["Section 6", "Section 12"]
