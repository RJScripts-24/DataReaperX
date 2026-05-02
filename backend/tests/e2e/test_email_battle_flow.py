from fastapi.testclient import TestClient

from datareaper.main import app


def test_email_battle_flow() -> None:
    with TestClient(app) as client:
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "battle@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        war_room = client.get(f"/api/war-room/{scan_id}")
        assert war_room.status_code == 200

        targets = war_room.json().get("targets", [])
        if targets:
            target_id = targets[0]["id"]
            thread = client.get(f"/api/war-room/targets/{target_id}/thread")
            assert thread.status_code == 200
