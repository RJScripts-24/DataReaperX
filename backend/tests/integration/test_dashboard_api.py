from fastapi.testclient import TestClient

from datareaper.main import app


def test_dashboard_api() -> None:
    with TestClient(app) as client:
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "dashboard@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        response = client.get(f"/api/dashboard/{scan_id}")
        assert response.status_code == 200
        payload = response.json()

        assert payload.get("scan_id") == scan_id
        assert isinstance(payload.get("stats"), list)
        assert isinstance(payload.get("threat_breakdown"), dict)
        assert isinstance(payload.get("radar_targets"), list)
        assert isinstance(payload.get("activity_feed"), list)
        assert isinstance(payload.get("agent_statuses"), list)
