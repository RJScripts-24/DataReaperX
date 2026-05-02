from __future__ import annotations

from datareaper.brokers.catalog import load_broker_catalog
from datareaper.brokers.discovery import discover_brokers


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("broker_discovery")
    identity = state.get("identity") or {}
    broker_names = discover_brokers(identity)

    catalog = load_broker_catalog().get("brokers", [])
    catalog_by_name = {
        str(row.get("name")): row
        for row in catalog
        if isinstance(row, dict) and row.get("name")
    }

    brokers: list[dict] = []
    for broker_name in broker_names:
        meta = catalog_by_name.get(broker_name, {})
        brokers.append(
            {
                "broker_name": broker_name,
                "priority": str(meta.get("priority") or "high"),
                "jurisdictions": list(meta.get("jurisdictions") or []),
                "data_types": list(meta.get("data_types") or []),
                "opt_out_email": meta.get("opt_out_email"),
                "opt_out_url": meta.get("opt_out_url"),
            }
        )

    state["brokers"] = brokers
    state["stage"] = "broker_discovery"
    state["progress"] = max(int(state.get("progress", 0)), 60)
    return state
