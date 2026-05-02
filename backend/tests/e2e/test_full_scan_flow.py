from fastapi.testclient import TestClient

from datareaper.main import app


def test_full_scan_flow() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "user@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
        )
        assert response.status_code == 200
        scan_id = response.json()["scan_id"]
        assert client.get(f"/api/dashboard/{scan_id}").status_code == 200
