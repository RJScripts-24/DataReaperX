from __future__ import annotations

from pathlib import Path

import yaml

from datareaper.core.config import get_settings

DEFAULT_DEADLINES = {
    "DPDP": 30,
    "GDPR": 30,
    "CCPA": 45,
}


def load_jurisdiction_rules(jurisdiction: str) -> dict:
    normalized = (jurisdiction or "").strip().upper() or "DPDP"
    settings = get_settings()
    legal_dir = Path(settings.data_dir) / "legal"
    rules_path = legal_dir / f"{normalized.lower()}_rules.yaml"

    if not rules_path.exists():
        return {
            "jurisdiction": normalized,
            "citations": {},
            "statutory_deadline_days": DEFAULT_DEADLINES.get(normalized, 30),
            "escalation_triggers": {},
        }

    payload = yaml.safe_load(rules_path.read_text(encoding="utf-8")) or {}
    if not isinstance(payload, dict):
        payload = {}

    escalation_path = legal_dir / "escalation_rules.yaml"
    escalation_payload = {}
    if escalation_path.exists():
        escalation_payload = yaml.safe_load(escalation_path.read_text(encoding="utf-8")) or {}
        if not isinstance(escalation_payload, dict):
            escalation_payload = {}

    citations = payload.get("citations") if isinstance(payload.get("citations"), dict) else {}
    deadline = payload.get("statutory_deadline_days")
    if not isinstance(deadline, int):
        deadline = DEFAULT_DEADLINES.get(normalized, 30)

    return {
        "jurisdiction": normalized,
        "citations": citations,
        "statutory_deadline_days": deadline,
        "escalation_triggers": escalation_payload.get("escalations", {}),
    }


def applicable_rules(jurisdiction: str) -> dict:
    return load_jurisdiction_rules(jurisdiction)
