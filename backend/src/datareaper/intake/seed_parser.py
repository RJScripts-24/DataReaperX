from __future__ import annotations

from datareaper.intake.normalizers import normalize_seed
from datareaper.intake.validators import infer_seed_type


def parse_seed(seed: str, seed_type: str = "auto") -> dict:
    normalized = normalize_seed(seed, seed_type)
    resolved_seed_type = infer_seed_type(normalized) if seed_type == "auto" else seed_type
    return {"raw": seed, "normalized": normalized, "seed_type": resolved_seed_type}
