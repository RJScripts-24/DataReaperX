from __future__ import annotations

from datareaper.integrations.gmail.client import GmailAPIClient


def watch_inbox(client: GmailAPIClient, topic_name: str) -> dict:
    service = getattr(client, "_service", None)
    if service is None:
        return {"watching": False, "reason": "gmail_service_unavailable"}

    response = (
        service.users()
        .watch(
            userId="me",
            body={"labelIds": ["INBOX"], "topicName": topic_name},
        )
        .execute()
    )
    return {
        "watching": True,
        "history_id": response.get("historyId"),
        "expiration": response.get("expiration"),
    }
