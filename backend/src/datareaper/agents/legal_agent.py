from __future__ import annotations

from datareaper.agents.base import AgentResult, BaseAgent
from datareaper.core.exceptions import LLMProviderError
from datareaper.legal.notice_builder import build_notice, build_notice_with_llm


class LegalAgent(BaseAgent):
    name = "legal"

    async def run(self, context: dict) -> AgentResult:
        jurisdiction = context.get("jurisdiction", "DPDP")
        seed = context.get("seed", "")
        identity = context.get("identity", {})
        notices: list[dict] = []

        for target in context.get("targets", []):
            broker_name = target.get("broker_name") if isinstance(target, dict) else str(target)
            if self.llm is not None:
                try:
                    notice = await build_notice_with_llm(
                        jurisdiction,
                        seed,
                        identity,
                        broker_name,
                        self.llm,
                    )
                except LLMProviderError:
                    notice = build_notice(jurisdiction, seed, identity, broker_name)
            else:
                notice = build_notice(jurisdiction, seed, identity, broker_name)
            notices.append({"broker_name": broker_name, "notice": notice})

        return AgentResult(
            agent=self.name,
            status="ok",
            payload={**context, "notices": notices},
        )
