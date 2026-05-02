from __future__ import annotations


def build_thread(messages: list[dict]) -> dict:
    return {"count": len(messages), "messages": messages}
