from __future__ import annotations

from datareaper.agents.base import AgentResult, BaseAgent
from datareaper.comms.reply_generator import build_reply, build_reply_with_llm
from datareaper.comms.sync import sync_inbox_for_scan


class CommunicationsAgent(BaseAgent):
    name = "communications"

    async def run(self, context: dict) -> AgentResult:
        max_iterations = int(context.get("max_iterations", 2))
        jurisdiction = context.get("jurisdiction", "DPDP")
        scan_id = context.get("scan_id")
        battle_repo = context.get("battle_repo")
        thread_updates: list[dict] = []

        if not scan_id or battle_repo is None:
            return AgentResult(
                agent=self.name,
                status="error",
                payload=context,
                error="missing_scan_or_repository",
            )

        for _ in range(max_iterations):
            updates = await sync_inbox_for_scan(scan_id=scan_id, battle_repo=battle_repo, llm=self.llm)
            thread_updates.extend(updates)
            unresolved = [
                row
                for row in updates
                if row.get("intent") in {"stalling", "illegal_pushback", "legal_violation", "form_request"}
            ]
            if not unresolved:
                break

        replies: list[str] = []
        for update in thread_updates:
            intent = update.get("intent", "stalling")
            if self.llm is not None:
                reply = await build_reply_with_llm(
                    intent=intent,
                    jurisdiction=jurisdiction,
                    broker_reply=str(update.get("body") or ""),
                    history=context.get("history", []),
                    days_elapsed=int(context.get("days_elapsed", 0)),
                    evidence_url=context.get("evidence_url"),
                    llm=self.llm,
                )
            else:
                reply = build_reply(intent, jurisdiction)
            replies.append(reply)

        return AgentResult(
            agent=self.name,
            status="ok",
            payload={**context, "thread_updates": thread_updates, "replies": replies},
        )
