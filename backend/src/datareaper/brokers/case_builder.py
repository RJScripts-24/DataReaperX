from __future__ import annotations


def build_case(broker_name: str, jurisdiction: str) -> dict:
    return {
        "broker_name": broker_name,
        "jurisdiction": jurisdiction,
        "status": "in-progress",
        "priority": "high",
    }
