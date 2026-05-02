import base64
import json

import pytest

from datareaper.comms.oauth import GoogleOAuthError, verify_google_id_token


def _encode_segment(payload: dict) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def _fake_jwt(payload: dict) -> str:
    header = _encode_segment({"alg": "RS256", "typ": "JWT"})
    body = _encode_segment(payload)
    return f"{header}.{body}.signature"


def test_verify_google_id_token_happy_path(monkeypatch) -> None:
    def fake_verify(token, request, audience=None, clock_skew_in_seconds=0):  # noqa: ANN001
        assert token == "token-value"
        assert audience is None
        assert clock_skew_in_seconds >= 0
        return {
            "aud": "expected-client-id.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "email": "User@Email.com",
            "email_verified": True,
            "sub": "google-sub-123",
        }

    monkeypatch.setattr("datareaper.comms.oauth.id_token.verify_oauth2_token", fake_verify)

    identity = verify_google_id_token("token-value", "expected-client-id.apps.googleusercontent.com")
    assert identity.email == "user@email.com"
    assert identity.subject == "google-sub-123"


def test_verify_google_id_token_rejects_audience_mismatch(monkeypatch) -> None:
    monkeypatch.setattr(
        "datareaper.comms.oauth.id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: {
            "aud": "other-client-id.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "email": "user@email.com",
            "email_verified": True,
            "sub": "google-sub-123",
        },
    )

    with pytest.raises(GoogleOAuthError, match="audience mismatch"):
        verify_google_id_token("token-value", "expected-client-id.apps.googleusercontent.com")


def test_verify_google_id_token_reports_actionable_audience_error(monkeypatch) -> None:
    token = _fake_jwt(
        {
            "aud": "other-client-id.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "email": "user@email.com",
            "email_verified": True,
            "sub": "google-sub-123",
        }
    )

    monkeypatch.setattr(
        "datareaper.comms.oauth.id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("Could not verify audience.")),
    )

    with pytest.raises(GoogleOAuthError, match="Expected expected-client-id.apps.googleusercontent.com"):
        verify_google_id_token(token, "expected-client-id.apps.googleusercontent.com")


def test_verify_google_id_token_reports_clock_skew_hint(monkeypatch) -> None:
    token = _fake_jwt(
        {
            "aud": "expected-client-id.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "email": "user@email.com",
            "email_verified": True,
            "sub": "google-sub-123",
        }
    )

    monkeypatch.setattr(
        "datareaper.comms.oauth.id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("Token used too early, 10 < 11")),
    )

    with pytest.raises(GoogleOAuthError, match="Sync your system clock"):
        verify_google_id_token(token, "expected-client-id.apps.googleusercontent.com")
