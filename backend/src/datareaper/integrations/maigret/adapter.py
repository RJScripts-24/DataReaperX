from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from datareaper.core.logging import get_logger

logger = get_logger(__name__)

_FOUND_STATUS_MARKERS = {"claimed", "found", "exists"}
_URL_KEYS = ("url", "url_user", "profile_url")
_SITE_KEYS = ("site", "sitename", "site_name")
_MAX_PROCESS_SECONDS = 150


def _first_string(payload: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if value:
            return str(value).strip()
    return ""


def _looks_like_claim(payload: dict) -> bool:
    status = str(payload.get("status") or payload.get("status_text") or "").strip().lower()
    if status and any(marker in status for marker in _FOUND_STATUS_MARKERS):
        return True

    for key in ("claimed", "exists", "is_found", "found"):
        value = payload.get(key)
        if isinstance(value, bool) and value:
            return True

    return False


def _iter_json_records(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        records = [payload]
        for value in payload.values():
            records.extend(_iter_json_records(value))
        return records

    if isinstance(payload, list):
        records: list[dict] = []
        for item in payload:
            records.extend(_iter_json_records(item))
        return records

    return []


def _normalize_site(site: str, url: str) -> str:
    candidate = site.strip().lower()
    if candidate:
        return candidate
    host = urlparse(url).netloc.lower().replace("www.", "")
    return host or "unknown"


def _load_report_files(folder: Path) -> list[dict]:
    parsed: list[dict] = []
    for file in [*folder.glob("*.json"), *folder.glob("*.ndjson")]:
        try:
            raw = file.read_text(encoding="utf-8")
        except OSError:
            continue

        if not raw.strip():
            continue

        try:
            parsed_payload = json.loads(raw)
        except json.JSONDecodeError:
            lines = [line.strip() for line in raw.splitlines() if line.strip()]
            for line in lines:
                try:
                    parsed.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            continue

        parsed.append(parsed_payload)
    return parsed


def _extract_claimed_profiles(payloads: list[dict], username: str) -> list[dict]:
    deduped: dict[str, dict] = {}
    for payload in payloads:
        for record in _iter_json_records(payload):
            url = _first_string(record, _URL_KEYS)
            if not url.startswith("http"):
                continue
            if not _looks_like_claim(record):
                continue

            site = _normalize_site(_first_string(record, _SITE_KEYS), url)
            deduped[url] = {
                "site": site,
                "url": url,
                "username": username,
                "status": "found",
            }
    return list(deduped.values())


def _candidate_commands(command_suffix: list[str]) -> list[list[str]]:
    backend_root = Path(__file__).resolve().parents[4]
    sibling_backend_root = backend_root.parent.parent / "DataReaper" / "backend"

    candidates = [
        [sys.executable, "-m", "maigret", *command_suffix],
        ["maigret", *command_suffix],
        [str(backend_root / ".venv" / "Scripts" / "python.exe"), "-m", "maigret", *command_suffix],
        [str(backend_root / ".venv" / "Scripts" / "maigret.exe"), *command_suffix],
        [
            str(sibling_backend_root / ".venv" / "Scripts" / "python.exe"),
            "-m",
            "maigret",
            *command_suffix,
        ],
        [str(sibling_backend_root / ".venv" / "Scripts" / "maigret.exe"), *command_suffix],
    ]

    deduped: list[list[str]] = []
    seen: set[tuple[str, ...]] = set()
    for command in candidates:
        executable = command[0]
        if "\\" in executable or "/" in executable:
            if not Path(executable).exists():
                continue
        key = tuple(command)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(command)
    return deduped


async def run_maigret(
    username: str,
    *,
    top_sites: int = 150,
    max_connections: int = 24,
    timeout_seconds: int = 10,
) -> list[dict]:
    """Run maigret against a bounded site subset and return claimed profiles."""
    clean_username = str(username or "").strip()
    if not clean_username:
        return []

    with tempfile.TemporaryDirectory(prefix="datareaper-maigret-") as temp_dir:
        output_dir = Path(temp_dir)
        command_suffix = [
            clean_username,
            "--json",
            "ndjson",
            "--folderoutput",
            str(output_dir),
            "--top-sites",
            str(max(1, top_sites)),
            "--max-connections",
            str(max(1, max_connections)),
            "--timeout",
            str(max(3, timeout_seconds)),
            "--no-recursion",
            "--no-autoupdate",
            "--no-progressbar",
            "--no-color",
        ]

        stderr_text = ""
        attempted_commands: list[str] = []
        for command in _candidate_commands(command_suffix):
            attempted_commands.append(" ".join(command[:3]))
            try:
                proc = await asyncio.create_subprocess_exec(
                    *command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env={
                        **dict(os.environ),
                        "PYTHONUTF8": "1",
                        "PYTHONIOENCODING": "utf-8",
                        "TERM": "dumb",
                    },
                )
            except FileNotFoundError:
                continue

            try:
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=_MAX_PROCESS_SECONDS)
            except TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.warning(
                    "maigret_timeout",
                    username=clean_username,
                    command=" ".join(command[:3]),
                )
                continue

            stderr_text = stderr.decode("utf-8", errors="ignore").strip()
            if proc.returncode in (0, None):
                logger.info(
                    "maigret_completed",
                    username=clean_username,
                    command=" ".join(command[:3]),
                )
                break
            logger.warning(
                "maigret_command_failed",
                username=clean_username,
                command=" ".join(command[:3]),
                returncode=proc.returncode,
                stderr=stderr_text[:500],
            )
        else:
            logger.warning(
                "maigret_unavailable",
                username=clean_username,
                attempted_commands=attempted_commands,
            )
            return []

        payloads = _load_report_files(output_dir)
        if not payloads:
            if stderr_text:
                logger.warning(
                    "maigret_empty_report",
                    username=clean_username,
                    stderr=stderr_text[:500],
                )
            return []
        return _extract_claimed_profiles(payloads, clean_username)


__all__ = ["run_maigret"]
