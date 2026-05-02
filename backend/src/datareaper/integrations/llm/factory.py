from __future__ import annotations

from datareaper.core.config import get_settings
from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.groq_client import GroqClient


def build_llm_client(provider: str | None = None) -> BaseLLMClient | None:
    settings = get_settings()
    selected = (provider or settings.llm_provider or "groq").strip().lower()
    if selected != "groq":
        return None
    if not settings.groq_api_key:
        return None
    return GroqClient(model=settings.groq_model)


__all__ = ["build_llm_client"]
