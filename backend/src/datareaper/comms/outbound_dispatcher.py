from __future__ import annotations

import base64
from datetime import UTC, datetime
from email.mime.text import MIMEText

from sqlalchemy import select

from datareaper.brokers.opt_out_rules import SenderMode, resolve_sender_mode
from datareaper.comms.gmail_client import get_sender_service
from datareaper.core.config import get_settings
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.observability.metrics import increment_metric

logger = get_logger(__name__)


def _resolve_gmail_service(sender_mode: SenderMode, user_gmail_client):
    """
    Return the correct Gmail service object for the given sender mode.
    """

    if sender_mode == "central":
        logger.debug("using_central_sender")
        return get_sender_service()
    logger.debug("using_user_oauth_sender")
    return user_gmail_client._service


def _build_raw_payload(
    *,
    to_email: str,
    from_address: str,
    reply_to: str,
    subject: str,
    body: str,
    thread_id: str | None = None,
    in_reply_to_message_id: str | None = None,
) -> dict:
    message = MIMEText(body)
    message["To"] = to_email
    message["From"] = from_address
    message["Reply-To"] = reply_to
    message["Subject"] = subject
    if in_reply_to_message_id:
        message["In-Reply-To"] = in_reply_to_message_id
        message["References"] = in_reply_to_message_id

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    payload: dict[str, str] = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id
    return payload


def _send_with_service(
    *,
    service,
    payload: dict,
    to_email: str,
    subject: str,
    thread_id: str | None,
    in_reply_to_message_id: str | None,
) -> dict:
    try:
        return service.users().messages().send(userId="me", body=payload).execute()
    except Exception as exc:  # pragma: no cover - depends on external Gmail API behavior
        message = str(exc)
        if thread_id and "Invalid thread_id value" in message:
            logger.warning(
                "gmail_send_invalid_thread_id_retrying_without_thread",
                to=to_email,
                subject=subject,
                thread_id=thread_id,
            )
            fallback_payload = {"raw": payload["raw"]}
            if in_reply_to_message_id:
                logger.warning(
                    "gmail_send_retrying_with_reply_headers_only",
                    to=to_email,
                    subject=subject,
                    thread_id=thread_id,
                    in_reply_to_message_id=in_reply_to_message_id,
                )
            return service.users().messages().send(userId="me", body=fallback_payload).execute()
        raise


async def _resolve_broker_sender_mode(session, broker_case_id: str) -> SenderMode:
    from datareaper.db.models.broker_case import BrokerCase

    case = await session.get(BrokerCase, broker_case_id)
    if case is None:
        return "central"

    resolved = resolve_sender_mode(case.broker_name or "")
    return "user_oauth" if resolved == "user_oauth" else "central"


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
    """
    Send legal notice email and persist outbound thread/message metadata.
    """

    resolved_mode = await _resolve_broker_sender_mode(session, broker_case_id)
    sender_mode: SenderMode = "central"
    if resolved_mode != "central":
        logger.info(
            "sender_mode_overridden_to_central",
            broker_case_id=broker_case_id,
            requested_mode=resolved_mode,
        )

    settings = get_settings()
    service = get_sender_service()

    from_address = settings.gmail_sender_email
    reply_to = settings.gmail_sender_email
    payload = _build_raw_payload(
        to_email=to_email,
        from_address=from_address,
        reply_to=reply_to,
        subject=subject,
        body=body,
        thread_id=thread_id,
        in_reply_to_message_id=in_reply_to_message_id,
    )
    result = _send_with_service(
        service=service,
        payload=payload,
        to_email=to_email,
        subject=subject,
        thread_id=thread_id,
        in_reply_to_message_id=in_reply_to_message_id,
    )
    message_id = result.get("id")
    gmail_thread_id = result.get("threadId")

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
        sender=from_address,
        metadata_json={
            "gmail_message_id": message_id,
            "gmail_thread_id": gmail_thread_id,
            "to_email": to_email,
            "from_address": from_address,
            "reply_to": reply_to,
            "sender_mode": sender_mode,
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
    logger.info(
        "notice_dispatched",
        broker_case_id=broker_case_id,
        to=to_email,
        sender_mode=sender_mode,
        from_address=from_address,
        reply_to=reply_to,
    )
    return {
        "message_id": message_id,
        "thread_id": gmail_thread_id,
        "local_thread_id": thread.id,
        "local_message_id": outgoing_message.id,
        "display_timestamp": outgoing_message.display_timestamp,
        "sender_mode": sender_mode,
    }


__all__ = ["dispatch_notice", "_resolve_gmail_service"]
