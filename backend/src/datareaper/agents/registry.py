from __future__ import annotations

from datareaper.agents.communications_agent import CommunicationsAgent
from datareaper.agents.legal_agent import LegalAgent
from datareaper.agents.sleuth_agent import SleuthAgent


def agent_registry() -> dict:
    return {
        "sleuth": SleuthAgent(),
        "legal": LegalAgent(),
        "communications": CommunicationsAgent(),
    }
