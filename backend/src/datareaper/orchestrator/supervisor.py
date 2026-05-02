from __future__ import annotations

from datetime import UTC, datetime
from itertools import cycle

from datareaper.brokers.case_builder import build_case
from datareaper.comms.reply_generator import build_reply
from datareaper.core.config import get_settings
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.legal.citation_builder import build_citations
from datareaper.legal.notice_builder import build_notice
from datareaper.orchestrator.graph import build_default_graph

STATUS_ORDER = ["illegal", "stalling", "in-progress", "resolved"]
LAST_ACTIVITY = {
    "illegal": "2 min ago",
    "stalling": "15 min ago",
    "in-progress": "1 hour ago",
    "resolved": "2 days ago",
}
DATA_TYPES = {
    "Apollo.io": ["Email", "Phone", "Company"],
    "ZoomInfo": ["Email", "Role", "Employer"],
    "Spokeo": ["Phone", "Address", "Relatives"],
    "Whitepages": ["Name", "Location", "Address"],
}

logger = get_logger(__name__)


class Supervisor:
    def run(self, state: dict) -> dict:
        state["timeline"] = build_default_graph()
        return state

    def build_scan_bundle(
        self,
        scan_id: str,
        normalized_seed: str,
        seed_type: str,
        jurisdiction: str,
    ) -> dict:
        settings = get_settings()
        timestamp = datetime.now(UTC).isoformat()
        pivot = normalized_seed.split("@", 1)[0] if seed_type == "email" else normalized_seed

        # Always initialize new scans in a neutral "in progress" state.
        # The worker pipeline is responsible for discovering real accounts/targets/events.
        identity = {
            "name": pivot,
            "real_name": None,
            "location": "Unknown",
            "seed": normalized_seed,
        }
        graph = {
            "nodes": [{"id": "seed", "type": "seed", "label": normalized_seed, "x": 400, "y": 300}],
            "edges": [],
        }

        activity_feed = [
            {
                "id": new_id("evt"),
                "type": "System",
                "message": "Scan initialized. Awaiting OSINT pipeline execution.",
                "created_at": timestamp,
                "payload": {"stage": "initialize_scan"},
            },
        ]

        return {
            "scan": {
                "id": scan_id,
                "normalized_seed": normalized_seed,
                "seed_type": seed_type,
                "jurisdiction": jurisdiction,
                "status": "initializing",
                "progress": 5,
                "current_stage": "queueing_osint_pipeline",
            },
            "stages": [{"name": stage, "status": "pending"} for stage in build_default_graph()],
            "identity": identity,
            "accounts": [],
            "usernames": [],
            "graph": graph,
            "events": activity_feed,
            "agent_runs": [
                {"agent_name": "Sleuth Agent", "status": "queued", "detail": "Waiting to start OSINT pipeline"},
                {"agent_name": "Legal Agent", "status": "idle", "detail": "Awaiting discovered targets"},
                {"agent_name": "Communications Agent", "status": "idle", "detail": "Awaiting legal dispatch"},
            ],
            "targets": [],
            "threads": {},
            "legal_requests": [],
            "report": {
                "summary": f"Scan queued for {normalized_seed}. Results will populate as the worker progresses.",
                "metrics": {
                    "brokers_scanned": 0,
                    "exposures_found": 0,
                    "deletions_secured": 0,
                    "active_disputes": 0,
                },
                "highlights": [
                    "Scan created and staged for asynchronous OSINT processing.",
                    f"Environment: {settings.app_env}.",
                ],
            },
        }

    def _fallback_pipeline(self, normalized_seed: str, seed_type: str) -> dict:
        if seed_type == "email":
            pivot = normalized_seed.split("@", 1)[0]
        else:
            pivot = normalized_seed[-4:] if len(normalized_seed) >= 4 else normalized_seed

        usernames = [pivot, f"{pivot}_ops", f"{pivot}_profile"]
        accounts = ["github.com", "linkedin.com", "x.com"]
        identity = {
            "name": pivot,
            "real_name": pivot,
            "location": "Unknown",
            "seed": normalized_seed,
        }

        nodes = [
            {"id": "seed", "type": "seed", "label": normalized_seed, "x": 400, "y": 300},
            {"id": "platform_1", "type": "platform", "label": "GitHub", "x": 260, "y": 220},
            {"id": "platform_2", "type": "platform", "label": "LinkedIn", "x": 400, "y": 200},
            {"id": "platform_3", "type": "platform", "label": "X", "x": 540, "y": 220},
            {"id": "identity_1", "type": "identity", "label": pivot, "x": 320, "y": 390},
            {"id": "identity_2", "type": "identity", "label": usernames[1], "x": 480, "y": 390},
            {"id": "target_1", "type": "target", "label": "Apollo.io", "x": 300, "y": 510},
            {"id": "target_2", "type": "target", "label": "Spokeo", "x": 500, "y": 510},
        ]

        edges = [
            {"source": "seed", "target": "platform_1", "relationship": "pivoted_to"},
            {"source": "seed", "target": "platform_2", "relationship": "pivoted_to"},
            {"source": "seed", "target": "platform_3", "relationship": "pivoted_to"},
            {"source": "platform_1", "target": "identity_1", "relationship": "resolved_identity"},
            {"source": "platform_2", "target": "identity_1", "relationship": "resolved_identity"},
            {"source": "platform_3", "target": "identity_2", "relationship": "resolved_identity"},
            {"source": "identity_1", "target": "target_1", "relationship": "found_on_broker"},
            {"source": "identity_2", "target": "target_2", "relationship": "found_on_broker"},
        ]

        return {
            "identity": identity,
            "accounts": accounts,
            "usernames": usernames,
            "graph": {"nodes": nodes, "edges": edges},
        }

    def _fallback_brokers(self) -> list[str]:
        return ["Apollo.io", "Spokeo", "Whitepages", "ZoomInfo"]

    def _build_cases_and_threads(
        self,
        scan_id: str,
        seed: str,
        brokers: list[str],
        jurisdiction: str,
    ) -> tuple[list[dict], dict[str, dict], list[dict]]:
        cases: list[dict] = []
        threads: dict[str, dict] = {}
        legal_requests: list[dict] = []
        statuses = cycle(STATUS_ORDER)
        citations = build_citations(jurisdiction)

        for broker_name in brokers:
            case_id = new_id("case")
            thread_id = new_id("thread")
            status = next(statuses)
            case = build_case(broker_name, jurisdiction)
            case.update(
                {
                    "id": case_id,
                    "scan_id": scan_id,
                    "brokerName": broker_name,
                    "status": status,
                    "lastActivity": LAST_ACTIVITY[status],
                    "dataTypes": DATA_TYPES.get(broker_name, ["Email", "Phone"]),
                    "threadId": thread_id,
                }
            )

            messages = self._build_thread_messages(broker_name, seed, status, jurisdiction, citations)
            case["messageCount"] = len(messages)
            threads[case_id] = {
                "thread_id": thread_id,
                "target_id": case_id,
                "broker_name": broker_name,
                "status": status,
                "messages": messages,
            }

            legal_requests.append(
                {
                    "id": new_id("notice"),
                    "broker_case_id": case_id,
                    "subject": "Data Deletion Request",
                    "body": build_notice(jurisdiction, seed),
                    "citations": citations,
                    "status": "sent",
                }
            )
            cases.append(case)

        return cases, threads, legal_requests

    def _build_thread_messages(
        self,
        broker_name: str,
        seed: str,
        status: str,
        jurisdiction: str,
        citations: list[str],
    ) -> list[dict]:
        opening = {
            "id": new_id("msg"),
            "type": "agent",
            "content": build_notice(jurisdiction, seed),
            "timestamp": "10:23 AM",
            "metadata": {"citations": ", ".join(citations)},
        }

        if status == "illegal":
            broker_message = "Please provide a government-issued ID and proof of address."
            classified = "Illegal Data Request"
        elif status == "stalling":
            broker_message = "Please allow 4-6 weeks for processing."
            classified = "Stalling"
        elif status == "resolved":
            broker_message = "Your data has been removed from our systems."
            classified = "Resolved"
        else:
            broker_message = "We received your request and are processing it."
            classified = "In Progress"

        return [
            opening,
            {
                "id": new_id("msg"),
                "type": "broker",
                "content": broker_message,
                "timestamp": "10:45 AM",
                "metadata": {"broker": broker_name},
            },
            {
                "id": new_id("msg"),
                "type": "system",
                "content": f"Intent classified: {classified}",
                "timestamp": "10:46 AM",
                "metadata": {"classification": classified},
            },
            {
                "id": new_id("msg"),
                "type": "agent",
                "content": build_reply(
                    "illegal_pushback" if status == "illegal" else "stalling" if status == "stalling" else "success" if status == "resolved" else "in_progress",
                    jurisdiction,
                ),
                "timestamp": "10:47 AM",
                "metadata": {"legalCitation": citations[0] if citations else ""},
            },
        ]
