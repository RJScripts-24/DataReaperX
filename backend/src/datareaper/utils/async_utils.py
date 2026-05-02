from __future__ import annotations

import asyncio
from collections.abc import Awaitable


async def run_background(task: Awaitable) -> None:
    asyncio.create_task(task)
