from __future__ import annotations

import asyncio

from datareaper.osint.collectors.holehe_runner import run_holehe


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return []


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("email_probe")
    seed = str(state.get("normalized_seed") or state.get("seed") or "")
    scan_id = str(state.get("scan_id") or "")
    accounts = _run_async(run_holehe(seed)) or []
    state["accounts"] = accounts
    state["stage"] = "email_probe"
    state["progress"] = max(int(state.get("progress", 0)), 20)

    # Emit per-platform stage completion updates as accounts are discovered.
    from datareaper.realtime.node_publisher import emit
    import asyncio as _aio

    for acct in accounts:
        try:
            loop = _aio.get_event_loop()
            if loop.is_running() and scan_id:
                loop.create_task(
                    emit(
                        scan_id,
                        "stage_complete",
                        {
                            "stage": "email_probe",
                            "platform": str(acct.get("platform", "")),
                            "username": str(acct.get("username", seed)),
                            "exists": bool(acct.get("exists", True)),
                        },
                    )
                )
        except Exception:
            pass

    return state
