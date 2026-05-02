import asyncio

from fastapi.testclient import TestClient

from datareaper.main import app
from datareaper.orchestrator.nodes import email_probe


def test_scan_websocket_receives_stage_complete_from_email_probe(monkeypatch) -> None:
    with TestClient(app) as client:
        initialized = client.post(
            "/api/onboarding/initialize",
            json={
                "seed": "ws-events@email.com",
                "seed_type": "email",
                "jurisdiction": "DPDP",
                "consent_confirmed": True,
            },
        )
        assert initialized.status_code == 200
        scan_id = initialized.json()["scan_id"]

        def fake_run_async(coro):
            try:
                coro.close()
            except Exception:
                pass
            return [{"platform": "github", "username": "ws-events", "exists": True}]

        monkeypatch.setattr(email_probe, "_run_async", fake_run_async)

        with client.websocket_connect(f"/ws/scans/{scan_id}") as websocket:
            async def _run_node() -> None:
                state = {
                    "scan_id": scan_id,
                    "seed": "ws-events@email.com",
                    "normalized_seed": "ws-events@email.com",
                }
                email_probe.run(state)
                await asyncio.sleep(0.05)

            asyncio.run(_run_node())

            event = websocket.receive_json()

        assert event["event"] == "stage_complete"
        assert event["scanId"] == scan_id
        assert event["payload"]["stage"] == "email_probe"
        assert event["payload"]["platform"] == "github"
