from __future__ import annotations

from pathlib import Path

import yaml

from datareaper.core.config import get_settings


def _candidate_paths() -> list[Path]:
    settings = get_settings()
    root_catalog = settings.data_dir / "brokers" / "broker_catalog.yaml"
    package_catalog = Path(__file__).resolve().parents[1] / "data" / "brokers" / "broker_catalog.yaml"
    return [root_catalog, package_catalog]


def load_broker_catalog() -> dict:
    for path in _candidate_paths():
        if not path.exists():
            continue
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            payload.setdefault("brokers", [])
            return payload
    return {"brokers": []}
