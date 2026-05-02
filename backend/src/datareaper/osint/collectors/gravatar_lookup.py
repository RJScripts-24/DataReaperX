from __future__ import annotations

import hashlib

import httpx

from datareaper.core.logging import get_logger

logger = get_logger(__name__)


async def lookup_gravatar(email: str) -> dict | None:
    try:
        email_hash = hashlib.md5(email.strip().lower().encode()).hexdigest()
        url = f"https://www.gravatar.com/{email_hash}.json"
        async with httpx.AsyncClient(timeout=8) as client:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return None
                data = resp.json()
                entry = (data.get("entry") or [{}])[0]
                linked_accounts = [
                    {
                        "platform": acc.get("shortname") or acc.get("domain"),
                        "url": acc.get("url"),
                        "username": acc.get("username"),
                    }
                    for acc in (entry.get("accounts") or [])
                    if acc.get("url")
                ]
                result = {
                    "source": "gravatar",
                    "email_hash": email_hash,
                    "profile_url": f"https://gravatar.com/{email_hash}",
                    "display_name": entry.get("displayName"),
                    "preferred_username": entry.get("preferredUsername"),
                    "about_me": entry.get("aboutMe"),
                    "location": (entry.get("currentLocation") or ""),
                    "linked_accounts": linked_accounts,
                    "avatar_url": f"https://www.gravatar.com/avatar/{email_hash}?d=404",
                }
                logger.info("gravatar_hit", email=email, linked_count=len(linked_accounts))
                return result
            except Exception as exc:
                logger.warning("gravatar_miss", email=email, error=str(exc))
                return None
    except Exception as exc:
        logger.warning("gravatar_lookup_failed", email=email, error=str(exc))
        return None
