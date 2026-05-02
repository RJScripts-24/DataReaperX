from __future__ import annotations

from pathlib import Path

import yaml

from datareaper.core.config import get_settings


def load_opt_out_rules() -> dict:
    settings = get_settings()
    return yaml.safe_load(Path(settings.data_dir / "brokers" / "broker_opt_out_rules.yaml").read_text(encoding="utf-8"))
