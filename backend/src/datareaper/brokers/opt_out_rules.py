from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Literal

import yaml

from datareaper.core.config import get_settings

SenderMode = Literal["central", "user_oauth"]
_VALID_SENDER_MODES: set[str] = {"central", "user_oauth"}


@dataclass(frozen=True, slots=True)
class BrokerOptOutRule:
    broker_id: str
    method: str
    jurisdiction: list[str]
    sender_mode: SenderMode = "central"


def load_opt_out_rules() -> dict:
    settings = get_settings()
    return yaml.safe_load(Path(settings.data_dir / "brokers" / "broker_opt_out_rules.yaml").read_text(encoding="utf-8"))


def _normalize_broker_key(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "", str(value or "").lower())
    return clean


def parse_opt_out_rules() -> dict[str, BrokerOptOutRule]:
    raw = load_opt_out_rules()
    rules = raw.get("rules", {}) if isinstance(raw, dict) else {}
    parsed: dict[str, BrokerOptOutRule] = {}

    for broker_id, broker_rule in rules.items():
        if not isinstance(broker_rule, dict):
            continue
        sender_mode = str(broker_rule.get("sender_mode", "central")).strip().lower()
        if sender_mode not in _VALID_SENDER_MODES:
            sender_mode = "central"

        rule = BrokerOptOutRule(
            broker_id=str(broker_id),
            method=str(broker_rule.get("method", "email")),
            jurisdiction=[str(item) for item in broker_rule.get("jurisdiction", [])],
            sender_mode=sender_mode,  # type: ignore[arg-type]
        )
        parsed[_normalize_broker_key(rule.broker_id)] = rule

    return parsed


def resolve_sender_mode(broker_name: str, default: SenderMode = "central") -> SenderMode:
    rules = parse_opt_out_rules()
    key = _normalize_broker_key(broker_name)
    rule = rules.get(key)
    if rule is None:
        return default
    return rule.sender_mode


__all__ = [
    "BrokerOptOutRule",
    "SenderMode",
    "load_opt_out_rules",
    "parse_opt_out_rules",
    "resolve_sender_mode",
]

