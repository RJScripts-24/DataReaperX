from fastapi.testclient import TestClient

from datareaper.main import app

from tests.integration.auth import google_session_headers


def test_war_room_api(monkeypatch) -> None:
    with TestClient(app) as client:
        headers = google_session_headers(client, monkeypatch, "warroom@email.com")
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "warroom@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
            headers=headers,
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        response = client.get(f"/api/war-room/{scan_id}", headers=headers)
        assert response.status_code == 200
