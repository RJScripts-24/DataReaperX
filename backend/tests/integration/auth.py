"""Helpers for integration tests that need a Google OAuth session."""

from __future__ import annotations

from fastapi.testclient import TestClient

from datareaper.comms.oauth import GoogleIdentity


def google_session_headers(client: TestClient, monkeypatch, email: str) -> dict[str, str]:
    monkeypatch.setattr(
        "datareaper.api.routes.v1_contract.verify_google_id_token",
        lambda *_args, **_kwargs: GoogleIdentity(
            email=email,
            subject=f"google-test-sub-{email}",
        ),
    )
    response = client.post(
        "/v1/sessions",
        json={
            "idToken": "fake-google-id-token",
            "client": {
                "appVersion": "test-suite",
                "platform": "browser",
                "timezone": "UTC",
                "locale": "en-US",
            },
        },
    )
    assert response.status_code == 201
    return {"X-Session-Id": response.json()["sessionId"]}
