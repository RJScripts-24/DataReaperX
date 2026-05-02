from __future__ import annotations

from datareaper.comms.reply_generator import build_reply

ACTIONABLE_INTENTS = {"stalling", "illegal_pushback", "in_progress", "form_request"}


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("escalation_response")
    jurisdiction = str(state.get("jurisdiction") or "DPDP")
    triage = [row for row in (state.get("triage") or []) if isinstance(row, dict)]

    responses: list[dict] = []
    for row in triage:
        intent = str(row.get("intent") or "in_progress")
        if intent not in ACTIONABLE_INTENTS:
            continue
        responses.append(
            {
                "target_id": row.get("target_id"),
                "broker_name": row.get("broker_name"),
                "intent": intent,
                "reply": build_reply(intent, jurisdiction, broker_reply=row.get("body", "")),
            }
        )

    state["responses"] = responses
    state["escalation_count"] = len(
        [row for row in triage if str(row.get("intent")) in {"stalling", "illegal_pushback"}]
    )
    state["stage"] = "escalation_response"
    state["progress"] = max(int(state.get("progress", 0)), 95)
    return state
