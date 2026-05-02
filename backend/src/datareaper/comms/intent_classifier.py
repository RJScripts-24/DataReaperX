from __future__ import annotations

import re

from datareaper.core.logging import get_logger
from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.prompt_loader import load_prompt
from datareaper.legal.data_minimization import is_excessive_request

INTENT_LABELS = {
    "success",
    "stalling",
    "form_request",
    "illegal_pushback",
    "legal_violation",
    "irrelevant",
}

logger = get_logger(__name__)


def _normalize_label(label: str) -> str:
    value = label.strip().lower().replace(" ", "_")
    if value == "in_progress":
        return "stalling"
    return value


def _normalize_confidence(value: object, default: float = 0.55) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(parsed, 1.0))


def _contains_legal_violation(text: str) -> bool:
    lowered = text.lower()
    legal_markers = [
        "cannot process",
        "will not delete",
        "do not have to",
        "deny your request",
        "not obligated",
    ]
    return any(marker in lowered for marker in legal_markers)


def _heuristic_intent(text: str) -> str:
    lowered = text.lower()
    if is_excessive_request(text) or "passport" in lowered or "identification" in lowered:
        return "illegal_pushback"
    if _contains_legal_violation(text):
        return "legal_violation"
    if "form" in lowered or "fill out" in lowered or "link" in lowered:
        return "form_request"
    if "4-6 weeks" in lowered or "processing" in lowered or "allow" in lowered:
        return "stalling"
    if "removed" in lowered or "deleted" in lowered:
        return "success"
    if re.search(r"\b(thank you|welcome|newsletter|promotion)\b", lowered):
        return "irrelevant"
    return "stalling"


async def classify_intent_with_llm(reply_text: str, history: list[str], llm: BaseLLMClient) -> dict:
    prompt_template = load_prompt("intent_classifier.md")
    history_block = "\n".join([f"- {item}" for item in history[-8:]]) or "- <none>"
    prompt = (
        f"{prompt_template}\n\n"
        "Thread history (most recent last):\n"
        f"{history_block}\n\n"
        "Latest broker reply:\n"
        f"{reply_text}\n\n"
        "Return ONLY JSON: {\"intent\": \"...\", \"confidence\": 0.0}"
    )

    try:
        payload = await llm.generate_json(prompt=prompt, max_tokens=128)
        label = _normalize_label(str(payload.get("intent") or ""))
        if label in INTENT_LABELS:
            return {
                "intent": label,
                "confidence": _normalize_confidence(payload.get("confidence"), default=0.75),
            }
    except Exception as exc:
        logger.warning("intent_classification_llm_failed", error=str(exc))

    fallback = _heuristic_intent(reply_text)
    return {"intent": fallback, "confidence": 0.55}


def classify_intent(text: str) -> str:
    return _heuristic_intent(text)
