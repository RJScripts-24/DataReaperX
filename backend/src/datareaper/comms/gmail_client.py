from __future__ import annotations

from types import SimpleNamespace

import google.auth.transport.requests
import google.oauth2.credentials
import googleapiclient.discovery
from googleapiclient.discovery import Resource

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger
from datareaper.integrations.gmail.client import GmailAPIClient

logger = get_logger(__name__)


def get_gmail_client() -> GmailAPIClient:
    settings = get_settings()
    required = [
        ("GMAIL_SENDER_CLIENT_ID", settings.gmail_sender_client_id),
        ("GMAIL_SENDER_CLIENT_SECRET", settings.gmail_sender_client_secret),
        ("GMAIL_SENDER_REFRESH_TOKEN", settings.gmail_sender_refresh_token),
        ("GMAIL_SENDER_EMAIL", settings.gmail_sender_email),
    ]
    missing = [name for name, value in required if not str(value or "").strip()]
    if missing:
        raise RuntimeError(
            "Cannot build central sender Gmail client. "
            f"Missing env vars: {', '.join(missing)}"
        )

    # Communication sync runs against one central mailbox. We map central sender
    # OAuth values into the GmailAPIClient's expected settings shape.
    runtime_settings = SimpleNamespace(
        google_client_id=settings.gmail_sender_client_id,
        google_client_secret=settings.gmail_sender_client_secret,
        gmail_refresh_token=settings.gmail_sender_refresh_token,
        gmail_sender_email=settings.gmail_sender_email,
    )
    return GmailAPIClient(runtime_settings)


class GmailClient:
    def send_message(
        self,
        to_email: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to_message_id: str | None = None,
    ) -> dict:
        return get_gmail_client().send_message(
            to=to_email,
            subject=subject,
            body=body,
            thread_id=thread_id,
            in_reply_to_message_id=in_reply_to_message_id,
        )


def get_sender_service() -> Resource:
    """
    Build and return a Gmail API service authenticated as the central sender account.
    """

    settings = get_settings()
    required = [
        ("GMAIL_SENDER_CLIENT_ID", settings.gmail_sender_client_id),
        ("GMAIL_SENDER_CLIENT_SECRET", settings.gmail_sender_client_secret),
        ("GMAIL_SENDER_REFRESH_TOKEN", settings.gmail_sender_refresh_token),
        ("GMAIL_SENDER_EMAIL", settings.gmail_sender_email),
    ]
    missing = [name for name, value in required if not str(value or "").strip()]
    if missing:
        raise RuntimeError(
            "Cannot build central sender Gmail service. "
            f"Missing env vars: {', '.join(missing)}"
        )

    creds = google.oauth2.credentials.Credentials(
        token=None,
        refresh_token=settings.gmail_sender_refresh_token,
        client_id=settings.gmail_sender_client_id,
        client_secret=settings.gmail_sender_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.send"],
    )
    creds.refresh(google.auth.transport.requests.Request())
    logger.debug("sender_service_built", sender_email=settings.gmail_sender_email)

    return googleapiclient.discovery.build(
        "gmail",
        "v1",
        credentials=creds,
        cache_discovery=False,
    )
