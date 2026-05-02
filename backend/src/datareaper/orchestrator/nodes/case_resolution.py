from __future__ import annotations

INTENT_TO_STATUS = {
    "success": "resolved",
    "stalling": "stalling",
    "illegal_pushback": "illegal",
    "form_request": "in-progress",
    "in_progress": "in-progress",
}


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("case_resolution")
    triage = [row for row in (state.get("triage") or []) if isinstance(row, dict)]
    targets = [row for row in (state.get("targets") or []) if isinstance(row, dict)]

    triage_by_target = {
        str(row.get("target_id")): str(row.get("intent") or "in_progress")
        for row in triage
        if row.get("target_id")
    }

    updated_targets: list[dict] = []
    for target in targets:
        target_id = str(target.get("id") or "")
        intent = triage_by_target.get(target_id)
        if intent is None:
            updated_targets.append(target)
            continue
        next_status = INTENT_TO_STATUS.get(intent, target.get("status", "in-progress"))
        updated_targets.append(
            {
                **target,
                "status": next_status,
                "last_activity": f"Intent classified as {intent}",
            }
        )

    resolved_count = sum(1 for row in updated_targets if row.get("status") == "resolved")
    state["targets"] = updated_targets
    state["resolved_cases"] = resolved_count
    state["active_cases"] = max(len(updated_targets) - resolved_count, 0)
    state["scan_status"] = "completed" if resolved_count == len(updated_targets) else "active"
    state["stage"] = "case_resolution"
    state["progress"] = max(int(state.get("progress", 0)), 98)
    return state
