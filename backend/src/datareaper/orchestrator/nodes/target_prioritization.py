from __future__ import annotations

import asyncio

from datareaper.realtime.node_publisher import emit


def _priority_weight(priority: str) -> int:
    normalized = priority.strip().lower()
    if normalized == "high":
        return 3
    if normalized == "low":
        return 1
    return 2


def _score_target(broker: dict, jurisdiction: str) -> int:
    base = _priority_weight(str(broker.get("priority") or "medium")) * 10
    data_types_score = len(list(broker.get("data_types") or []))
    jurisdictions = [str(item).upper() for item in list(broker.get("jurisdictions") or [])]
    jurisdiction_score = 5 if not jurisdictions or jurisdiction.upper() in jurisdictions else 0
    return base + data_types_score + jurisdiction_score


def _emit(scan_id: str, event_type: str, payload: dict) -> None:
    """Fire-and-forget helper for sync nodes."""
    if not scan_id:
        return
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(emit(scan_id, event_type, payload))
    except Exception:
        pass


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("target_prioritization")
    scan_id = str(state.get("scan_id") or "")
    jurisdiction = str(state.get("jurisdiction") or "DPDP")
    brokers = [row for row in (state.get("brokers") or []) if isinstance(row, dict)]

    ranked = sorted(
        brokers,
        key=lambda row: _score_target(row, jurisdiction),
        reverse=True,
    )

    targets: list[dict] = []
    for index, broker in enumerate(ranked):
        target = {
            "id": f"target_{index + 1}",
            "broker_name": str(broker.get("broker_name") or "Unknown"),
            "status": "discovered",
            "priority_score": _score_target(broker, jurisdiction),
            "jurisdiction": jurisdiction,
            "data_types": list(broker.get("data_types") or []),
            "opt_out_email": broker.get("opt_out_email"),
            "opt_out_url": broker.get("opt_out_url"),
        }
        targets.append(target)

        _emit(
            scan_id,
            "exposure_found",
            {
                "broker_name": target["broker_name"],
                "data_types": target["data_types"],
                "priority_score": target["priority_score"],
                "angle": (index * 47) % 360,
                "distance": 0.4 + (index % 5) * 0.1,
            },
        )

    state["targets"] = targets
    state["stage"] = "target_prioritization"
    state["progress"] = max(int(state.get("progress", 0)), 70)
    return state
