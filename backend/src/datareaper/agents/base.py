from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from datareaper.agents.prompt_manager import load_prompt


@dataclass(slots=True)
class AgentResult:
    agent: str
    status: str
    payload: dict
    error: str | None = None


class BaseAgent(ABC):
    name = "base"

    def __init__(self, llm=None) -> None:
        self.llm = llm

    def load_prompt(self, filename: str) -> str:
        return load_prompt(filename)

    @abstractmethod
    async def run(self, context: dict) -> AgentResult:
        return AgentResult(agent=self.name, status="ok", payload=context)
