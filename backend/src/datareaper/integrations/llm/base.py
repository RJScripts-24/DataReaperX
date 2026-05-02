from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod


class BaseLLMClient(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system: str = "", max_tokens: int = 2048) -> str:
        """Call the LLM and return the text response."""

    async def generate_json(self, prompt: str, system: str = "", max_tokens: int = 2048) -> dict:
        """Call LLM and parse response as JSON, stripping markdown code fences."""
        raw = await self.generate(prompt=prompt, system=system, max_tokens=max_tokens)
        clean = re.sub(r"```(?:json)?|```", "", raw, flags=re.IGNORECASE).strip()
        return json.loads(clean)
