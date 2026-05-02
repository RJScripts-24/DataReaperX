from __future__ import annotations

from pathlib import Path

from datareaper.core.config import get_settings


def load_prompt(filename: str) -> str:
    settings = get_settings()
    return Path(settings.data_dir / "prompts" / filename).read_text(encoding="utf-8")
