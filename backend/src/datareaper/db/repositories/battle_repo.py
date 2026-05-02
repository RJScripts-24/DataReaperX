from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.brokers.catalog import load_broker_catalog
from datareaper.core.exceptions import ResourceNotFoundError
from datareaper.db.in_memory import memory_store
from datareaper.db.models.broker_case import BrokerCase
from datareaper.db.models.email_message import EmailMessage
from datareaper.db.models.email_thread import EmailThread
from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.db.session import SessionLocal


def _normalize_case_status(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"resolved", "success"}:
        return "resolved"
    if normalized in {"illegal", "illegal_pushback", "legal_violation"}:
        return "illegal"
    if normalized in {"stalling", "irrelevant"}:
        return "stalling"
    return "in-progress"


def _is_gmail_thread_id(thread_id: str | None) -> bool:
    if not thread_id:
        return False
    value = str(thread_id).strip()
    if not value:
        return False
    # Synthetic/local IDs in this codebase typically look like thread_<shortid>.
    if value.startswith("thread_") or "_" in value:
        return False
    # Gmail thread IDs are opaque but generally long, compact identifiers.
    return len(value) >= 10


class BattleRepository:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def get_threads(self, session: AsyncSession | None, scan_id: str) -> dict:
        bundle = await self.scan_repo.load_scan_bundle(session, scan_id)
        return {
            "scan_id": scan_id,
            "targets": bundle["targets"],
            "selected_thread": next(iter(bundle["threads"].values()), None),
        }

    async def get_thread(self, session: AsyncSession | None, target_id: str) -> dict:
        if session is None:
            thread = memory_store.get_thread(target_id)
            if thread is None:
                raise ResourceNotFoundError(f"Target thread {target_id} not found")
            return thread

        target = await session.get(BrokerCase, target_id)
        if target is None:
            raise ResourceNotFoundError(f"Target thread {target_id} not found")
        thread_result = await session.execute(
            select(EmailThread).where(EmailThread.broker_case_id == target_id)
        )
        thread = thread_result.scalars().first()
        if thread is None:
            raise ResourceNotFoundError(f"Target thread {target_id} not found")
        message_result = await session.execute(
            select(EmailMessage).where(EmailMessage.thread_id == thread.id)
        )
        messages = [
            {
                "id": message.id,
                "type": message.direction,
                "content": message.body,
                "timestamp": message.display_timestamp,
                "metadata": message.metadata_json or {},
            }
            for message in message_result.scalars().all()
        ]
        return {
            "thread_id": thread.id,
            "target_id": target_id,
            "broker_name": target.broker_name,
            "status": target.status,
            "messages": messages,
        }

    async def get_active_email_threads(self, scan_id: str) -> list[dict]:
        """Return active threads with external thread identifiers.

        This helper is used by worker/comms inbox synchronization code paths.
        """
        broker_catalog = load_broker_catalog().get("brokers", [])
        broker_email_by_name = {
            str(item.get("name")): item.get("opt_out_email")
            for item in broker_catalog
            if isinstance(item, dict) and item.get("name")
        }
        broker_url_by_name = {
            str(item.get("name")): item.get("opt_out_url")
            for item in broker_catalog
            if isinstance(item, dict) and item.get("name")
        }

        if SessionLocal is not None:
            try:
                async with SessionLocal() as session:
                    rows_result = await session.execute(
                        select(EmailThread, BrokerCase).join(
                            BrokerCase,
                            EmailThread.broker_case_id == BrokerCase.id,
                        ).where(BrokerCase.scan_job_id == scan_id)
                    )
                    rows: list[dict] = []
                    for thread, case in rows_result.all():
                        message_result = await session.execute(
                            select(EmailMessage).where(EmailMessage.thread_id == thread.id)
                        )
                        messages = message_result.scalars().all()
                        last_message = messages[-1] if messages else None
                        last_message_meta = (last_message.metadata_json or {}) if last_message is not None else {}
                        last_synced_gmail_message_id = (
                            str(last_message_meta.get("gmail_message_id"))
                            if last_message_meta.get("gmail_message_id")
                            else None
                        )
                        broker_name = case.broker_name
                        external_thread_id = thread.external_thread_id
                        gmail_thread_id = external_thread_id if _is_gmail_thread_id(external_thread_id) else None
                        rows.append(
                            {
                                "thread_id": thread.id,
                                "gmail_thread_id": gmail_thread_id,
                                "last_synced_message_id": last_synced_gmail_message_id,
                                "target_id": case.id,
                                "broker_name": broker_name,
                                "jurisdiction": case.jurisdiction or "DPDP",
                                "broker_email": broker_email_by_name.get(broker_name),
                                "opt_out_url": broker_url_by_name.get(broker_name),
                                "messages": [
                                    {
                                        "id": message.id,
                                        "content": message.body,
                                    }
                                    for message in messages
                                ],
                            }
                        )
                    return rows
            except Exception:
                pass

        try:
            bundle = await self.scan_repo.load_scan_bundle(None, scan_id)
        except ResourceNotFoundError:
            return []

        target_map = {target["id"]: target for target in bundle.get("targets", [])}
        rows: list[dict] = []
        for target_id, thread in bundle.get("threads", {}).items():
            target = target_map.get(target_id, {})
            broker_name = target.get("brokerName") or thread.get("broker_name")
            rows.append(
                {
                    "thread_id": thread.get("thread_id"),
                    "gmail_thread_id": (
                        thread.get("external_thread_id")
                        if _is_gmail_thread_id(str(thread.get("external_thread_id") or ""))
                        else None
                    ),
                    "last_synced_message_id": (thread.get("messages") or [{}])[-1].get("id")
                    if thread.get("messages")
                    else None,
                    "target_id": target_id,
                    "broker_name": broker_name,
                    "jurisdiction": bundle.get("scan", {}).get("jurisdiction") or "DPDP",
                    "broker_email": target.get("broker_email") or broker_email_by_name.get(broker_name),
                    "opt_out_url": broker_url_by_name.get(broker_name),
                }
            )
        return rows

    async def store_email_message(self, message: dict) -> None:
        thread_id = message.get("thread_id")
        if not thread_id:
            return

        if SessionLocal is not None:
            try:
                async with SessionLocal() as session:
                    session.add(
                        EmailMessage(
                            id=str(message.get("id") or ""),
                            thread_id=str(thread_id),
                            direction=str(message.get("direction") or "broker"),
                            body=str(message.get("body") or ""),
                            sender=(str(message.get("sender")) if message.get("sender") else None),
                            metadata_json=message.get("metadata_json") or {},
                            display_timestamp=str(message.get("display_timestamp") or "Now"),
                        )
                    )
                    await session.commit()
                    return
            except Exception:
                pass

        for scan_bundle in memory_store._scans.values():  # noqa: SLF001
            for thread in scan_bundle.get("threads", {}).values():
                if thread.get("thread_id") != thread_id:
                    continue
                thread.setdefault("messages", []).append(
                    {
                        "id": message.get("id"),
                        "type": message.get("direction"),
                        "content": message.get("body"),
                        "timestamp": message.get("display_timestamp"),
                        "metadata": message.get("metadata_json") or {},
                    }
                )
                return

    async def update_thread_status(
        self,
        thread_id: str,
        status: str,
        last_synced_message_id: str | None = None,
    ) -> None:
        _ = last_synced_message_id

        if SessionLocal is not None:
            try:
                async with SessionLocal() as session:
                    thread_result = await session.execute(
                        select(EmailThread).where(EmailThread.id == thread_id)
                    )
                    thread = thread_result.scalars().first()
                    if thread is not None:
                        case = await session.get(BrokerCase, thread.broker_case_id)
                        if case is not None:
                            case.status = _normalize_case_status(status)
                        await session.commit()
                        return
            except Exception:
                pass

        for scan_bundle in memory_store._scans.values():  # noqa: SLF001
            for thread in scan_bundle.get("threads", {}).values():
                if thread.get("thread_id") == thread_id:
                    thread["status"] = _normalize_case_status(status)
                    return
