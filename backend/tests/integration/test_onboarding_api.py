import asyncio

from fastapi.testclient import TestClient

from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.db.session import SessionLocal
from datareaper.main import app

from tests.integration.auth import google_session_headers


def _clear_active_scans() -> None:
    async def _run() -> None:
        repo = ScanRepository()
        if SessionLocal is not None:
            async with SessionLocal() as session:
                active_ids = await repo.list_active_scan_ids(session)
                for scan_id in active_ids:
                    await repo.stop_scan(session, scan_id, reason="test_setup_cleanup")

        memory_active_ids = await repo.list_active_scan_ids(None)
        for scan_id in memory_active_ids:
            await repo.stop_scan(None, scan_id, reason="test_setup_cleanup")

    asyncio.run(_run())


def test_onboarding_api(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "user@email.com")
        response = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "user@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
            headers=headers,
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload.get("scan_id")
        assert payload.get("normalized_seed") == "user@email.com"
        assert payload.get("status") == "initializing"
        assert isinstance(payload.get("boot_log"), list)
        assert len(payload.get("boot_log", [])) > 0

        stop_response = client.post(
            f"/api/scans/{payload['scan_id']}/stop",
            json={"reason": "test_cleanup"},
            headers=headers,
        )
        assert stop_response.status_code == 200


def test_v1_create_scan_api(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "user@email.com")
        session_id = headers["X-Session-Id"]
        response = client.post(
            "/v1/scans",
            json={
                "seed": {"type": "email", "value": "user@email.com"},
                "jurisdictionHint": "AUTO",
            },
            headers={"X-Session-Id": session_id},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload.get("scanId")
        assert payload.get("status") == "discovering"

        stop_response = client.post(
            f"/v1/scans/{payload['scanId']}/actions/stop",
            json={"reason": "test_cleanup"},
            headers={"X-Session-Id": session_id},
        )
        assert stop_response.status_code == 200


def test_api_stop_scan(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "stop-api@email.com")
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "stop-api@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
            headers=headers,
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        stopped = client.post(
            f"/api/scans/{scan_id}/stop",
            json={"reason": "integration_test"},
            headers=headers,
        )
        assert stopped.status_code == 200
        payload = stopped.json()
        assert payload.get("scan_id") == scan_id
        assert payload.get("status") == "cancelled"

        status_response = client.get(f"/api/scans/{scan_id}", headers=headers)
        assert status_response.status_code == 200
        assert status_response.json().get("status") == "cancelled"


def test_v1_stop_scan(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "stop-v1@email.com")
        session_id = headers["X-Session-Id"]
        created = client.post(
            "/v1/scans",
            json={
                "seed": {"type": "email", "value": "stop-v1@email.com"},
                "jurisdictionHint": "AUTO",
            },
            headers={"X-Session-Id": session_id},
        )
        assert created.status_code == 202
        scan_id = created.json()["scanId"]

        stopped = client.post(
            f"/v1/scans/{scan_id}/actions/stop",
            json={"reason": "integration_test_v1"},
            headers={"X-Session-Id": session_id},
        )
        assert stopped.status_code == 200
        payload = stopped.json()
        assert payload.get("scanId") == scan_id
        assert payload.get("status") == "cancelled"


def test_v1_rejects_seed_email_mismatch(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "owner@email.com")
        session_id = headers["X-Session-Id"]
        created = client.post(
            "/v1/scans",
            json={
                "seed": {"type": "email", "value": "other@email.com"},
                "jurisdictionHint": "AUTO",
            },
            headers={"X-Session-Id": session_id},
        )

        assert created.status_code == 403
        payload = created.json()
        assert payload.get("code") == "seed_mismatch"


def test_v1_scan_conflict_returns_active_scan_id(monkeypatch) -> None:
    _clear_active_scans()
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "conflict@email.com")
        session_id = headers["X-Session-Id"]
        created = client.post(
            "/v1/scans",
            json={
                "seed": {"type": "email", "value": "conflict@email.com"},
                "jurisdictionHint": "AUTO",
            },
            headers={"X-Session-Id": session_id},
        )
        assert created.status_code == 202
        active_scan_id = created.json().get("scanId")
        assert active_scan_id

        conflict = client.post(
            "/v1/scans",
            json={
                "seed": {"type": "email", "value": "conflict@email.com"},
                "jurisdictionHint": "AUTO",
            },
            headers={"X-Session-Id": session_id},
        )
        assert conflict.status_code == 409
        payload = conflict.json()
        assert payload.get("code") == "scan_in_progress"
        details = payload.get("details") or []
        assert isinstance(details, list)
        assert details and details[0].get("scanId") == active_scan_id

        stopped = client.post(
            f"/v1/scans/{active_scan_id}/actions/stop",
            json={"reason": "test_cleanup_conflict"},
            headers={"X-Session-Id": session_id},
        )
        assert stopped.status_code == 200
