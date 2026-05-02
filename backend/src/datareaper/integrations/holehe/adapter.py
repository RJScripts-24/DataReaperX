from __future__ import annotations

import asyncio
import inspect
from collections.abc import Iterable

from datareaper.core.logging import get_logger

logger = get_logger(__name__)


def _extract_modules() -> list:
    try:
        import holehe.modules as holehe_modules  # type: ignore

        candidates = []
        for value in vars(holehe_modules).values():
            if callable(value) and getattr(value, "__module__", "").startswith("holehe.modules"):
                candidates.append(value)
        if candidates:
            return candidates
    except Exception:  # pragma: no cover - external package layout differences
        return []
    return []


def _normalize_results(raw: object) -> list[dict]:
    if not isinstance(raw, Iterable):
        return []
    normalized: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        exists = bool(item.get("exists"))
        if not exists:
            continue
        normalized.append(
            {
                "name": str(item.get("name") or item.get("domain") or "unknown").lower(),
                "exists": True,
                "url": str(item.get("url") or item.get("rateLimit") or ""),
            }
        )
    return normalized


async def run_holehe(email: str) -> list[dict]:
	"""Run holehe against an email and return only positive matches."""
	semaphore = asyncio.Semaphore(20)

	async def _run_module(module, out: list[dict]) -> None:
		async with semaphore:
			try:
				result = module(email, out)
				if inspect.isawaitable(result):
					await result
			except Exception as exc:  # pragma: no cover - module level failures are non-fatal
				logger.debug(
					"holehe_module_failed",
					module=getattr(module, "__name__", "unknown"),
					error=str(exc),
				)

	async def _run() -> list[dict]:
		# Prefer direct core function when available; fallback to executing discovered modules.
		try:
			from holehe.core import get_email_from_modules  # type: ignore

			modules = _extract_modules()
			if modules:
				out: list[dict] = []
				await get_email_from_modules(email=email, modules=modules, out=out)  # type: ignore[arg-type]
				return _normalize_results(out)
		except Exception:
			return []

		modules = _extract_modules()
		if not modules:
			return []
		out: list[dict] = []
		await asyncio.gather(*[_run_module(module, out) for module in modules])
		return _normalize_results(out)

	try:
		return await asyncio.wait_for(_run(), timeout=120)
	except TimeoutError:
		logger.warning("holehe_timeout", email=email)
		return []
	except Exception as exc:  # pragma: no cover - external invocation failures
		logger.warning("holehe_failed", email=email, error=str(exc))
		return []


__all__ = ["run_holehe"]
