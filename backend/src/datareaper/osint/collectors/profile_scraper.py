from __future__ import annotations

import json as _json
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger
from datareaper.integrations.browser.playwright_client import PlaywrightClient
from datareaper.integrations.llm.base import BaseLLMClient
from datareaper.integrations.llm.prompt_loader import load_prompt
from datareaper.osint.username_discovery import is_plausible_username
from datareaper.utils.storage import upload_evidence

try:
    from trafilatura import extract as trafilatura_extract
except ModuleNotFoundError:  # pragma: no cover - depends on optional local deps
    trafilatura_extract = None

LOCATION_REGEX = re.compile(r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s([A-Z][a-z]+)\b")
EMPLOYER_REGEX = re.compile(
    r"(?:works\s+at|company)\s*[:\-]?\s*([A-Za-z0-9&.,\- ]{2,80})",
    re.IGNORECASE,
)
EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HANDLE_REGEX = re.compile(r"@?([A-Za-z0-9_.-]{3,40})")

logger = get_logger(__name__)

PROFILE_PATH_MARKERS = (
    "/@",
    "/in/",
    "/u/",
    "/user/",
    "/users/",
    "/member/",
    "/members/",
    "/profile/",
    "/profiles/",
    "/people/",
    "/person/",
    "/channel/",
)

NON_PROFILE_HOST_MARKERS = (
    "docs.",
    "support.",
    "status.",
    "help.",
)

NON_PROFILE_PATH_MARKERS = (
    "/search",
    "/login",
    "/auth",
    "/security",
    "/support",
    "/docs",
    "/help",
    "/about",
    "/press",
    "/news",
    "/careers",
    "/privacy",
    "/policies",
    "/policy",
    "/terms",
    "/agreement",
    "/site-policy",
    "/legal",
    "/contact",
)


def _confidence(name: str | None, location: str | None, employer: str | None) -> float:
    score = 0.0
    if name:
        score += 0.45
    if location:
        score += 0.35
    if employer:
        score += 0.15
    return min(score, 0.95)


def _extract_og_data(soup) -> dict:
    og: dict = {}
    for prop in [
        "og:title",
        "og:description",
        "og:image",
        "og:url",
        "profile:username",
    ]:
        tag = soup.find("meta", attrs={"property": prop})
        if tag and tag.get("content"):
            og[prop.split(":")[-1]] = str(tag["content"]).strip()
    return og


def _extract_jsonld(soup) -> dict:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            raw = tag.string or tag.get_text() or ""
            data = _json.loads(raw)
            if not isinstance(data, dict):
                continue
            if data.get("@type") in ("Person", "ProfilePage", "WebPage"):
                same_as = data.get("sameAs") or []
                if isinstance(same_as, str):
                    same_as = [same_as]

                works_for_value = data.get("worksFor") or {}
                if isinstance(works_for_value, dict):
                    works_for = works_for_value.get("name")
                else:
                    works_for = works_for_value

                image_value = data.get("image")
                image = image_value.get("url") if isinstance(image_value, dict) else image_value

                location_value = (
                    data.get("location") or data.get("homeLocation") or data.get("address")
                )
                if isinstance(location_value, dict):
                    location_value = (
                        location_value.get("name")
                        or location_value.get("addressLocality")
                        or location_value.get("addressRegion")
                    )

                return {
                    "name": data.get("name"),
                    "url": data.get("url"),
                    "same_as": [str(u) for u in same_as if u],
                    "works_for": works_for,
                    "job_title": data.get("jobTitle"),
                    "description": data.get("description"),
                    "image": image,
                    "location": location_value,
                }
        except Exception:
            continue
    return {}


def _extract_social_meta(soup) -> dict:
    handles: dict = {}
    for name in ["twitter:creator", "twitter:site", "article:author"]:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        if tag and tag.get("content"):
            handles[name.split(":")[-1]] = str(tag["content"]).strip()
    return handles


def _extract_from_html(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    og = _extract_og_data(soup)
    jsonld = _extract_jsonld(soup)
    social = _extract_social_meta(soup)

    og_title = og.get("title")
    h1 = soup.find("h1")
    raw_name = (
        jsonld.get("name")
        or (og_title if og_title and len(og_title) < 80 else None)
        or (h1.get_text(strip=True) if h1 else None)
    )

    text_blob = soup.get_text(" ", strip=True)
    location_match = LOCATION_REGEX.search(text_blob)
    location = jsonld.get("location") or (
        ", ".join(location_match.groups()) if location_match else None
    )

    employer = jsonld.get("works_for")
    if not employer:
        company_meta = soup.find("meta", attrs={"name": "company"})
        if company_meta:
            employer = company_meta.get("content")
        else:
            employer_match = EMPLOYER_REGEX.search(text_blob)
            if employer_match:
                employer = employer_match.group(1).strip()

    return {
        "name": raw_name,
        "location": location,
        "employer": employer or jsonld.get("works_for"),
        "job_title": jsonld.get("job_title"),
        "emails": sorted(set(EMAIL_REGEX.findall(text_blob))),
        "same_as_urls": jsonld.get("same_as", []),
        "social_handles": social,
        "image_url": jsonld.get("image") or og.get("image"),
        "text_blob": text_blob,
    }


def _extract_usernames_from_url(url: str) -> list[str]:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    usernames = [part for part in parts if re.fullmatch(r"[A-Za-z0-9_.-]{3,}", part)]
    return usernames[:5]


def is_profile_candidate_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")
    path = parsed.path or "/"
    lowered_path = path.lower()
    segments = [part for part in lowered_path.split("/") if part]

    if not host:
        return False
    if any(host.startswith(marker) for marker in NON_PROFILE_HOST_MARKERS):
        return False
    if any(marker in lowered_path for marker in NON_PROFILE_PATH_MARKERS):
        return False
    if any(marker in lowered_path for marker in PROFILE_PATH_MARKERS):
        return True
    if host in {"t.me", "github.com", "reddit.com", "x.com", "twitter.com", "instagram.com"}:
        return len(segments) == 1 and bool(re.fullmatch(r"@?[a-z0-9_.-]{3,40}", segments[0]))
    return 1 <= len(segments) <= 2 and any(
        re.fullmatch(r"@?[a-z0-9_.-]{3,40}", segment) for segment in segments
    )


async def _extract_with_llm(url: str, text: str, llm: BaseLLMClient | None) -> dict:
    if llm is None:
        return {}

    system = load_prompt("sleuth_identity.md")
    prompt = (
        "Extract profile attributes from this public page text snippet. "
        "Return strict JSON with keys: name, location, employer, confidence, emails, usernames. "
        "Use confidence between 0 and 1.\n\n"
        f"URL: {url}\n"
        f"TEXT_SNIPPET:\n{text[:12000]}"
    )
    try:
        payload = await llm.generate_json(prompt=prompt, system=system, max_tokens=512)
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:  # pragma: no cover - provider/network failures
        logger.warning("profile_llm_extraction_failed", url=url, error=str(exc))
        return {}


async def _fetch_profile_page(url: str, browser: PlaywrightClient | None) -> dict:
    if browser is not None:
        return await browser.fetch(url)

    try:
        async with AsyncSession(impersonate="chrome120") as session:
            response = await session.get(url, timeout=10, allow_redirects=True)
            return {
                "url": url,
                "final_url": str(response.url),
                "html": str(response.text or ""),
                "status": int(response.status_code or 0),
            }
    except Exception:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/123.0.0.0 Safari/537.36"
                    )
                },
            ) as client:
                response = await client.get(url)
                return {
                    "url": url,
                    "final_url": str(response.url),
                    "html": response.text or "",
                    "status": int(response.status_code or 0),
                }
        except Exception as exc:
            logger.warning("profile_fetch_failed", url=url, error=str(exc))
            return {"url": url, "final_url": url, "html": "", "status": 0, "error": str(exc)}


def _extract_with_trafilatura(url: str, html: str) -> dict:
    settings = get_settings()
    if not settings.osint_enable_trafilatura or trafilatura_extract is None or not html:
        return {}

    try:
        payload = trafilatura_extract(
            html,
            url=url,
            output_format="json",
            with_metadata=True,
            include_links=True,
            favor_precision=True,
            deduplicate=True,
        )
        if not payload:
            return {}
        parsed = _json.loads(payload)
        if not isinstance(parsed, dict):
            return {}
    except Exception as exc:
        logger.debug("profile_trafilatura_failed", url=url, error=str(exc))
        return {}

    text_parts = [
        str(parsed.get("title") or "").strip(),
        str(parsed.get("description") or "").strip(),
        str(parsed.get("author") or "").strip(),
        str(parsed.get("text") or "").strip(),
    ]
    text_blob = " ".join(part for part in text_parts if part)
    location_match = LOCATION_REGEX.search(text_blob)
    employer_match = EMPLOYER_REGEX.search(text_blob)

    usernames: list[str] = []
    for value in [url, text_blob[:400]]:
        for match in HANDLE_REGEX.findall(value):
            candidate = match.strip().lower()
            if is_plausible_username(candidate):
                usernames.append(candidate)

    return {
        "name": str(parsed.get("author") or parsed.get("title") or "").strip() or None,
        "location": ", ".join(location_match.groups()) if location_match else None,
        "employer": employer_match.group(1).strip() if employer_match else None,
        "emails": sorted(set(EMAIL_REGEX.findall(text_blob))),
        "discovered_usernames": list(dict.fromkeys(usernames))[:8],
        "text_blob": text_blob,
    }


async def scrape_profile(
    url: str,
    browser: PlaywrightClient | None,
    llm: BaseLLMClient | None = None,
) -> dict:
    candidate = is_profile_candidate_url(url)
    result = await _fetch_profile_page(url, browser)
    final_url = str(result.get("final_url") or url)
    candidate = candidate or is_profile_candidate_url(final_url)
    html = result.get("html") or ""
    if not html:
        return {
            "name": None,
            "location": None,
            "employer": None,
            "job_title": None,
            "confidence": 0.0,
            "evidence_url": None,
            "url": final_url,
            "discovered_emails": [],
            "discovered_usernames": _extract_usernames_from_url(final_url),
            "same_as_urls": [],
            "social_handles": {},
            "image_url": None,
            "is_profile_candidate": candidate,
        }

    fast = _extract_from_html(html)
    extracted = _extract_with_trafilatura(final_url, html)

    name = fast.get("name") or extracted.get("name")
    location = fast.get("location") or extracted.get("location")
    employer = fast.get("employer") or extracted.get("employer")
    job_title = fast.get("job_title")
    discovered_emails = sorted({*(fast.get("emails") or []), *(extracted.get("emails") or [])})
    discovered_usernames = sorted(
        {
            *_extract_usernames_from_url(final_url),
            *list(extracted.get("discovered_usernames") or []),
        }
    )
    same_as_urls = list(fast.get("same_as_urls") or [])
    social_handles = dict(fast.get("social_handles") or {})
    image_url = fast.get("image_url")

    confidence = _confidence(name, location, employer)
    if candidate and browser is not None and confidence < 0.8:
        llm_input = str(extracted.get("text_blob") or fast.get("text_blob") or html)
        llm_payload = await _extract_with_llm(final_url, llm_input, llm)
        name = name or llm_payload.get("name")
        location = location or llm_payload.get("location")
        employer = employer or llm_payload.get("employer")

        llm_confidence = llm_payload.get("confidence")
        if isinstance(llm_confidence, (float, int)):
            confidence = max(confidence, min(float(llm_confidence), 1.0))
        else:
            confidence = max(confidence, _confidence(name, location, employer))

        llm_emails = llm_payload.get("emails") or []
        if isinstance(llm_emails, list):
            discovered_emails = sorted(
                {*discovered_emails, *[str(item) for item in llm_emails if item]}
            )

        llm_usernames = llm_payload.get("usernames") or []
        if isinstance(llm_usernames, list):
            discovered_usernames = sorted(
                {
                    *discovered_usernames,
                    *[str(item) for item in llm_usernames if item],
                }
            )

        llm_same_as = llm_payload.get("same_as_urls") or []
        if isinstance(llm_same_as, list):
            same_as_urls = sorted({*same_as_urls, *[str(item) for item in llm_same_as if item]})

        llm_job_title = llm_payload.get("job_title")
        if llm_job_title and not job_title:
            job_title = str(llm_job_title)

        llm_social = llm_payload.get("social_handles") or {}
        if isinstance(llm_social, dict):
            social_handles = {
                **social_handles,
                **{str(k): str(v) for k, v in llm_social.items() if v},
            }

        llm_image = llm_payload.get("image_url")
        if llm_image and not image_url:
            image_url = str(llm_image)

    evidence_url = None
    if browser is not None and candidate and confidence > 0.8 and (name or location):
        screenshot = await browser.capture_screenshot(final_url)
        if screenshot:
            parsed = urlparse(final_url)
            host = (parsed.netloc or "profile").replace(":", "-")
            filename = f"{host}-evidence.png"
            try:
                evidence_url = await upload_evidence(screenshot, filename, "image/png")
            except Exception as exc:  # pragma: no cover - external storage failures
                logger.warning("profile_evidence_upload_failed", url=final_url, error=str(exc))

    return {
        "name": name,
        "location": location,
        "employer": employer,
        "job_title": job_title,
        "confidence": round(confidence, 4),
        "evidence_url": evidence_url,
        "url": final_url,
        "discovered_emails": discovered_emails,
        "discovered_usernames": discovered_usernames,
        "same_as_urls": same_as_urls,
        "social_handles": social_handles,
        "image_url": image_url,
        "is_profile_candidate": candidate,
    }
