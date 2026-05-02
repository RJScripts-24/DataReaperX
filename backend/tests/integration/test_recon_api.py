from fastapi.testclient import TestClient

from datareaper.main import app


def test_recon_api() -> None:
    with TestClient(app) as client:
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "recon@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        response = client.get(f"/api/recon/{scan_id}/graph")
        assert response.status_code == 200
