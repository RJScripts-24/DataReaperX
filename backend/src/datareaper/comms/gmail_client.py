from __future__ import annotations

from datareaper.core.config import get_settings
from datareaper.integrations.gmail.client import GmailAPIClient


def get_gmail_client() -> GmailAPIClient:
    return GmailAPIClient(get_settings())


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
