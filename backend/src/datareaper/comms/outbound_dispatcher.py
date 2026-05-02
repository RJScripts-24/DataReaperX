from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from datareaper.comms.gmail_client import get_gmail_client
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.observability.metrics import increment_metric

logger = get_logger(__name__)


async def dispatch_notice(
    session,
    broker_case_id: str,
    to_email: str,
    subject: str,
    body: str,
    thread_id: str | None = None,
    in_reply_to_message_id: str | None = None,
    last_activity_label: str = "Notice dispatched",
) -> dict:
    """Send legal notice email and persist outbound thread/message metadata."""
    gmail = get_gmail_client()
    result = gmail.send_message(
        to=to_email,
        subject=subject,
        body=body,
        thread_id=thread_id,
        in_reply_to_message_id=in_reply_to_message_id,
    )
    message_id = result.get("message_id")
    gmail_thread_id = result.get("thread_id")

    from datareaper.db.models.broker_case import BrokerCase
    from datareaper.db.models.email_message import EmailMessage
    from datareaper.db.models.email_thread import EmailThread

    thread_result = await session.execute(
        select(EmailThread).where(EmailThread.broker_case_id == broker_case_id)
    )
    thread = thread_result.scalars().first()
    if thread is None:
        thread = EmailThread(
            id=new_id("thread"),
            broker_case_id=broker_case_id,
            external_thread_id=gmail_thread_id,
            subject=subject,
            status="sent",
        )
        session.add(thread)
    else:
        thread.external_thread_id = gmail_thread_id or thread.external_thread_id
        thread.subject = subject or thread.subject
        thread.status = "sent"

    outgoing_message = EmailMessage(
        id=new_id("msg"),
        thread_id=thread.id,
        direction="agent",
        body=body,
        sender=None,
        metadata_json={
            "gmail_message_id": message_id,
            "gmail_thread_id": gmail_thread_id,
            "to_email": to_email,
            "in_reply_to_message_id": in_reply_to_message_id,
            "subject": subject,
        },
        display_timestamp=datetime.now(UTC).isoformat(),
    )
    session.add(outgoing_message)

    case = await session.get(BrokerCase, broker_case_id)
    if case is not None:
        case.status = "in-progress"
        case.last_activity_label = last_activity_label

    await session.commit()
    increment_metric("emails_sent")
    logger.info("notice_dispatched", broker_case_id=broker_case_id, to=to_email)
    return {
        "message_id": message_id,
        "thread_id": gmail_thread_id,
        "local_thread_id": thread.id,
        "local_message_id": outgoing_message.id,
        "display_timestamp": outgoing_message.display_timestamp,
    }


__all__ = ["dispatch_notice"]
