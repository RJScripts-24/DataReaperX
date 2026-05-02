from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
import json
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2 import id_token

_GOOGLE_TOKEN_CLOCK_SKEW_SECONDS = 90
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass(slots=True)
class GoogleIdentity:
    email: str
    subject: str


class GoogleOAuthError(ValueError):
    """Raised when Google OAuth credentials or tokens are invalid."""


def oauth_configured(client_id: str) -> bool:
    return bool(client_id and client_id.strip())


def _decode_unverified_claims(token: str) -> dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload_segment = parts[1]
        padding_needed = (-len(payload_segment)) % 4
        payload_segment += "=" * padding_needed
        payload_bytes = base64.urlsafe_b64decode(payload_segment.encode("ascii"))
        parsed = json.loads(payload_bytes.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        return {}


def _normalize_audience_claim(audience_claim: Any) -> list[str]:
    if isinstance(audience_claim, str):
        audience = audience_claim.strip()
        return [audience] if audience else []

    if isinstance(audience_claim, list):
        values = []
        for item in audience_claim:
            normalized = str(item).strip()
            if normalized:
                values.append(normalized)
        return values

    return []


def _build_verification_error_message(raw_token: str, client_id: str, original_error: Exception) -> str:
    claims = _decode_unverified_claims(raw_token)
    token_audiences = _normalize_audience_claim(claims.get("aud"))
    if token_audiences and client_id not in token_audiences:
        received = ", ".join(token_audiences[:3])
        return f"Google token audience mismatch. Expected {client_id} but received {received}."

    issuer = str(claims.get("iss") or "").strip()
    if issuer and issuer not in _GOOGLE_ISSUERS:
        return f"Google token issuer mismatch. Received {issuer}."

    message = " ".join(str(original_error).split()).strip()
    lowered = message.lower()
    if "token used too early" in lowered or "issued at" in lowered:
        return "Google token is not valid yet. Sync your system clock and retry sign-in."
    if "expired" in lowered:
        return "Google token has expired. Retry sign-in."
    if "certificate" in lowered:
        return "Google token verification failed while fetching certificates. Check internet access and retry."
    if message:
        return f"Invalid Google ID token ({message})."
    return "Invalid Google ID token."


def verify_google_id_token(raw_token: str, client_id: str) -> GoogleIdentity:
    token = raw_token.strip()
    if not token:
        raise GoogleOAuthError("Missing Google ID token.")

    normalized_client_id = client_id.strip()
    if not oauth_configured(normalized_client_id):
        raise GoogleOAuthError("Google OAuth is not configured yet.")

    try:
        payload = id_token.verify_oauth2_token(
            token,
            Request(),
            audience=None,
            clock_skew_in_seconds=_GOOGLE_TOKEN_CLOCK_SKEW_SECONDS,
        )
    except Exception as exc:  # pragma: no cover - normalized below
        raise GoogleOAuthError(_build_verification_error_message(token, normalized_client_id, exc)) from exc

    token_audiences = _normalize_audience_claim(payload.get("aud"))
    if normalized_client_id not in token_audiences:
        received = ", ".join(token_audiences[:3]) if token_audiences else "unknown"
        raise GoogleOAuthError(
            f"Google token audience mismatch. Expected {normalized_client_id} but received {received}."
        )

    issuer = str(payload.get("iss") or "").strip()
    if issuer not in _GOOGLE_ISSUERS:
        raise GoogleOAuthError(f"Google token issuer mismatch. Received {issuer or 'unknown issuer'}.")

    email = str(payload.get("email") or "").strip().lower()
    subject = str(payload.get("sub") or "").strip()
    email_verified = payload.get("email_verified")

    if not email:
        raise GoogleOAuthError("Google account email is missing from token.")
    if email_verified is False:
        raise GoogleOAuthError("Google account email is not verified.")
    if not subject:
        raise GoogleOAuthError("Google account subject is missing from token.")

    return GoogleIdentity(email=email, subject=subject)
