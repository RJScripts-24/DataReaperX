from __future__ import annotations

import asyncio
import threading
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

import httpx

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger
from datareaper.integrations.browser.playwright_client import PlaywrightClient
from datareaper.osint.account_discovery import discover_accounts
from datareaper.osint.collectors.github_pivot import github_deep_pivot, github_usernames_from_email
from datareaper.osint.collectors.gravatar_lookup import lookup_gravatar
from datareaper.osint.collectors.paste_site_search import search_paste_sites
from datareaper.osint.collectors.platform_prober import probe_usernames
from datareaper.osint.collectors.profile_scraper import is_profile_candidate_url, scrape_profile
from datareaper.osint.collectors.search_probe import build_search_queries, search_public_web
from datareaper.osint.collectors.sherlock_runner import discover_profiles_via_username_tools
from datareaper.osint.graph_builder import build_graph
from datareaper.osint.identity_resolver import resolve_identity
from datareaper.osint.username_discovery import discover_usernames, is_plausible_username
from datareaper.realtime.channels import DASHBOARD_CHANNEL
from datareaper.realtime.publishers import publish

logger = get_logger(__name__)
DEFAULT_TARGETS: list[str] = []
SiteFoundCallback = Callable[[dict], Awaitable[None] | None]
ShouldStopCallback = Callable[[], Awaitable[bool] | bool]


def _add_username(container: set[str], value: str | None) -> None:
    candidate = str(value or "").strip().lower().lstrip("@")
    if is_plausible_username(candidate):
        container.add(candidate)


async def _run_health_check(browser: PlaywrightClient | None) -> dict[str, bool]:
    """Quick transport sanity checks to separate network, bot, and logic failures."""
    results: dict[str, bool] = {
        "httpx": False,
        "curl_cffi_github": False,
        "playwright": False,
    }

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get("https://httpbin.org/get")
            results["httpx"] = response.status_code == 200
    except Exception:
        results["httpx"] = False

    try:
        from curl_cffi.requests import AsyncSession

        async with AsyncSession(impersonate="chrome120") as session:
            response = await session.get("https://github.com/torvalds", timeout=8)
            results["curl_cffi_github"] = "linus torvalds" in str(response.text or "").lower()
    except Exception:
        results["curl_cffi_github"] = False

    if browser is not None:
        try:
            page = await browser.fetch("https://example.com")
            results["playwright"] = "example domain" in str(page.get("html") or "").lower()
        except Exception:
            results["playwright"] = False

    logger.info("pipeline_health_check", **results)
    return results


async def _publish_stage(event: dict) -> None:
    try:
        await publish(DASHBOARD_CHANNEL, event)
    except Exception:  # pragma: no cover - event bus failures are non-fatal for pipeline
        logger.debug("osint_publish_failed", event=event)


def _site_label_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower().split(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


async def _notify_site_found(callback: SiteFoundCallback | None, payload: dict) -> None:
    if callback is None:
        return
    try:
        result = callback(payload)
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        logger.debug("osint_site_found_callback_failed", payload=payload)


async def _should_stop_scan(callback: ShouldStopCallback | None) -> bool:
    if callback is None:
        return False
    try:
        result = callback()
        if asyncio.iscoroutine(result):
            return bool(await result)
        return bool(result)
    except Exception:
        logger.debug("osint_should_stop_check_failed")
        return False


async def _stop_requested(
    callback: ShouldStopCallback | None,
    boot_log: list[str],
    message: str,
) -> bool:
    if not await _should_stop_scan(callback):
        return False
    boot_log.append(message)
    return True


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    payload: dict = {}
    error: Exception | None = None

    def _runner() -> None:
        nonlocal payload, error
        try:
            payload = asyncio.run(coro)
        except Exception as exc:  # pragma: no cover - thread execution edge cases
            error = exc

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if error is not None:
        raise error
    return payload


async def run_osint_loop(
    seeds: list[str],
    max_depth: int = 2,
    llm=None,
    browser: PlaywrightClient | None = None,
    on_site_found: SiteFoundCallback | None = None,
    should_stop: ShouldStopCallback | None = None,
) -> dict:
    cleaned = [str(seed).strip() for seed in seeds if str(seed).strip()]
    if not cleaned:
        return {
            "accounts": [],
            "usernames": [],
            "identity": {"real_name": None, "location": None, "employer": None},
            "graph": {"nodes": [], "edges": []},
            "boot_log": ["No valid seeds provided."],
            "profiles": [],
            "discovered_urls": [],
        }

    accounts_by_url: dict[str, dict] = {}
    profiles_by_url: dict[str, dict] = {}
    discovered_usernames: set[str] = set()
    discovered_urls: set[str] = set()
    known_identifiers: set[str] = set(cleaned)
    pending_identifiers: set[str] = set(cleaned)
    boot_log: list[str] = []
    settings = get_settings()
    use_browser_layers = settings.osint_enable_playwright_layers
    owned_browser = use_browser_layers and browser is None
    active_browser = browser if use_browser_layers else None
    if use_browser_layers and active_browser is None:
        active_browser = PlaywrightClient()
    if owned_browser and active_browser is not None:
        await active_browser.start()

    try:
        health = await _run_health_check(active_browser)
        boot_log.append(
            "Health check: "
            f"httpx={'ok' if health.get('httpx') else 'fail'}, "
            f"curl_cffi_github={'ok' if health.get('curl_cffi_github') else 'fail'}, "
            f"playwright={'ok' if health.get('playwright') else 'fail'}."
        )

        if not health.get("httpx") and not health.get("curl_cffi_github") and not health.get("playwright"):
            boot_log.append("Health check failed on all transports; aborting crawl.")
            return {
                "accounts": [],
                "usernames": [],
                "identity": {"real_name": None, "location": None, "employer": None},
                "graph": {"nodes": [], "edges": []},
                "boot_log": boot_log,
                "profiles": [],
                "discovered_urls": [],
            }

        for depth in range(1, max_depth + 1):
            if await _should_stop_scan(should_stop):
                boot_log.append("Stop requested. Ending OSINT crawl loop.")
                break

            if not pending_identifiers:
                boot_log.append("No new identifiers left to pivot.")
                break

            current_identifiers = sorted(pending_identifiers)
            pending_identifiers.clear()
            boot_log.append(
                f"Depth {depth}: scanning {len(current_identifiers)} identifier(s) "
                "across OSINT layers."
            )
            await _publish_stage(
                {
                    "type": "osint_depth_started",
                    "depth": depth,
                    "identifiers": len(current_identifiers),
                }
            )

            email_seeds = [item for item in current_identifiers if "@" in item]
            newly_discovered_urls: set[str] = set()

            if depth == 1:
                for email_seed in email_seeds:
                    gravatar = await lookup_gravatar(email_seed)
                    if gravatar:
                        for linked in gravatar.get("linked_accounts") or []:
                            url = str(linked.get("url") or "")
                            if url and url not in discovered_urls and url not in newly_discovered_urls:
                                newly_discovered_urls.add(url)
                                await _notify_site_found(
                                    on_site_found,
                                    {
                                        "url": url,
                                        "source": "gravatar",
                                        "site": _site_label_from_url(url),
                                        "data_types": ["Email"],
                                        "confidence": 82,
                                    },
                                )
                        username = gravatar.get("preferred_username")
                        if username:
                            _add_username(discovered_usernames, str(username))
                    boot_log.append(
                        f"Layer 0 (gravatar): {'hit' if gravatar else 'miss'} for {email_seed}."
                    )
                if await _stop_requested(
                    should_stop,
                    boot_log,
                    f"Stop requested during depth {depth} after gravatar lookup.",
                ):
                    break

            account_runs = await asyncio.gather(
                *[discover_accounts(seed) for seed in email_seeds],
                return_exceptions=True,
            )

            new_accounts: list[dict] = []
            for seed_value, result in zip(email_seeds, account_runs, strict=False):
                if isinstance(result, Exception):
                    logger.warning(
                        "osint_account_discovery_failed",
                        seed=seed_value,
                        error=str(result),
                    )
                    continue
                for account in result:
                    account_row = {
                        "platform": account.get("platform") or account.get("name"),
                        "username": account.get("username"),
                        "url": account.get("url"),
                        "confidence": account.get("confidence", 85),
                    }
                    url = str(account_row.get("url") or "")
                    key = url or f"{account_row.get('platform')}:{seed_value}"
                    if key in accounts_by_url:
                        continue
                    accounts_by_url[key] = account_row
                    new_accounts.append(account_row)
                    if url and url not in discovered_urls and url not in newly_discovered_urls:
                        newly_discovered_urls.add(url)
                        await _notify_site_found(
                            on_site_found,
                            {
                                "url": url,
                                "source": "holehe",
                                "site": _site_label_from_url(url),
                                "data_types": ["Email"],
                                "confidence": int(account_row.get("confidence") or 85),
                            },
                        )

            boot_log.append(
                f"Layer 1 (holehe): discovered {len(new_accounts)} new account record(s)."
            )
            await _publish_stage(
                {
                    "type": "osint_layer_complete",
                    "layer": "holehe",
                    "depth": depth,
                    "new_accounts": len(new_accounts),
                }
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after holehe discovery.",
            ):
                break

            expanded_usernames = await discover_usernames(
                list(accounts_by_url.values()),
                original_seeds=sorted(known_identifiers),
            )
            discovered_usernames.update(
                username for username in expanded_usernames if is_plausible_username(username)
            )

            github_email_usernames: set[str] = set()
            if email_seeds:
                github_email_runs = await asyncio.gather(
                    *[
                        github_usernames_from_email(
                            email_seed,
                            token=settings.github_api_token or None,
                        )
                        for email_seed in email_seeds
                    ],
                    return_exceptions=True,
                )
                for email_seed, result in zip(email_seeds, github_email_runs, strict=False):
                    if isinstance(result, Exception):
                        logger.warning(
                            "osint_github_email_lookup_failed",
                            seed=email_seed,
                            error=str(result),
                        )
                        continue

                    for row in result:
                        username = str(row.get("username") or "").strip().lower()
                        url = str(row.get("url") or "").strip()
                        if not username:
                            continue

                        _add_username(discovered_usernames, username)
                        if is_plausible_username(username):
                            github_email_usernames.add(username)

                        account_key = url or f"github:{username}"
                        if account_key not in accounts_by_url:
                            account_row = {
                                "platform": "github",
                                "username": username,
                                "url": url,
                                "confidence": 92,
                            }
                            accounts_by_url[account_key] = account_row
                            new_accounts.append(account_row)

                        if url and url not in discovered_urls and url not in newly_discovered_urls:
                            newly_discovered_urls.add(url)
                            await _notify_site_found(
                                on_site_found,
                                {
                                    "url": url,
                                    "source": "github_email_lookup",
                                    "site": _site_label_from_url(url),
                                    "data_types": ["Email"],
                                    "confidence": 92,
                                },
                            )

            boot_log.append(
                f"Layer 1.55 (github email lookup): {len(github_email_usernames)} username(s) "
                f"found from {len(email_seeds)} email seed(s)."
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after GitHub email lookup.",
            ):
                break

            maigret_hits: list[dict] = []
            maigret_candidates = list(discovered_usernames)[: max(1, settings.osint_maigret_candidates)]
            if settings.osint_enable_maigret and maigret_candidates:
                maigret_hits = await discover_profiles_via_username_tools(
                    maigret_candidates,
                    active_browser if settings.osint_enable_platform_browser_fallback else None,
                )
                for hit in maigret_hits:
                    url = str(hit.get("url") or "")
                    if url and url not in discovered_urls and url not in newly_discovered_urls:
                        newly_discovered_urls.add(url)
                        await _notify_site_found(
                            on_site_found,
                            {
                                "url": url,
                                "source": "maigret",
                                "site": _site_label_from_url(url),
                                "data_types": ["Email"],
                                "confidence": 88,
                            },
                        )

                    uname = str(hit.get("username") or "").strip().lower()
                    _add_username(discovered_usernames, uname)

                    key = url or f"{hit.get('site')}:{uname}"
                    if key not in accounts_by_url:
                        account_row = {
                            "platform": hit.get("site"),
                            "username": hit.get("username"),
                            "url": url,
                            "confidence": 88,
                        }
                        accounts_by_url[key] = account_row
                        new_accounts.append(account_row)

            boot_log.append(
                f"Layer 1.58 (maigret): {len(maigret_hits)} profile hit(s) "
                f"across {len(maigret_candidates)} username(s)."
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after Maigret discovery.",
            ):
                break

            platform_candidates = list(discovered_usernames)[: max(1, settings.osint_platform_probe_candidates)]
            platform_hits = await probe_usernames(
                platform_candidates,
                active_browser,
                allow_browser_fallback=settings.osint_enable_platform_browser_fallback,
            )
            for hit in platform_hits:
                url = str(hit.get("url") or "")
                if url and url not in discovered_urls and url not in newly_discovered_urls:
                    newly_discovered_urls.add(url)
                    await _notify_site_found(
                        on_site_found,
                        {
                            "url": url,
                            "source": "platform_probe",
                            "site": _site_label_from_url(url),
                            "data_types": ["Email"],
                            "confidence": 90,
                        },
                    )

                uname = str(hit.get("username") or "").strip().lower()
                _add_username(discovered_usernames, uname)

                key = url or f"{hit.get('platform')}:{uname}"
                if key not in accounts_by_url:
                    account_row = {
                        "platform": hit.get("platform"),
                        "username": hit.get("username"),
                        "url": url,
                        "confidence": 90,
                    }
                    accounts_by_url[key] = account_row
                    new_accounts.append(account_row)

            boot_log.append(
                f"Layer 1.5 (platform probe): {len(platform_hits)} profile hit(s) "
                f"across {len(platform_candidates)} username(s)."
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after platform probing.",
            ):
                break

            github_usernames_to_pivot = {
                str(hit.get("username") or "").strip().lower()
                for hit in platform_hits
                if str(hit.get("platform") or "").lower() == "github"
                and str(hit.get("username") or "").strip()
            }
            github_usernames_to_pivot.update(github_email_usernames)

            for username in sorted(github_usernames_to_pivot):
                if not username:
                    continue
                pivot = await github_deep_pivot(username, token=settings.github_api_token or None)
                for commit_email in pivot.get("commit_emails") or []:
                    value = str(commit_email).strip().lower()
                    if value and value not in known_identifiers:
                        known_identifiers.add(value)
                        pending_identifiers.add(value)
                twitter_username = str(pivot.get("twitter_username") or "").strip()
                if twitter_username:
                    _add_username(discovered_usernames, twitter_username)
                blog_url = str(pivot.get("blog") or "").strip()
                if (
                    blog_url.startswith("http")
                    and blog_url not in discovered_urls
                    and blog_url not in newly_discovered_urls
                ):
                    newly_discovered_urls.add(blog_url)
                    await _notify_site_found(
                        on_site_found,
                        {
                            "url": blog_url,
                            "source": "github_pivot",
                            "site": _site_label_from_url(blog_url),
                            "data_types": ["Email"],
                            "confidence": 76,
                        },
                    )

            boot_log.append(
                "Layer 1.6 (github api): "
                f"{len(github_usernames_to_pivot)} github account(s) pivoted."
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after GitHub pivoting.",
            ):
                break

            layer2_urls: set[str] = set()
            if settings.osint_enable_search_probe:
                search_queries = build_search_queries(
                    usernames=sorted(discovered_usernames)[:8],
                    emails=email_seeds,
                )

                search_runs = await asyncio.gather(
                    *[search_public_web(query, active_browser) for query in search_queries],
                    return_exceptions=True,
                )
                for result in search_runs:
                    if isinstance(result, Exception):
                        logger.warning("osint_search_probe_failed", error=str(result))
                        continue
                    for url in result:
                        if url and url not in discovered_urls and url not in newly_discovered_urls:
                            layer2_urls.add(url)
                            newly_discovered_urls.add(url)
                            await _notify_site_found(
                                on_site_found,
                                {
                                    "url": url,
                                    "source": "search_probe",
                                    "site": _site_label_from_url(url),
                                    "data_types": ["Email"],
                                    "confidence": 72,
                                },
                            )

            boot_log.append(
                f"Layer 2 (search probe): discovered {len(layer2_urls)} new URL(s)."
            )
            await _publish_stage(
                {
                    "type": "osint_layer_complete",
                    "layer": "search_probe",
                    "depth": depth,
                    "new_urls": len(layer2_urls),
                }
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after search probing.",
            ):
                break

            if depth == 1 and settings.osint_enable_paste_search and active_browser is not None:
                paste_total = 0
                for email_seed in email_seeds:
                    paste_urls = await search_paste_sites(email_seed, active_browser)
                    paste_total += len(paste_urls)
                    for url in paste_urls:
                        if url and url not in discovered_urls and url not in newly_discovered_urls:
                            newly_discovered_urls.add(url)
                            await _notify_site_found(
                                on_site_found,
                                {
                                    "url": url,
                                    "source": "paste_site",
                                    "site": _site_label_from_url(url),
                                    "data_types": ["Email"],
                                    "confidence": 80,
                                },
                            )
                boot_log.append(f"Layer 2.8 (paste sites): {paste_total} URL(s) found.")
            else:
                paste_total = 0
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after paste search.",
            ):
                break

            discovered_urls.update(newly_discovered_urls)

            urls_to_scrape = [
                url
                for url in sorted(discovered_urls)
                if url not in profiles_by_url and is_profile_candidate_url(url)
            ]
            skipped_non_profile_urls = max(0, len(discovered_urls) - len(profiles_by_url) - len(urls_to_scrape))
            scrape_runs = await asyncio.gather(
                *[scrape_profile(url, active_browser, llm) for url in urls_to_scrape],
                return_exceptions=True,
            )
            new_profiles = 0
            for url, result in zip(urls_to_scrape, scrape_runs, strict=False):
                if isinstance(result, Exception):
                    logger.warning("osint_profile_scrape_failed", url=url, error=str(result))
                    continue
                profiles_by_url[url] = result
                new_profiles += 1

                can_pivot_email = bool(result.get("is_profile_candidate")) and float(
                    result.get("confidence") or 0.0
                ) >= 0.75
                for email in result.get("discovered_emails", []) or []:
                    if not can_pivot_email:
                        continue
                    value = str(email).strip().lower()
                    if value and value not in known_identifiers:
                        known_identifiers.add(value)
                        pending_identifiers.add(value)

                for same_as_url in result.get("same_as_urls") or []:
                    url_val = str(same_as_url).strip()
                    if url_val and url_val not in discovered_urls and url_val not in newly_discovered_urls:
                        newly_discovered_urls.add(url_val)
                        await _notify_site_found(
                            on_site_found,
                            {
                                "url": url_val,
                                "source": "profile_scraper",
                                "site": _site_label_from_url(url_val),
                                "data_types": ["Email"],
                                "confidence": 84,
                            },
                        )

                for username in result.get("discovered_usernames", []) or []:
                    value = str(username).strip().lower()
                    _add_username(discovered_usernames, value)
                    if value and value not in known_identifiers:
                        known_identifiers.add(value)
                        pending_identifiers.add(value)

            discovered_urls.update(newly_discovered_urls)

            boot_log.append(
                f"Layer 3 (smart scraper): analyzed {new_profiles} new profile page(s)."
            )
            if skipped_non_profile_urls:
                boot_log.append(
                    f"Layer 3 (smart scraper): skipped {skipped_non_profile_urls} non-profile URL(s)."
                )
            await _publish_stage(
                {
                    "type": "osint_layer_complete",
                    "layer": "smart_scraper",
                    "depth": depth,
                    "new_profiles": new_profiles,
                }
            )
            if await _stop_requested(
                should_stop,
                boot_log,
                f"Stop requested during depth {depth} after profile scraping.",
            ):
                break

            depth_signal = (
                len(new_accounts)
                + len(layer2_urls)
                + paste_total
                + new_profiles
            )
            if depth_signal == 0:
                boot_log.append(
                    f"Depth {depth}: zero successful layer outputs; "
                    "stopping early to avoid silent failure cascade."
                )
                break

            email_pivots = {item for item in pending_identifiers if "@" in item}
            if not email_pivots:
                boot_log.append(
                    f"Depth {depth}: no new email pivots found "
                    f"({len(pending_identifiers)} non-email identifiers skipped); "
                    "stopping recursion."
                )
                break
            pending_identifiers = email_pivots

        profiles = list(profiles_by_url.values())
        identity_llm = llm
        if await _should_stop_scan(should_stop):
            boot_log.append("Stop requested after crawl; skipping identity LLM synthesis.")
            identity_llm = None
        identity = await resolve_identity(profiles, identity_llm)
        graph = build_graph(
            cleaned[0],
            [str(row.get("platform") or "unknown") for row in accounts_by_url.values()],
            DEFAULT_TARGETS,
            sorted(discovered_usernames),
            {
                "name": identity.get("real_name") or identity.get("name"),
                "location": identity.get("location"),
            },
        )
        return {
            "accounts": list(accounts_by_url.values()),
            "usernames": sorted(discovered_usernames),
            "identity": identity,
            "graph": graph,
            "boot_log": boot_log,
            "profiles": profiles,
            "discovered_urls": sorted(discovered_urls),
        }
    finally:
        if owned_browser and active_browser is not None:
            await active_browser.stop()


def run_pipeline(seed: str) -> dict:
    return _run_async(run_osint_loop([seed], max_depth=2))
