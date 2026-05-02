from __future__ import annotations

import re
from collections.abc import Iterable

from datareaper.core.config import get_settings
from datareaper.integrations.browser.playwright_client import PlaywrightClient
from datareaper.osint.collectors.sherlock_runner import discover_profiles_via_username_tools

USERNAME_PATTERN = re.compile(
    r"(?:github\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/in|reddit\.com/user)/([A-Za-z0-9_.-]+)",
    re.IGNORECASE,
)

RESERVED_USERNAMES = {
    "about",
    "accessibility",
    "ads",
    "advertising",
    "agreement",
    "api",
    "auth",
    "blog",
    "careers",
    "community",
    "contact",
    "content-policy",
    "copyright",
    "docs",
    "download",
    "dpo",
    "explore",
    "features",
    "global",
    "help",
    "home",
    "jobs",
    "legal",
    "login",
    "news",
    "policies",
    "policy",
    "press",
    "pricing",
    "privacy",
    "privacy-policies",
    "privacy-policy",
    "privacypolicies",
    "privacypolicy",
    "redditdatarequests",
    "search",
    "searchgithub",
    "searchinggithub",
    "security",
    "service",
    "signup",
    "site-policy",
    "status",
    "support",
    "terms",
    "user-agreement",
    "useragreement",
    "ukrepresentative",
}


def is_plausible_username(value: str) -> bool:
    username = str(value or "").strip().lower().lstrip("@")
    if len(username) < 3:
        return False
    if not re.fullmatch(r"[a-z0-9_.-]{3,40}", username):
        return False
    if username in RESERVED_USERNAMES:
        return False
    if username.isdigit():
        return False
    if sum(ch.isalpha() for ch in username) < 2:
        return False
    return True


def _seed_variants(seed: str) -> set[str]:
    normalized = seed.strip().lower()
    if not normalized:
        return set()

    local = normalized.split("@", 1)[0] if "@" in normalized else normalized
    local = re.sub(r"[^a-z0-9._-]", "", local)
    if not local:
        return set()

    variants = {
        local,
        re.sub(r"[._-]", "", local),
    }

    # Strip trailing digits to get base username.
    base = re.sub(r"\d+$", "", local)
    if base and len(base) >= 3 and base != local:
        variants.add(base)

    parts = [part for part in re.split(r"[._-]+", local) if part]
    if parts:
        first = re.sub(r"\d+$", "", parts[0])
        last_raw = parts[-1]
        last = re.sub(r"\d+$", "", last_raw)
        digits_match = re.search(r"(\d+)$", local)
        digits = digits_match.group(1) if digits_match else ""

        if first and last and first != last:
            variants.add(f"{first}{last}")
            variants.add(f"{first}.{last}")
            if digits:
                variants.add(f"{first}{last}{digits}")
                variants.add(f"{last}{digits}")

    return {item for item in variants if is_plausible_username(item)}


def _extract_from_accounts(accounts: Iterable[dict]) -> set[str]:
    extracted: set[str] = set()
    for account in accounts:
        url = str(account.get("url") or "")
        match = USERNAME_PATTERN.search(url)
        if match:
            username = match.group(1).strip().lower()
            if is_plausible_username(username):
                extracted.add(username)
    return extracted


async def discover_usernames(
    accounts: list[dict],
    original_seeds: list[str] | None = None,
    browser: PlaywrightClient | None = None,
) -> list[str]:
    settings = get_settings()
    generated = _extract_from_accounts(accounts)

    for seed in original_seeds or []:
        generated.update(_seed_variants(seed))

    generated = {username for username in generated if is_plausible_username(username)}
    if not generated:
        return []

    if browser is None:
        return sorted(generated)

    usernames_to_expand = sorted(generated)[: max(1, settings.osint_maigret_candidates)]
    profiles = await discover_profiles_via_username_tools(usernames_to_expand, browser)
    for profile in profiles:
        username = profile.get("username")
        if username and is_plausible_username(str(username)):
            generated.add(str(username).strip().lower())
    return sorted(username for username in generated if is_plausible_username(username))
