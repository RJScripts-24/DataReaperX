from __future__ import annotations

import inspect
from datetime import datetime

from datareaper.comms.gmail_client import get_gmail_client
from datareaper.comms.intent_classifier import classify_intent, classify_intent_with_llm
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.repositories.battle_repo import BattleRepository
from datareaper.realtime.channels import WAR_ROOM_CHANNEL
from datareaper.realtime.publishers import publish

logger = get_logger(__name__)


def _is_syncable_gmail_thread_id(thread_id: str | None) -> bool:
    if not thread_id:
        return False
    value = str(thread_id).strip()
    if not value:
        return False
    if value.startswith("thread_") or "_" in value:
        return False
    return len(value) >= 10


async def sync_inbox_for_scan(scan_id: str, battle_repo: BattleRepository, llm) -> list[dict]:
    required_methods = [
        "get_active_email_threads",
        "store_email_message",
        "update_thread_status",
    ]
    for method_name in required_methods:
        if not hasattr(battle_repo, method_name):
            raise TypeError(f"BattleRepository is missing required method: {method_name}")

    try:
        gmail_client = get_gmail_client()
    except Exception as exc:  # pragma: no cover - oauth/client initialization failures
        logger.warning("sync_inbox_gmail_client_failed", scan_id=scan_id, error=str(exc))
        return []

    active_threads = await battle_repo.get_active_email_threads(scan_id)
    updates: list[dict] = []

    for thread in active_threads:
        gmail_thread_id = thread.get("gmail_thread_id")
        if not _is_syncable_gmail_thread_id(gmail_thread_id):
            logger.debug(
                "sync_inbox_skipping_non_gmail_thread",
                scan_id=scan_id,
                thread_id=thread.get("thread_id"),
                gmail_thread_id=gmail_thread_id,
            )
            continue
        try:
            messages = gmail_client.get_thread_messages(gmail_thread_id)
        except Exception as exc:  # pragma: no cover - external API failures
            logger.warning(
                "sync_inbox_thread_fetch_failed",
                scan_id=scan_id,
                thread_id=gmail_thread_id,
                error=str(exc),
            )
            continue

        last_seen = thread.get("last_synced_message_id")
        unseen = messages
        if last_seen is not None:
            for idx, message in enumerate(messages):
                if message.get("message_id") == last_seen:
                    unseen = messages[idx + 1 :]
                    break

        history = [
            str(message.get("content") or "")
            for message in (thread.get("messages") or [])
            if isinstance(message, dict)
        ]

        for message in unseen:
            body = str(message.get("body") or "")
            if llm is not None:
                triage = await classify_intent_with_llm(body, history, llm)
                intent = str(triage.get("intent") or classify_intent(body))
                confidence = triage.get("confidence")
            else:
                intent = classify_intent(body)
                confidence = None

            history.append(body)
            stored = {
                "id": new_id("msg"),
                "thread_id": thread["thread_id"],
                "direction": "broker",
                "body": body,
                "sender": message.get("from"),
                "metadata_json": {
                    "gmail_message_id": message.get("message_id"),
                    "gmail_thread_id": message.get("thread_id"),
                    "intent": intent,
                    "intent_confidence": confidence,
                },
                "display_timestamp": datetime.utcnow().isoformat(),
            }
            await battle_repo.store_email_message(stored)
            update_signature = inspect.signature(battle_repo.update_thread_status)
            if "last_synced_message_id" in update_signature.parameters:
                await battle_repo.update_thread_status(
                    thread_id=thread["thread_id"],
                    status=intent,
                    last_synced_message_id=message.get("message_id"),
                )
            else:
                await battle_repo.update_thread_status(
                    thread_id=thread["thread_id"],
                    status=intent,
                )
            event = {
                "type": "thread_update",
                "scan_id": scan_id,
                "thread_id": thread["thread_id"],
                "gmail_thread_id": gmail_thread_id,
                "intent": intent,
                "body": body,
                "broker_email": thread.get("broker_email"),
                "jurisdiction": thread.get("jurisdiction") or "DPDP",
                "broker_name": thread.get("broker_name"),
                "opt_out_url": thread.get("opt_out_url"),
                "intent_confidence": confidence,
                "history": history[-10:],
                "days_elapsed": int(thread.get("days_elapsed") or 0),
                "evidence_url": thread.get("evidence_url"),
                "gmail_message_id": message.get("message_id"),
                "reply_to_message_id": message.get("rfc_message_id"),
            }
            await publish(WAR_ROOM_CHANNEL, event)
            updates.append(event)

    return updates


def sync_threads() -> list[dict]:
    return [{"thread_id": "thread_1", "status": "synced"}]
