from __future__ import annotations

from typing import Any

import httpx

from datareaper.scraper.exceptions import FlareSolverrError

FLARESOLVERR_URL = "http://localhost:8191/v1"


async def solve_with_flaresolverr(url: str, timeout: int = 60000) -> dict[str, Any]:
    """Solve anti-bot challenge for a URL using local FlareSolverr.

    Args:
        url: Target URL to solve.
        timeout: Max FlareSolverr timeout in milliseconds.

    Returns:
        Dict containing solved html, cookies, and user agent.
    """
    payload = {
        "cmd": "request.get",
        "url": url,
        "maxTimeout": timeout,
    }

    try:
        async with httpx.AsyncClient(timeout=max(timeout / 1000, 10)) as client:
            response = await client.post(FLARESOLVERR_URL, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise FlareSolverrError(f"FlareSolverr request failed: {exc}") from exc

    data = response.json()
    status = str(data.get("status") or "error")
    if status != "ok":
        message = data.get("message") or data.get("error") or "unknown_error"
        raise FlareSolverrError(f"FlareSolverr returned status={status}: {message}")

    solution = data.get("solution") or {}
    return {
        "html": solution.get("response") or "",
        "cookies": solution.get("cookies") or [],
        "user_agent": solution.get("userAgent") or "",
    }


async def check_flaresolverr_available() -> bool:
    """Check whether local FlareSolverr service is reachable.

    Args:
        None.

    Returns:
        True when local FlareSolverr endpoint is reachable, otherwise False.
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get("http://localhost:8191/")
            return response.status_code in {200, 405}
    except httpx.HTTPError:
        return False


async def get_clearance_cookies(url: str) -> dict[str, str]:
    """Return solved clearance cookies for a URL.

    Args:
        url: Target URL to solve and extract cookies for.

    Returns:
        Cookie dictionary suitable for follow-up HTTP requests.
    """
    result = await solve_with_flaresolverr(url)
    cookies = result.get("cookies") or []
    cookie_dict: dict[str, str] = {}
    for cookie in cookies:
        name = cookie.get("name") if isinstance(cookie, dict) else None
        value = cookie.get("value") if isinstance(cookie, dict) else None
        if name and value is not None:
            cookie_dict[str(name)] = str(value)
    return cookie_dict


async def probe_with_clearance(url: str) -> httpx.Response:
    """Perform follow-up HTTP request using FlareSolverr clearance cookies.

    Args:
        url: Target URL to fetch after obtaining challenge clearance.

    Returns:
        httpx.Response for the follow-up request.
    """
    solved = await solve_with_flaresolverr(url)

    cookies: dict[str, str] = {}
    for cookie in solved.get("cookies") or []:
        if isinstance(cookie, dict) and cookie.get("name"):
            cookies[str(cookie["name"])] = str(cookie.get("value") or "")

    headers = {}
    user_agent = str(solved.get("user_agent") or "")
    if user_agent:
        headers["User-Agent"] = user_agent

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        return await client.get(url, cookies=cookies, headers=headers)


__all__ = [
    "check_flaresolverr_available",
    "get_clearance_cookies",
    "probe_with_clearance",
    "solve_with_flaresolverr",
]