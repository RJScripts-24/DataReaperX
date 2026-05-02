from __future__ import annotations


def build_default_graph() -> list[str]:
    return [
        "validate_seed",
        "initialize_scan",
        "email_probe",
        "username_pivot",
        "identity_assembly",
        "graph_build",
        "broker_discovery",
        "target_prioritization",
        "legal_strategy",
        "dispatch_request",
        "inbox_sync",
        "inbox_triage",
        "escalation_response",
        "case_resolution",
        "publish_realtime_updates",
    ]
