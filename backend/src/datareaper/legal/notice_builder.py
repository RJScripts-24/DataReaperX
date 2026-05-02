from __future__ import annotations

from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.prompt_loader import load_prompt
from datareaper.legal.citation_builder import build_citations

JURISDICTION_FRAMEWORK = {
    "DPDP": "Section 6 and Section 12 of the DPDP Act 2023",
    "GDPR": "Article 17 and Article 5(1)(c) of the GDPR",
    "CCPA": "Section 1798.105 of the CCPA",
}


async def build_notice_with_llm(
    jurisdiction: str,
    seed: str,
    identity: dict,
    broker_name: str,
    llm: BaseLLMClient,
) -> str:
    legal_basis = JURISDICTION_FRAMEWORK.get(jurisdiction.upper(), "applicable privacy law")
    system = load_prompt("legal_notice.md")
    prompt = (
        f"Jurisdiction: {jurisdiction}\n"
        f"Draft a deletion notice to {broker_name} on behalf of a data subject "
        f"whose email is {seed}, name is {identity.get('name') or identity.get('real_name')}, "
        f"located in {identity.get('location')}. "
        "Request immediate deletion of all their personal data. "
        f"Legal framework to cite: {legal_basis}."
    )
    return await llm.generate(prompt=prompt, system=system)


def build_notice(
    jurisdiction: str,
    seed: str,
    identity: dict | None = None,
    broker_name: str = "Data Broker",
) -> str:
    citations = ", ".join(build_citations(jurisdiction))
    subject_name = (
        (identity or {}).get("name")
        or (identity or {}).get("real_name")
        or "the data subject"
    )
    location = (identity or {}).get("location") or "their current jurisdiction"
    return (
        f"To {broker_name},\n\n"
        f"I am writing on behalf of {subject_name} ({seed}), located in {location}, "
        "to formally request the immediate deletion of all personal data in your systems. "
        "This request includes all derived and "
        "inferred data, and all data shared with affiliates or processors.\n\n"
        "Any request for additional identity artifacts that exceeds "
        "proportional verification is declined "
        "under data minimization principles.\n\n"
        f"Legal basis: {citations}.\n\n"
        "Please confirm completion in writing without undue delay."
    )
