from __future__ import annotations

import re

from datareaper.core.logging import get_logger
from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.prompt_loader import load_prompt
from datareaper.legal.notice_builder import build_notice
from datareaper.legal.rule_engine import load_jurisdiction_rules

DEADLINE_BY_JURISDICTION = {
    "GDPR": "30 days",
    "CCPA": "45 days",
    "DPDP": "30 days",
}

logger = get_logger(__name__)


def _is_data_denial(text: str) -> bool:
    lowered = text.lower()
    denial_patterns = [
        "no data",
        "no record",
        "not found",
        "do not have",
        "unable to locate",
    ]
    return any(pattern in lowered for pattern in denial_patterns)


def _rules_citations(rules: dict) -> str:
    citations = rules.get("citations") if isinstance(rules.get("citations"), dict) else {}
    values = [str(value) for value in citations.values() if value]
    return ", ".join(values) if values else "applicable privacy law"


def _deadline_days(rules: dict, jurisdiction: str) -> int:
    raw = rules.get("statutory_deadline_days")
    if isinstance(raw, int):
        return raw
    fallback = DEADLINE_BY_JURISDICTION.get(jurisdiction.upper(), "30 days")
    digits = re.findall(r"\d+", fallback)
    return int(digits[0]) if digits else 30


async def build_reply_with_llm(
    intent: str,
    jurisdiction: str,
    broker_reply: str,
    history: list[str],
    days_elapsed: int,
    evidence_url: str | None,
    llm: BaseLLMClient,
) -> str:
    rules = load_jurisdiction_rules(jurisdiction)
    deadline_days = _deadline_days(rules, jurisdiction)
    effective_intent = "legal_violation" if days_elapsed > deadline_days else intent

    citation_text = _rules_citations(rules)
    evidence_line = ""
    if evidence_url and _is_data_denial(broker_reply):
        evidence_line = (
            "Contrary to your statement, our system has recorded a match. "
            f"See evidence: {evidence_url}"
        )

    prompt_template = load_prompt("reply_generator.md")
    history_block = "\n".join([f"- {item}" for item in history[-10:]]) or "- <none>"
    prompt = (
        f"{prompt_template}\n\n"
        f"Intent: {effective_intent}\n"
        f"Jurisdiction: {jurisdiction}\n"
        f"Days elapsed since initial notice: {days_elapsed}\n"
        f"Statutory deadline (days): {deadline_days}\n"
        f"Applicable citations: {citation_text}\n"
        f"Escalation triggers: {rules.get('escalation_triggers', {})}\n"
        f"Thread history:\n{history_block}\n\n"
        f"Latest broker reply:\n{broker_reply}\n\n"
    )

    if effective_intent in {"illegal_pushback", "legal_violation"}:
        prompt += "You must explicitly cite the most relevant legal clauses above.\n"
    if evidence_line:
        prompt += f"Include this evidence sentence verbatim: {evidence_line}\n"

    try:
        return await llm.generate(prompt=prompt, max_tokens=1024)
    except Exception as exc:
        logger.warning("reply_generation_llm_failed", error=str(exc))
        return build_reply(
            intent=effective_intent,
            jurisdiction=jurisdiction,
            broker_reply=broker_reply,
            identity={},
        )


def build_reply(
    intent: str,
    jurisdiction: str,
    broker_reply: str = "",
    identity: dict | None = None,
) -> str:
    deadline = DEADLINE_BY_JURISDICTION.get(jurisdiction.upper(), "30 days")
    if intent == "illegal_pushback":
        return (
            "Your request for additional identification is excessive and violates "
            "data minimization requirements. We will not provide government IDs. "
            "If deletion is not completed within 72 hours, "
            "a formal complaint and legal escalation will be initiated."
        )
    if intent == "stalling":
        return (
            f"This request remains subject to a statutory response window of {deadline}. "
            "Please confirm full deletion and written closure immediately to avoid escalation."
        )
    if intent == "legal_violation":
        return (
            "Your handling of this request appears to breach the applicable statutory timeline. "
            "Treat this as formal notice of legal escalation unless complete deletion is confirmed immediately."
        )
    if intent == "form_request":
        return (
            "We will complete strictly required fields in your form using already "
            "provided information. "
            "No additional sensitive identity documents will be submitted."
        )
    if intent == "irrelevant":
        return (
            "Your message did not address the deletion request. "
            "Please provide a direct status update on data deletion compliance."
        )
    if intent == "success":
        return (
            "Acknowledged. Please provide written confirmation that deletion has "
            "been fully completed."
        )
    return build_notice(
        jurisdiction,
        "user@email.com",
        identity=identity or {},
        broker_name="Data Broker",
    )
