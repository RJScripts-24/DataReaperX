# pip install seleniumbase
# On Linux without display, run: Xvfb :99 -screen 0 1280x720x24 &
# Then set: export DISPLAY=:99

from __future__ import annotations

import os
import platform
import shutil
import time

from loguru import logger
from selenium.common.exceptions import WebDriverException
from seleniumbase import SB


def is_display_available() -> bool:
    """Check whether UC mode can render with a visible display.

    Args:
        None.

    Returns:
        True when a display is available for non-headless UC mode, otherwise False.
    """
    if platform.system() != "Linux":
        return True

    display = os.getenv("DISPLAY")
    if display:
        return True

    return shutil.which("Xvfb") is not None


def _detect_waf_type(page_title: str) -> str:
    title = page_title.lower()
    if "just a moment" in title or "cloudflare" in title:
        return "cloudflare"
    if "datadome" in title:
        return "datadome"
    if "perimeter" in title or "human verification" in title:
        return "perimeterx"
    if "captcha" in title:
        return "captcha"
    return "unknown"


def scrape_with_uc(url: str, wait_for_selector: str | None = None) -> str:
    """Scrape a page with SeleniumBase UC mode for anti-bot bypass.

    Args:
        url: Target URL to fetch.
        wait_for_selector: Optional selector to wait for after page load.

    Returns:
        Full page source HTML.
    """
    if not is_display_available():
        raise RuntimeError(
            "UC mode requires a visible display. No DISPLAY detected on Linux environment."
        )

    max_attempts = 3
    delay_seconds = 5

    for attempt in range(1, max_attempts + 1):
        try:
            with SB(uc=True, headless=False) as sb:
                sb.uc_open_with_reconnect(url, reconnect_time=4)
                title = sb.get_title() or ""
                waf_type = _detect_waf_type(title)
                logger.info(
                    "[UC] attempt={} url={} title={} waf_type={}",
                    attempt,
                    url,
                    title,
                    waf_type,
                )
                if wait_for_selector:
                    sb.wait_for_element(wait_for_selector)
                return sb.get_page_source()
        except WebDriverException as exc:
            logger.warning(
                "[UC] attempt={} failed for {} with WebDriverException: {}",
                attempt,
                url,
                exc,
            )
            if attempt >= max_attempts:
                raise
            time.sleep(delay_seconds)

    raise RuntimeError("UC scraping failed unexpectedly after retries")


__all__ = ["is_display_available", "scrape_with_uc"]