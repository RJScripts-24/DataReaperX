from __future__ import annotations

import asyncio
from collections import defaultdict
import json
import secrets
from typing import Any

from fastapi import WebSocket

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover - optional runtime fallback
    Redis = None  # type: ignore[assignment]


logger = get_logger(__name__)


def _json_default(value: Any) -> str:
    return str(value)


class EventBus:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._instance_id = secrets.token_hex(8)
        self._redis_topic = "datareaper:realtime"
        self._subscriber_task: asyncio.Task[None] | None = None
        self._subscriber_lock = asyncio.Lock()
        self._publisher: Redis | None = None

    @staticmethod
    def _redis_url() -> str:
        return get_settings().effective_arq_redis_url

    async def _get_publisher(self) -> Redis | None:
        if Redis is None:
            return None
        if self._publisher is None:
            self._publisher = Redis.from_url(
                self._redis_url(),
                encoding="utf-8",
                decode_responses=True,
            )
        return self._publisher

    async def _ensure_subscriber(self) -> None:
        if Redis is None:
            return
        if self._subscriber_task and not self._subscriber_task.done():
            return

        async with self._subscriber_lock:
            if self._subscriber_task and not self._subscriber_task.done():
                return
            self._subscriber_task = asyncio.create_task(self._subscriber_loop())

    async def _subscriber_loop(self) -> None:
        if Redis is None:
            return

        while True:
            subscriber: Redis | None = None
            pubsub = None
            try:
                subscriber = Redis.from_url(
                    self._redis_url(),
                    encoding="utf-8",
                    decode_responses=True,
                )
                pubsub = subscriber.pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(self._redis_topic)

                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue

                    raw = message.get("data")
                    if not isinstance(raw, str):
                        continue

                    try:
                        envelope = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if str(envelope.get("origin") or "") == self._instance_id:
                        continue

                    channel = str(envelope.get("channel") or "").strip()
                    payload = envelope.get("payload")
                    if not channel or not isinstance(payload, dict):
                        continue

                    await self._publish_local(channel, payload)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("realtime_subscriber_loop_error", error=str(exc))
                await asyncio.sleep(1.0)
            finally:
                try:
                    if pubsub is not None:
                        await pubsub.close()
                except Exception:
                    pass
                try:
                    if subscriber is not None:
                        await subscriber.aclose()
                except Exception:
                    pass

    async def _publish_local(self, channel: str, payload: dict) -> None:
        for socket in list(self._connections[channel]):
            try:
                await socket.send_json(payload)
            except Exception:
                await self.disconnect(channel, socket)

    async def _publish_remote(self, channel: str, payload: dict) -> None:
        publisher = await self._get_publisher()
        if publisher is None:
            return

        envelope = {
            "origin": self._instance_id,
            "channel": channel,
            "payload": payload,
        }
        try:
            await publisher.publish(
                self._redis_topic,
                json.dumps(envelope, default=_json_default),
            )
        except Exception as exc:
            logger.warning("realtime_remote_publish_failed", channel=channel, error=str(exc))

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await self._ensure_subscriber()
        self._connections[channel].append(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        if websocket in self._connections[channel]:
            self._connections[channel].remove(websocket)

    async def publish(self, channel: str, payload: dict) -> None:
        await self._publish_local(channel, payload)
        await self._publish_remote(channel, payload)


event_bus = EventBus()
