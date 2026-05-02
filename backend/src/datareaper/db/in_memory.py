from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from datareaper.core.ids import new_id


class InMemoryStore:
    def __init__(self) -> None:
        self._scans: dict[str, dict] = {}
        self._target_index: dict[str, str] = {}

    def save_scan_bundle(self, bundle: dict) -> None:
        scan_id = bundle["scan"]["id"]
        self._scans[scan_id] = deepcopy(bundle)
        for target in bundle.get("targets", []):
            self._target_index[target["id"]] = scan_id

    def get_scan_bundle(self, scan_id: str) -> dict | None:
        bundle = self._scans.get(scan_id)
        return deepcopy(bundle) if bundle else None

    def list_scan_ids(self) -> list[str]:
        return list(self._scans.keys())

    def get_thread(self, target_id: str) -> dict | None:
        scan_id = self._target_index.get(target_id)
        if scan_id is None:
            return None
        bundle = self._scans.get(scan_id, {})
        thread = bundle.get("threads", {}).get(target_id)
        return deepcopy(thread) if thread else None

    def update_scan_status(
        self,
        scan_id: str,
        *,
        status: str | None = None,
        current_stage: str | None = None,
        progress: int | None = None,
    ) -> dict | None:
        bundle = self._scans.get(scan_id)
        if bundle is None:
            return None
        scan = bundle.setdefault("scan", {})
        if status is not None:
            scan["status"] = status
        if current_stage is not None:
            scan["current_stage"] = current_stage
        if progress is not None:
            scan["progress"] = progress
        return deepcopy(bundle)

    def append_event(self, scan_id: str, event_type: str, message: str, payload: dict | None = None) -> dict | None:
        bundle = self._scans.get(scan_id)
        if bundle is None:
            return None
        events = bundle.setdefault("events", [])
        events.append(
            {
                "id": new_id("evt"),
                "type": event_type,
                "message": message,
                "created_at": datetime.now(UTC).isoformat(),
                "payload": payload or {},
            }
        )
        return deepcopy(bundle)


memory_store = InMemoryStore()
