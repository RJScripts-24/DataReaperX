from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from datareaper.core.config import get_settings


def load_demo_json(filename: str) -> dict[str, Any]:
    settings = get_settings()
    path = Path(settings.data_dir) / "demo" / filename
    return json.loads(path.read_text(encoding="utf-8"))
