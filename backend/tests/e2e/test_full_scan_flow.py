from fastapi.testclient import TestClient

from datareaper.main import app

from tests.integration.auth import google_session_headers


def test_full_scan_flow(monkeypatch) -> None:
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
        scan_id = response.json()["scan_id"]
        assert client.get(f"/api/dashboard/{scan_id}", headers=headers).status_code == 200
