from __future__ import annotations

from collections import Counter

from datareaper.comms.intent_classifier import classify_intent


def _seed_triage_from_targets(state: dict) -> list[dict]:
    targets = [row for row in (state.get("targets") or []) if isinstance(row, dict)]
    return [
        {
            "target_id": target.get("id"),
            "broker_name": target.get("broker_name"),
            "body": "We received your request and are processing it.",
            "intent": "in_progress",
        }
        for target in targets
    ]


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("inbox_triage")
    inbound = [row for row in (state.get("inbox_messages") or []) if isinstance(row, dict)]
    triage: list[dict] = []

    for message in inbound:
        body = str(message.get("body") or "")
        triage.append(
            {
                "target_id": message.get("target_id"),
                "broker_name": message.get("broker_name"),
                "body": body,
                "intent": classify_intent(body),
            }
        )

    if not triage:
        triage = _seed_triage_from_targets(state)

    counts = Counter(row.get("intent") for row in triage)
    state["triage"] = triage
    state["triage_summary"] = dict(counts)
    state["stage"] = "inbox_triage"
    state["progress"] = max(int(state.get("progress", 0)), 93)
    return state
