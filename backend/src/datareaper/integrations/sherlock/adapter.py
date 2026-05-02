from __future__ import annotations

import asyncio
import json
import re
import sys

from datareaper.core.logging import get_logger

logger = get_logger(__name__)

_FALLBACK_SITES = ("GitHub", "Reddit", "Instagram", "Twitter", "TikTok", "LinkedIn")


async def run_sherlock(username: str) -> list[dict]:
	"""Run sherlock and return claimed profiles for the supplied username."""
	json_mode_command = [sys.executable, "-m", "sherlock", "--json", username, "--timeout", "10"]
	text_mode_command = [
		sys.executable,
		"-m",
		"sherlock_project",
		username,
		"--print-found",
		"--no-color",
		"--no-txt",
		"--timeout",
		"10",
	]
	for site in _FALLBACK_SITES:
		text_mode_command.extend(["--site", site])

	async def _run_command(command: list[str]) -> tuple[int | None, str, str]:
		proc = await asyncio.create_subprocess_exec(
			*command,
			stdout=asyncio.subprocess.PIPE,
			stderr=asyncio.subprocess.PIPE,
		)
		try:
			stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90)
		except TimeoutError:
			proc.kill()
			await proc.communicate()
			logger.warning("sherlock_timeout", username=username)
			return None, "", ""
		return (
			proc.returncode,
			stdout.decode("utf-8", errors="ignore").strip(),
			stderr.decode("utf-8", errors="ignore").strip(),
		)

	def _parse_json_payload(payload: str) -> list[dict]:
		if not payload:
			return []
		try:
			parsed = json.loads(payload)
		except json.JSONDecodeError:
			return []

		results: list[dict] = []
		if isinstance(parsed, dict):
			iterable = parsed.items()
		elif isinstance(parsed, list):
			iterable = [
				(str(item.get("site") or "unknown"), item)
				for item in parsed
				if isinstance(item, dict)
			]
		else:
			return []

		for site, details in iterable:
			if not isinstance(details, dict):
				continue
			status = str(details.get("status") or details.get("Status") or "")
			if status != "Claimed":
				continue
			results.append(
				{
					"site": str(site).lower(),
					"url": str(details.get("url") or details.get("url_main") or ""),
					"status": "found",
				}
			)
		return results

	def _parse_text_payload(payload: str) -> list[dict]:
		results: list[dict] = []
		pattern = re.compile(r"^\[\+\]\s+([^:]+):\s+(https?://\S+)\s*$")
		for line in payload.splitlines():
			match = pattern.match(line.strip())
			if not match:
				continue
			site, url = match.groups()
			results.append({"site": site.strip().lower(), "url": url.strip(), "status": "found"})
		return results

	returncode, payload, stderr = await _run_command(json_mode_command)
	results = _parse_json_payload(payload)
	if results:
		return results

	if returncode not in (0, None):
		logger.warning(
			"sherlock_non_zero_exit",
			username=username,
			returncode=returncode,
			stderr=stderr,
		)

	returncode, payload, stderr = await _run_command(text_mode_command)
	if returncode not in (0, None):
		logger.warning(
			"sherlock_non_zero_exit",
			username=username,
			returncode=returncode,
			stderr=stderr,
		)
		return []

	return _parse_text_payload(payload)


__all__ = ["run_sherlock"]
