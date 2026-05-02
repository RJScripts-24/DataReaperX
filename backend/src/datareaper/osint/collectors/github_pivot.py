from __future__ import annotations

import asyncio

import httpx

from datareaper.core.logging import get_logger

logger = get_logger(__name__)

GITHUB_API_BASE = "https://api.github.com"
GITHUB_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "DataReaper-OSINT/1.0",
}


async def github_usernames_from_email(email: str, token: str | None = None) -> list[dict]:
    normalized = str(email).strip().lower()
    if "@" not in normalized:
        return []

    try:
        headers = dict(GITHUB_HEADERS)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(headers=headers, timeout=12) as client:
            response = await client.get(
                f"{GITHUB_API_BASE}/search/users",
                params={
                    "q": f"\"{normalized}\" in:email",
                    "per_page": 10,
                },
            )

        if response.status_code != 200:
            logger.info(
                "github_email_lookup_complete",
                email=normalized,
                usernames=0,
                status=response.status_code,
            )
            return []

        payload = response.json() if response.content else {}
        items = payload.get("items", []) if isinstance(payload, dict) else []

        discovered: list[dict] = []
        seen_usernames: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            username = str(item.get("login") or "").strip().lower()
            if not username or username in seen_usernames:
                continue
            seen_usernames.add(username)
            profile_url = str(item.get("html_url") or f"https://github.com/{username}").strip()
            discovered.append(
                {
                    "platform": "github",
                    "username": username,
                    "url": profile_url,
                }
            )

        logger.info(
            "github_email_lookup_complete",
            email=normalized,
            usernames=len(discovered),
            status=200,
        )
        return discovered
    except Exception as exc:
        logger.warning("github_email_lookup_failed", email=normalized, error=str(exc))
        return []


async def github_deep_pivot(username: str, token: str | None = None) -> dict:
    try:
        headers = dict(GITHUB_HEADERS)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(headers=headers, timeout=15) as client:

            async def _get(path: str) -> object:
                try:
                    resp = await client.get(f"{GITHUB_API_BASE}{path}")
                    if resp.status_code == 200:
                        return resp.json()
                except Exception:
                    pass
                return {}

            user, repos_raw, events_raw = await asyncio.gather(
                _get(f"/users/{username}"),
                _get(f"/users/{username}/repos?per_page=30&sort=updated"),
                _get(f"/users/{username}/events/public?per_page=30"),
            )

        user = user if isinstance(user, dict) else {}
        repos = repos_raw if isinstance(repos_raw, list) else []
        events = events_raw if isinstance(events_raw, list) else []

        commit_emails: set[str] = set()
        for event in events:
            for commit in (event.get("payload") or {}).get("commits") or []:
                email = (commit.get("author") or {}).get("email", "")
                if email and "noreply.github.com" not in email and "@" in email:
                    commit_emails.add(email.strip().lower())

        repo_languages = {r.get("language") for r in repos if r.get("language")}

        result = {
            "source": "github_api",
            "username": username,
            "name": user.get("name"),
            "email": user.get("email"),
            "company": user.get("company"),
            "location": user.get("location"),
            "bio": user.get("bio"),
            "blog": user.get("blog"),
            "twitter_username": user.get("twitter_username"),
            "public_repos": user.get("public_repos", 0),
            "commit_emails": sorted(commit_emails),
            "repo_languages": sorted(repo_languages),
            "profile_url": f"https://github.com/{username}",
        }

        logger.info(
            "github_pivot_complete",
            username=username,
            commit_emails=len(commit_emails),
            repos=len(repos),
        )
        return result
    except Exception as exc:
        logger.warning("github_pivot_failed", username=username, error=str(exc))
        return {}
