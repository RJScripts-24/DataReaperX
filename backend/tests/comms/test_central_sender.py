from __future__ import annotations

import base64
from email import message_from_bytes
from types import SimpleNamespace

import pytest


def test_get_gmail_client_uses_central_sender_credentials(monkeypatch) -> None:
    from datareaper.comms import gmail_client

    captured: dict[str, object] = {}

    def fake_gmail_api_client(settings) -> str:  # noqa: ANN001
        captured["google_client_id"] = settings.google_client_id
        captured["google_client_secret"] = settings.google_client_secret
        captured["gmail_refresh_token"] = settings.gmail_refresh_token
        captured["gmail_sender_email"] = settings.gmail_sender_email
        return "client-object"

    monkeypatch.setattr(
        gmail_client,
        "get_settings",
        lambda: SimpleNamespace(
            gmail_sender_client_id="central-client-id",
            gmail_sender_client_secret="central-client-secret",
            gmail_sender_refresh_token="central-refresh-token",
            gmail_sender_email="agent@datareaper.test",
        ),
    )
    monkeypatch.setattr(gmail_client, "GmailAPIClient", fake_gmail_api_client)

    client = gmail_client.get_gmail_client()
    assert client == "client-object"
    assert captured == {
        "google_client_id": "central-client-id",
        "google_client_secret": "central-client-secret",
        "gmail_refresh_token": "central-refresh-token",
        "gmail_sender_email": "agent@datareaper.test",
    }


@pytest.mark.parametrize(
    "missing_field",
    [
        "gmail_sender_client_id",
        "gmail_sender_client_secret",
        "gmail_sender_refresh_token",
        "gmail_sender_email",
    ],
)
def test_get_gmail_client_raises_when_sender_var_missing(monkeypatch, missing_field: str) -> None:
    from datareaper.comms import gmail_client

    values = {
        "gmail_sender_client_id": "central-client-id",
        "gmail_sender_client_secret": "central-client-secret",
        "gmail_sender_refresh_token": "central-refresh-token",
        "gmail_sender_email": "agent@datareaper.test",
    }
    values[missing_field] = ""

    monkeypatch.setattr(gmail_client, "get_settings", lambda: SimpleNamespace(**values))

    with pytest.raises(RuntimeError, match="Missing env vars"):
        gmail_client.get_gmail_client()


def test_get_sender_service_builds_when_all_vars_present(monkeypatch) -> None:
    from datareaper.comms import gmail_client

    captured: dict[str, object] = {}

    class FakeCredentials:
        def __init__(self, **kwargs) -> None:  # noqa: ANN003
            captured["credentials_kwargs"] = kwargs
            captured["credentials"] = self

        def refresh(self, request) -> None:  # noqa: ANN001
            captured["refresh_request"] = request

    def fake_build(service_name, version, credentials, cache_discovery):  # noqa: ANN001, ANN202
        captured["build_args"] = (service_name, version, credentials, cache_discovery)
        return {"service": "gmail"}

    monkeypatch.setattr(
        gmail_client,
        "get_settings",
        lambda: SimpleNamespace(
            gmail_sender_client_id="central-client-id",
            gmail_sender_client_secret="central-client-secret",
            gmail_sender_refresh_token="central-refresh-token",
            gmail_sender_email="agent@datareaper.test",
        ),
    )
    monkeypatch.setattr(gmail_client.google.oauth2.credentials, "Credentials", FakeCredentials)
    monkeypatch.setattr(gmail_client.google.auth.transport.requests, "Request", lambda: "request-object")
    monkeypatch.setattr(gmail_client.googleapiclient.discovery, "build", fake_build)

    service = gmail_client.get_sender_service()
    assert service == {"service": "gmail"}
    assert captured["credentials_kwargs"] == {
        "token": None,
        "refresh_token": "central-refresh-token",
        "client_id": "central-client-id",
        "client_secret": "central-client-secret",
        "token_uri": "https://oauth2.googleapis.com/token",
        "scopes": ["https://www.googleapis.com/auth/gmail.send"],
    }
    assert captured["refresh_request"] == "request-object"
    assert captured["build_args"] == ("gmail", "v1", captured["credentials"], False)


@pytest.mark.parametrize(
    "missing_field",
    [
        "gmail_sender_client_id",
        "gmail_sender_client_secret",
        "gmail_sender_refresh_token",
        "gmail_sender_email",
    ],
)
def test_get_sender_service_raises_when_var_missing(monkeypatch, missing_field: str) -> None:
    from datareaper.comms import gmail_client

    values = {
        "gmail_sender_client_id": "central-client-id",
        "gmail_sender_client_secret": "central-client-secret",
        "gmail_sender_refresh_token": "central-refresh-token",
        "gmail_sender_email": "agent@datareaper.test",
    }
    values[missing_field] = ""

    monkeypatch.setattr(gmail_client, "get_settings", lambda: SimpleNamespace(**values))

    with pytest.raises(RuntimeError, match="Missing env vars"):
        gmail_client.get_sender_service()


def test_resolve_gmail_service_routes_by_sender_mode(monkeypatch) -> None:
    from datareaper.comms import outbound_dispatcher

    central_service = object()
    user_service = object()
    user_client = SimpleNamespace(_service=user_service)

    monkeypatch.setattr(outbound_dispatcher, "get_sender_service", lambda: central_service)
    assert outbound_dispatcher._resolve_gmail_service("central", user_client) is central_service
    assert outbound_dispatcher._resolve_gmail_service("user_oauth", user_client) is user_service


def test_build_raw_payload_sets_from_and_reply_to_headers() -> None:
    from datareaper.comms.outbound_dispatcher import _build_raw_payload

    payload = _build_raw_payload(
        to_email="privacy@broker.example",
        from_address="agent@datareaper.test",
        reply_to="user@example.com",
        subject="Data Removal Request",
        body="Please remove my data.",
        thread_id="thread-abc",
        in_reply_to_message_id="<msg-123@example.com>",
    )

    raw = payload["raw"]
    msg = message_from_bytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "privacy@broker.example"
    assert msg["From"] == "agent@datareaper.test"
    assert msg["Reply-To"] == "user@example.com"
    assert msg["Subject"] == "Data Removal Request"
    assert msg["In-Reply-To"] == "<msg-123@example.com>"
    assert payload["threadId"] == "thread-abc"


def test_authorized_agent_header_contains_identity_details() -> None:
    from datareaper.comms.templates import build_authorized_agent_header

    header = build_authorized_agent_header("Jane Smith", "jane@example.com")
    assert "authorized privacy agent" in header.lower()
    assert "Jane Smith" in header
    assert "jane@example.com" in header


def test_build_notice_prepends_authorized_agent_header() -> None:
    from datareaper.legal.notice_builder import build_notice

    body = build_notice(
        jurisdiction="CCPA",
        seed="jane@example.com",
        identity={"name": "Jane Smith", "location": "California"},
        broker_name="TestBroker",
    )
    assert "authorized privacy agent" in body.lower()
    assert "Full Name:     Jane Smith" in body
    assert "Email Address: jane@example.com" in body
    assert body.lower().find("authorized privacy agent") < body.lower().find("to testbroker")
