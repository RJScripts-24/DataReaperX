from __future__ import annotations


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("dispatch_request")
    requests = [row for row in (state.get("legal_requests") or []) if isinstance(row, dict)]
    targets = [row for row in (state.get("targets") or []) if isinstance(row, dict)]

    dispatched: list[dict] = []
    dispatched_target_ids: set[str] = set()
    for request in requests:
        item = {**request, "status": "sent"}
        dispatched.append(item)
        target_id = request.get("target_id")
        if target_id:
            dispatched_target_ids.add(str(target_id))

    updated_targets: list[dict] = []
    for target in targets:
        if str(target.get("id")) in dispatched_target_ids:
            updated_targets.append(
                {
                    **target,
                    "status": "in-progress",
                    "last_activity": "Notice sent",
                }
            )
        else:
            updated_targets.append(target)

    state["legal_requests"] = dispatched
    state["targets"] = updated_targets
    state["dispatch_summary"] = {
        "sent": len(dispatched),
        "pending": max(len(requests) - len(dispatched), 0),
    }
    state["stage"] = "dispatch_request"
    state["progress"] = max(int(state.get("progress", 0)), 85)
    return state
