from __future__ import annotations

from typing import Any


def detect_captcha(html: str) -> dict[str, bool | str | None]:
    """Detect known CAPTCHA signals in HTML.

    Args:
        html: Raw HTML content to inspect.

    Returns:
        Detection payload with detected flag and captcha type.
    """
    lowered = (html or "").lower()

    if "hcaptcha.com" in lowered:
        return {"detected": True, "type": "hcaptcha"}
    if "recaptcha" in lowered:
        return {"detected": True, "type": "recaptcha"}
    if "challenges.cloudflare.com" in lowered:
        return {"detected": True, "type": "turnstile"}

    generic_tokens = [
        "captcha",
        "g-recaptcha",
        "h-captcha",
        "cf-turnstile",
        "challenge-form",
        "captcha-container",
    ]
    if any(token in lowered for token in generic_tokens):
        return {"detected": True, "type": "generic"}

    return {"detected": False, "type": None}


async def handle_captcha_block(state: dict[str, Any], ws_manager: Any) -> dict[str, Any]:
    """Pause scraper state and notify frontend when CAPTCHA is detected.

    Args:
        state: Mutable LangGraph-style state payload.
        ws_manager: WebSocket manager exposing async broadcast(payload).

    Returns:
        Updated state with paused flags applied.
    """
    broker = str(state.get("current_broker") or "unknown")
    captcha_type = str(state.get("captcha_type") or "generic")
    await ws_manager.broadcast(
        {
            "event": "captcha_block",
            "broker": broker,
            "type": captcha_type,
        }
    )
    state["paused"] = True
    state["pause_reason"] = "captcha"
    return state


__all__ = ["detect_captcha", "handle_captcha_block"]