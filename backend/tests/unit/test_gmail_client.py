from types import SimpleNamespace

from datareaper.integrations.gmail.client import GmailAPIClient


def test_gmail_api_client_uses_google_oauth_client_credentials(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_credentials(**kwargs):  # noqa: ANN003
        captured["credentials_kwargs"] = kwargs
        return {"kind": "credentials-stub"}

    def fake_build(service_name: str, version: str, credentials, cache_discovery: bool):  # noqa: ANN001
        captured["build_service_name"] = service_name
        captured["build_version"] = version
        captured["build_credentials"] = credentials
        captured["build_cache_discovery"] = cache_discovery
        return {"kind": "gmail-service-stub"}

    monkeypatch.setattr("datareaper.integrations.gmail.client.Credentials", fake_credentials)
    monkeypatch.setattr("datareaper.integrations.gmail.client.build", fake_build)

    settings = SimpleNamespace(
        google_client_id="google-client-id.apps.googleusercontent.com",
        google_client_secret="google-client-secret",
        gmail_client_id="legacy-gmail-client-id.apps.googleusercontent.com",
        gmail_client_secret="legacy-gmail-client-secret",
        gmail_refresh_token="refresh-token",
        gmail_sender_email="sender@email.com",
    )

    client = GmailAPIClient(settings)

    credentials_kwargs = captured.get("credentials_kwargs")
    assert isinstance(credentials_kwargs, dict)
    assert credentials_kwargs["token"] is None
    assert credentials_kwargs["refresh_token"] == "refresh-token"
    assert credentials_kwargs["client_id"] == "google-client-id.apps.googleusercontent.com"
    assert credentials_kwargs["client_secret"] == "google-client-secret"
    assert credentials_kwargs["token_uri"] == "https://oauth2.googleapis.com/token"

    assert captured.get("build_service_name") == "gmail"
    assert captured.get("build_version") == "v1"
    assert captured.get("build_credentials") == {"kind": "credentials-stub"}
    assert captured.get("build_cache_discovery") is False
    assert client._sender == "sender@email.com"
