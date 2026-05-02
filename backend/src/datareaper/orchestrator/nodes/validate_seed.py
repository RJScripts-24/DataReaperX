from __future__ import annotations

from datareaper.intake.seed_parser import parse_seed
from datareaper.intake.validators import validate_seed as validate_seed_value


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("validate_seed")
    seed = state.get("seed", "")
    try:
        parsed = parse_seed(seed)
        seed_type = parsed.get("seed_type")
        normalized = parsed.get("normalized")
        validate_seed_value(normalized, seed_type)
    except Exception:
        state["error"] = "invalid_seed"
        state["valid"] = False
        return state

    state["valid"] = True
    state["seed_type"] = seed_type
    state["normalized_seed"] = normalized
    return state
